/**
 * What to ask Gemini to SAY and PLAY: voice lines (text-to-speech) and music
 * (Lyria). Every physical sound (footsteps, boings, zaps, pops) stays
 * synthesised in src/core/sfx.ts: no available model makes sound effects.
 *
 * Copied in shape from ../slingshot, with its lessons:
 *
 *  - **Direction must not be spoken.** A director's-notes prompt where only
 *    the TRANSCRIPT is read aloud (`voicePrompt`).
 *  - **Cartoonish means short and high.** Lines are one or two words.
 *  - **Characters shouldn't talk too much.** This game has fewer lines than
 *    slingshot, and the game rate-limits them (src/core/cast.ts).
 *  - **Ellie plays at natural speed** (`rate: 1`), so she never sounds like the
 *    sped-up baddie.
 */

/** Same profile as slingshot, so she's the same girl in every game. */
const ELLIE = {
  voice: 'Zephyr',
  rate: 1,
  profile:
    'a little cartoon girl from a children\'s TV cartoon, about five years old: high, bright, squeaky ' +
    'and bouncy, innocent and goofy, like an animated kid sidekick. NOT grown-up, NOT breathy, NOT ' +
    'soft or sultry: a loud happy little kid',
};

/** The storm-cloud king. Squeaky and sped up, like slingshot's raccoons. */
const STORM = {
  voice: 'Puck',
  rate: 1.3,
  profile:
    'a tiny squeaky cartoon storm cloud from a children\'s TV cartoon: a puffed-up grumpy little ' +
    'blusterer with a high, nasal, silly voice, all bluster and no bite, never scary',
};

function line(id, who, style, text) {
  return { id, kind: 'voice', who, style, text };
}

export const SOUNDS = [
  // --- Ellie: a few, short --------------------------------------------------------
  line('e.letsgo', ELLIE, 'excited, ready to run', "Let's go!"),
  line('e.whee', ELLIE, 'delighted, mid-leap', 'Whee!'),
  line('e.yay', ELLIE, 'delighted, cheering', 'Yay!'),
  line('e.gotit', ELLIE, 'proud, quick', 'Got it!'),
  line('e.uhoh', ELLIE, 'surprised, then giggly', 'Uh-oh!'),
  line('e.wow', ELLIE, 'wide-eyed amazement', 'Woooow!'),
  line('e.again', ELLIE, 'cheerful, eager to play more', 'Again!'),

  // --- The storm king: three lines, all of them bluster ---------------------------
  line('b.hello', STORM, 'puffed-up, blustering', 'Rumble rumble!'),
  line('b.hey', STORM, 'indignant, quick', 'Hey!'),
  line('b.bye', STORM, 'suddenly cheerful, floating off', 'Bye-bye!'),

  // --- Music (Lyria) ---------------------------------------------------------------
  // Each comes back as ~30 s that may fade at the end; src/core/audio.ts finds
  // the steady part and crossfades it into a seamless loop.
  {
    id: 'music.title',
    kind: 'music',
    prompt:
      "A sparkly, dreamy title theme for a children's cartoon game about a little girl running " +
      'through a rainbow meadow full of unicorns: glockenspiel and celesta melody, soft ukulele, ' +
      'warm pizzicato strings, a gentle shaker, 100 bpm, magical and happy. Steady the whole way ' +
      'through: no long intro, no ending, no fade-out. Instrumental, no vocals.',
  },
  {
    id: 'music.day',
    kind: 'music',
    prompt:
      "Bouncy, energetic, joyful running music for a children's cartoon endless-runner game in a " +
      'sunny rainbow meadow: driving ukulele strums, bright glockenspiel melody, hand claps, light ' +
      'drums with a skipping beat, a cheerful whistle, 132 bpm. Gentle enough to play under sound ' +
      'effects. A steady groove the whole way through: no intro, no build-up, no ending and no ' +
      'fade-out, so it can loop. Instrumental, no vocals.',
  },
  {
    id: 'music.night',
    kind: 'music',
    prompt:
      "Magical, twinkly night-time running music for a children's cartoon endless-runner game under " +
      'the stars and fireworks: celesta and music-box melody, soft marimba, warm synth pads, a light ' +
      'skipping beat with soft drums, 132 bpm, wondrous and happy, never scary. Gentle enough to play ' +
      'under sound effects. A steady groove the whole way through: no intro, no ending and no ' +
      'fade-out, so it can loop. Instrumental, no vocals.',
  },
  {
    id: 'music.boss',
    kind: 'music',
    prompt:
      "Silly, bouncy cartoon 'big baddie' music for a children's game where a grumpy storm cloud " +
      'blusters about: oompah tuba, plucky pizzicato, timpani rolls, cheeky bassoon, playful brass ' +
      'stabs, 138 bpm, exciting but funny, never scary. A steady groove the whole way through: no ' +
      'intro, no ending and no fade-out, so it can loop. Instrumental, no vocals.',
  },
];

/** The TTS prompt. Only the TRANSCRIPT section is spoken. */
export function voicePrompt(s) {
  return [
    `# AUDIO PROFILE: ${s.who.profile}`,
    "## DIRECTOR'S NOTES",
    `Style: ${s.style}. Cartoon voice acting, short, punchy and high-pitched.`,
    '#### TRANSCRIPT',
    s.text,
  ].join('\n');
}
