/**
 * What art to generate for the RAINBOW theme, and the prompt for each piece.
 *
 * This file is the art direction; `generate-art.mjs` is plumbing (copied from
 * ../slingshot). The plan, and why each rule is here, is ART-PLAN.md.
 *
 * Rules inherited from ../tower-defense and ../slingshot, each learned the hard way:
 *
 *  1. **One shared style paragraph** and one subject per piece.
 *  2. **A character's poses are ONE image.** Two calls are two characters.
 *  3. **Say the grid as a count**, loudly. The model draws the grid it likes,
 *     and `__game.checkArt()` must pass after every run.
 *  4. **Pose sheets face RIGHT**, because that's what the model draws anyway;
 *     the loader mirrors whatever needs to face left (the unicorn).
 *
 * And this game's own rule, the one everything else serves: **"which verb does
 * this hazard want?"** must stay instant. So every hazard keeps its own colour
 * family (purple = the unicorn you JUMP, pink-and-blue = the castle you SLIDE
 * under, grey = the cloud you SHOOT) and nothing in the background may borrow
 * a hazard's shape: no castles, no unicorns, no grey clouds.
 */

// --- Shared prompt parts -----------------------------------------------------

const KEY_BACKGROUND = [
  'THE BACKGROUND MUST BE FLAT SOLID CHROMA-KEY GREEN, hex #00FF00, pure saturated green,',
  'covering every pixel that is not the subject. No white, no gradient, no vignette,',
  'no shadow cast onto the background, no floor, no scenery, no border.',
].join(' ');

/** For green subjects (hills, trees): the loader keys on the corner colour, whatever it is. */
const MAGENTA_BACKGROUND = [
  'THE BACKGROUND MUST BE FLAT SOLID MAGENTA, hex #FF00FF, pure saturated magenta,',
  'covering every pixel that is not the subject. No white, no gradient, no vignette, no shadow,',
  'no sky, no border.',
].join(' ');

/** For the sparkle pop, which is drawn additively, so black adds nothing. */
const BLACK_BACKGROUND = [
  'THE BACKGROUND MUST BE PURE SOLID BLACK, hex #000000, every single pixel that is not a',
  'glowing sparkle. No haze, no ground, no scenery, no border.',
].join(' ');

const DRAW_STYLE = [
  "children's picture book illustration, soft rounded shapes,",
  'thick clean dark outlines, flat bright colours with simple soft shading, cheerful and dreamy,',
  'pastel rainbow palette of sky blue, candy pink, sunny yellow, peach and mint,',
  'no text, no letters, no watermark',
].join(' ');

const NO_GREEN = 'The subject contains NO green anywhere: no grass, no leaves, no green clothing or trim.';
const CUT_OUT = 'clean crisp edges suitable for cutting out against pure green #00FF00.';

function gridRules(cols, rows) {
  const cells = cols * rows;
  return [
    `A SPRITE SHEET laid out as a grid of ${cols} columns by ${rows} rows.`,
    `THE GRID IS EXACTLY ${cols} CELLS ACROSS AND ${rows} CELLS DOWN: ${cells} figures in total, no more and no fewer.`,
    `Do NOT add another row. Do NOT repeat a row. Do NOT draw more than ${cells} figures.`,
    'Read each row left to right, top row first.',
    'The character is IDENTICAL in every single cell: same face, same hair or fur, same size, same',
    'build, same clothes, same colours. It must be impossible to tell that any two cells were drawn',
    'separately, because they were not. ONLY THE POSE AND EXPRESSION CHANGE from cell to cell.',
    'Centre each figure in its own cell, at the same size, with its bottom at the same height in every',
    'cell of a row. EVERY figure must fit ENTIRELY INSIDE its own cell with a clear band of plain',
    'background on all four sides; nothing may touch or cross the boundary between cells, and',
    'nothing may run off the edge of the picture.',
    'Draw NO lines, borders, boxes, numbers or dividers between the cells: one single continuous',
    'flat #00FF00 background behind and between all the figures.',
    'NEVER mirror or turn the character around between cells.',
    'Colours are FIXED: use exactly the colours described, identical in every cell, for every part.',
    'Draw NOTHING except the character: no ground line, no shadow, no motion lines, no dust,',
    'no sparkles, no stray marks of any kind.',
    'Write NO WORDS anywhere in the picture: no labels, no captions and no titles under, over or',
    'beside the figures. The cell descriptions below are instructions, never text to draw.',
  ].join(' ');
}

function cellList(cells) {
  return cells.map((text, i) => `Cell ${i + 1}: ${text}`).join(' ');
}

// --- Characters ----------------------------------------------------------------

/**
 * Ellie, word for word as she is described in ../tower-defense and
 * ../slingshot, so she's the same girl in every game, in sneakers because she's
 * running. The procedural 16x24 Ellie in unicorn.ts is the same girl in a dozen
 * rectangles (pink dress, white trim, long hair); her hair was darkened to match.
 */
const ELLIE =
  'a little girl about five years old, long wavy dark brown hair past her shoulders, ' +
  'warm honey-tan skin, big brown eyes, a bright coral-pink sleeveless sundress with white trim ' +
  'at the neck and hem, and white sneakers with pink laces. Seen from the side, facing RIGHT.';

const UNICORN =
  'a chubby baby unicorn foal, small and COMPACT: about as tall, from hooves to the tip of its ' +
  'horn, as it is long from nose to tail. A pure white coat, a fluffy PURPLE mane and a fluffy ' +
  'PURPLE tail, a short golden spiral horn, big friendly dark eyes, rosy cheeks, little lilac ' +
  'hooves. Sweet and friendly, never scary. Seen from the side, facing RIGHT.';

const RAIN_CLOUD =
  'a small round puffy rain-cloud character, soft LIGHT GREY all over, every puff the same plain ' +
  'grey with NO coloured puffs and NO rainbow tints, made of four or five ' +
  'round puffs, with a little face in the middle. It is a cloud and nothing else: NO rain, NO ' +
  'raindrops, NO lightning, NO arms, nothing hanging below it. The bottom of the cloud is fairly flat.';

const STORM_KING =
  'a BIG puffy storm-cloud king: a huge round cloud made of fat puffs, dark slate-grey, with a ' +
  'small golden crown perched on top, bushy eyebrows, big round cheeks, a wide mouth and two ' +
  'tiny stubby cloud arms. Silly and grumpy, a cartoon baddie who is never scary. NO rain, NO ' +
  'lightning, nothing hanging below him.';

export const PIECES = [
  {
    // Twelve frames: the run cycle, the actions, and the moods. 4x3 like the
    // slingshot raccoon, because one image is the only way to get one Ellie.
    id: 'ellie.motion',
    aspect: '4:3',
    size: '2K',
    sheet: { cols: 4, rows: 3, align: 'floor', rowIds: ['run', 'act', 'mood'] },
    subject: ELLIE,
    cells: [
      'running, right leg reaching far forward, left leg pushing off behind, left arm swinging forward, hair streaming back.',
      'running, legs passing under her, left knee lifted high, body at its highest, arms swapping.',
      'running, left leg reaching far forward, right leg pushing off behind, right arm swinging forward.',
      'running, legs passing under her, right knee lifted high, body at its highest.',
      'jumping up, leaping, both knees tucked up, both arms raised, a delighted open-mouthed smile.',
      'falling to land, both legs stretched down to land, arms spread out for balance.',
      'sliding, a low baseball slide feet-first to the RIGHT, leaning back on one elbow almost lying ' +
        'down, both legs stretched straight out in front, hair streaming out behind. LONG AND LOW: ' +
        'this pose is about twice as wide as it is tall.',
      'casting a sparkle, running, one arm thrust straight out in front of her to the RIGHT with the ' +
        'hand open as if throwing magic, a cheeky determined grin.',
      'oops, bumped and sitting down on the ground with her legs out in front, one hand on her head, a ' +
        'sheepish surprised smile. Not hurt at all, just a bit surprised.',
      'cheering, jumping with BOTH arms straight up in the air, a huge grin, eyes squeezed shut.',
      'dizzy but happy, sitting on the ground, swaying, eyes drawn as little swirls, a wobbly happy smile.',
      'waving hello, standing, turned toward the viewer, one hand waving high, a big friendly smile.',
    ],
    extra:
      'Each pose is shown by her WHOLE BODY, not only her face, because she is drawn small in the ' +
      'game. All twelve face RIGHT. ' +
      NO_GREEN,
  },
  {
    // JUMP hazard. Mirrored at load so it faces Ellie. Row 2 is shown after
    // she's cleared it (or bumped into it), so being jumped over is fun for it too.
    id: 'unicorn.motion',
    aspect: '16:9',
    size: '2K',
    sheet: { cols: 4, rows: 2, align: 'floor', mirrored: true, rowIds: ['trot', 'happy'] },
    subject: UNICORN,
    cells: [
      'TROTTING on the spot: right front hoof lifted.',
      'trotting, all four hooves down, head bobbing up.',
      'trotting, left front hoof lifted.',
      'trotting, all four hooves down, head bobbing down.',
      'delighted, standing, head tipped right back looking UP, mouth open in a big happy smile.',
      'cheering, rearing up happily on its back legs, front hooves kicking in the air, eyes closed with joy.',
      'oops, startled, ears back, eyes wide, a small surprised "o" mouth, standing still.',
      'giggling, standing, eyes squeezed shut, mouth wide open laughing.',
    ],
    extra: NO_GREEN,
  },
  {
    // SHOOT hazard. The rain column under it is the hitbox and stays procedural,
    // and so do the armour plates: the count must be countable.
    id: 'cloud.motion',
    aspect: '16:9',
    size: '2K',
    sheet: { cols: 4, rows: 2, align: 'center', rowIds: ['grump', 'happy'] },
    subject: RAIN_CLOUD,
    cells: [
      'grumpy, frowning, eyebrows angled down, a pouting mouth.',
      'grumpy, cheeks puffed out, huffing.',
      'grumpy, eyes narrowed, a little scowl.',
      'grumpy, frowning, eyes looking to the left.',
      'bonked, eyes squeezed shut, mouth a wobbly zigzag, the puffs squashed a little.',
      'surprised, eyes wide and round, mouth a small "o".',
      'happy, now soft WHITE and fluffy, a big smile and rosy pink cheeks.',
      'happy, now soft WHITE and fluffy, eyes closed giggling, rosy pink cheeks.',
    ],
    extra:
      'The first six cells are light grey; the last two have turned soft white because the cloud is happy. ' +
      NO_GREEN,
  },
  {
    // The boss. Its core (lightning when shut, rainbow when open) stays
    // procedural on top, because shut-versus-open IS the fight.
    id: 'boss.motion',
    aspect: '16:9',
    size: '2K',
    sheet: { cols: 4, rows: 2, align: 'center', rowIds: ['fight', 'end'] },
    subject: STORM_KING,
    cells: [
      'grumpy, arms crossed, scowling, eyebrows down.',
      'puffing, cheeks blown up huge, about to blow a gust.',
      'charging, leaning forward, determined, teeth gritted in a silly grimace.',
      'open wide, mouth wide open in a big round "AHH", eyes wide, arms thrown out.',
      'bonked, eyes squeezed shut, mouth wobbling "ow!", a little squashed.',
      'dizzy, eyes drawn as spirals, tongue out, crown tipped sideways.',
      'happy, turned soft light grey and fluffy, a big smile, waving bye-bye with one arm.',
      'giggling, soft light grey and fluffy, eyes closed, laughing, crown straight again.',
    ],
    extra: 'He looks straight out at the viewer in every cell. ' + NO_GREEN,
  },
  {
    // Eight different pickups, one per cell: not a character, just one call.
    id: 'powerup.motion',
    aspect: '16:9',
    size: '2K',
    kind: 'icons',
    sheet: { cols: 4, rows: 2, align: 'center', rowIds: ['icons', 'icons'] },
    subject:
      'EIGHT different round glossy game pickup badges, one centred in each cell of a grid of 4 ' +
      'columns by 2 rows: EXACTLY eight badges, no more and no fewer, each the same size with clear ' +
      'green space all around it. Each badge is a shiny round bubble with a bold simple picture inside. ' +
      'Cell 1: a DARK STORMY GREY bubble with a winged sneaker crackling with yellow speed lightning (a risky one). ' +
      'Cell 2: a sunny yellow bubble with a bouncy coiled spring. ' +
      'Cell 3: a sky-blue bubble with a pair of fluffy white angel wings. ' +
      'Cell 4: a golden bubble with a big smiling yellow star. ' +
      'Cell 5: a pink bubble with a big sparkling ruby-red gem. ' +
      'Cell 6: a peach bubble with a magic wand shooting little stars. ' +
      'Cell 7: a sky-blue bubble with a little brass telescope. ' +
      'Cell 8: a white bubble with a big candy-pink heart.',
  },
  {
    // Drawn additively over a cleared hazard. Black, never keyed.
    id: 'pop.motion',
    aspect: '16:9',
    size: '2K',
    background: 'black',
    sheet: { cols: 4, rows: 2, align: 'center', rowIds: ['fx', 'fx'] },
    subject: 'ONE magical rainbow sparkle burst, shown as an animation in eight stages.',
    cells: [
      'a tiny bright white star flash.',
      'a bright white star bursting outward with short rainbow-coloured rays.',
      'a ring of rainbow-coloured sparkles and little stars bursting outward.',
      'a bigger ring of pink, yellow, blue and white stars and tiny hearts flying apart.',
      'stars and hearts scattered wide, starting to fade.',
      'scattered fading twinkles.',
      'a few small faint twinkles.',
      'two or three last tiny twinkles.',
    ],
  },
  {
    // SLIDE hazard. A still; its hitbox is a rectangle hanging 16px off the
    // ground, so its cloud base must be FLAT and nothing may hang below it.
    id: 'castle',
    aspect: '9:16',
    size: '1K',
    subject:
      'a small fairytale castle floating on a fluffy white cloud: a cluster of round towers with ' +
      'candy-pink walls, pointed sky-blue cone roofs, glowing golden arched windows, a little yellow ' +
      'flag on the tallest tower. The castle sits on a thick white cloud that forms its base, and the ' +
      'BOTTOM OF THE CLOUD IS FLAT AND LEVEL, a straight edge, with nothing hanging below it. The whole ' +
      'thing is TALL AND NARROW, about twice as tall as it is wide, and fills the picture from top to bottom.',
  },
];

// --- The world ----------------------------------------------------------------------

/**
 * Nothing in the background may look like an answer to a verb: no castles
 * (SLIDE), no unicorns or horses (JUMP), no grey clouds (SHOOT). Same gameplay
 * rule as slingshot's "nothing block-shaped".
 */
const NO_HAZARDS =
  'NO castles, NO buildings, NO towers, NO houses, NO animals, NO horses, NO unicorns, NO people, ' +
  'NO rainbows, NO text.';

const SKY =
  'A FLAT side-on GAME BACKGROUND for a 2D side-scrolling game, no perspective, no vanishing point. ' +
  'A big open sky fills the top two thirds of the picture, with a few soft fluffy clouds that are ' +
  'well apart from each other and do NOT touch the edges of the picture. Along the bottom third, a ' +
  'range of soft rounded distant mountains and hills, hazy and pale with distance, running the full ' +
  'width. Calm and uncluttered. ' +
  NO_HAZARDS;

const STRIP_RULES =
  'The subject runs the FULL WIDTH of the picture from the left edge to the right edge and sits ' +
  'along the BOTTOM of the picture; the bottom edge of the subject is a straight horizontal line along ' +
  'the very bottom of the picture. Flat side-on view, no perspective. ' +
  NO_HAZARDS;

PIECES.push(
  {
    id: 'sky.day',
    aspect: '21:9',
    size: '2K',
    background: 'none',
    subject:
      `${SKY} A bright morning sky, clear blue at the top fading to soft pink near the mountains, ` +
      'fluffy WHITE clouds, the mountains in soft blue and mint. NO sun, NO moon.',
  },
  {
    // Used for both SUNRISE and SUNSET: the painted low sun fits both.
    id: 'sky.dusk',
    aspect: '21:9',
    size: '2K',
    background: 'none',
    subject:
      `${SKY} A warm sunset sky in peach, pink and golden orange, with soft pink-lit clouds, a big ` +
      'low golden sun just above the mountains near the right, the mountains in dusky rose and soft blue.',
  },
  {
    id: 'sky.night',
    aspect: '21:9',
    size: '2K',
    background: 'none',
    subject:
      `${SKY} A deep indigo-blue night sky full of tiny twinkling stars, a few soft navy-blue clouds ` +
      'edged in silver moonlight, the mountains in deep navy blue. NO moon.',
  },
  {
    // The middle parallax layer. Green, so it's painted on magenta.
    id: 'hills',
    aspect: '21:9',
    size: '2K',
    background: 'magenta',
    kind: 'strip',
    subject:
      'A long strip of gentle rolling green hills, soft and rounded, with a few small round cartoon ' +
      'trees and dots of yellow and white flowers, filling the bottom HALF of the picture. ' +
      STRIP_RULES,
  },
  {
    // The near parallax layer.
    id: 'trees',
    aspect: '21:9',
    size: '2K',
    background: 'magenta',
    kind: 'strip',
    subject:
      'A row of fluffy round green bushes and round lollipop trees with yellow and white flowers, in ' +
      'clumps with gaps of open space between them, filling the bottom THIRD of the picture. ' +
      STRIP_RULES,
  },
  {
    // Tiled under the lane with every other copy mirrored.
    id: 'ground',
    aspect: '21:9',
    size: '1K',
    background: 'none',
    kind: 'strip',
    subject:
      'A side-on cross-section of the ground filling the ENTIRE picture edge to edge, like a 2D game ' +
      'ground tile: a strip of bright green grass along the very top edge with little grass blades and ' +
      'tiny daisies, and below it rich warm brown soil with small pebbles and darker layers. Flat and ' +
      'side-on, no perspective. The grass reaches the VERY TOP EDGE of the picture: there is NO sky, ' +
      'NO rainbow and NO background of any kind above the grass.',
  },
  {
    // No characters: Ellie is drawn over it from her own sheet.
    id: 'title',
    aspect: '16:9',
    size: '2K',
    background: 'none',
    subject:
      "The cover picture of a children's game, a dreamy rainbow meadow seen side-on: a big soft " +
      'rainbow arching across a bright blue sky with fluffy white clouds, rolling green hills dotted ' +
      'with flowers, a winding path. The whole CENTRE of the picture is open sky and gentle meadow, left ' +
      'empty for a title. No people, no animals, no castles, no text.',
  },
);

// --- Prompt assembly --------------------------------------------------------------

/** Composed from named parts, never by editing a finished string. */
export function promptFor(piece) {
  if (piece.background === 'magenta') {
    return [
      MAGENTA_BACKGROUND,
      piece.subject,
      'There is NO magenta or pink anywhere in the subject itself.',
      `${DRAW_STYLE}, clean crisp edges suitable for cutting out against pure magenta #FF00FF.`,
      MAGENTA_BACKGROUND,
    ].join(' ');
  }
  if (piece.background === 'black') {
    const { cols, rows } = piece.sheet;
    return [
      BLACK_BACKGROUND,
      `A grid of ${cols} columns by ${rows} rows: EXACTLY ${cols * rows} drawings, no more and no fewer,`,
      'each centred in its own cell with black space all around it, read left to right, top row first.',
      'No lines, borders or numbers between the cells.',
      `Subject: ${piece.subject}`,
      cellList(piece.cells),
      'Bold cartoon shapes like a picture book, not realistic. No text, no letters, no watermark.',
      BLACK_BACKGROUND,
    ].join(' ');
  }
  if (piece.background === 'none') {
    return `${piece.subject} ${DRAW_STYLE}. This is a full-bleed background image: it must fill the entire frame edge to edge, with no border and no chroma-key colour anywhere.`;
  }
  if (piece.kind === 'icons') {
    return [
      KEY_BACKGROUND,
      piece.subject,
      'Draw NO lines, borders or dividers between the cells: one continuous flat #00FF00 background.',
      'Bold simple shapes and a thick dark outline: each badge is drawn small in the game.',
      NO_GREEN,
      `${DRAW_STYLE}, ${CUT_OUT}`,
    ].join(' ');
  }
  if (piece.sheet) {
    const { cols, rows } = piece.sheet;
    return [
      KEY_BACKGROUND,
      gridRules(cols, rows),
      `The character: ${piece.subject}`,
      cellList(piece.cells),
      piece.extra ?? '',
      `${DRAW_STYLE}, ${CUT_OUT}`,
    ].join(' ');
  }
  return [
    KEY_BACKGROUND,
    `Subject: ${piece.subject}`,
    'A single centred subject filling most of the frame.',
    NO_GREEN,
    `${DRAW_STYLE}, ${CUT_OUT}`,
  ].join(' ');
}
