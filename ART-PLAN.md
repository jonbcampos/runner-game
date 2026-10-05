# Art and sound plan

Painted art, animation and sound for the **RAINBOW** theme of *Ellie's Rainbow Run*, using the
Gemini pipeline that `../tower-defense` built and `../slingshot` extended. **NEON stays the
procedural original**, untouched.

Read tower-defense's decisions 20, 22, 26–28, 41, 57, 61 and 65 and slingshot's 13–19 first.
Almost every rule here is one of theirs.

## The rule this game adds

The whole game is one question: **"which verb does this hazard want?"** Art is allowed to make that
question prettier and never allowed to make it harder.

- **Three colour families, one per verb**, carried over from decision 37: purple-maned white
  unicorn on the ground = JUMP; pink-and-blue castle on a cloud overhead = SLIDE; grey cloud
  with a rain column = SHOOT. No piece may borrow another family's colour.
- **Nothing in the background answers a verb.** No castles, unicorns, horses or grey clouds in
  any backdrop, the same way slingshot bans block shapes.
- **Armour plates stay procedural**, drawn over the painted cloud, so the 2–5 count is always
  countable. The rain column is the hitbox, so it stays procedural too.
- **A sprite may be smaller than its hitbox, never larger** (decision 37). Every hazard is
  fitted *inside* its box by its measured content, bottom-aligned. `__game.art.hitboxes()`
  draws the boxes over the art to check.

## What carries over unchanged

- **Art sits on top and never replaces anything.** `sprite(id)` returns null and the procedural
  painter runs. Delete `public/sprites/` and the game must still be readable. `src/game` and
  `verify()` never see the art.
- **One character = one image with all its poses.** Pose sheets face RIGHT; the unicorn is
  mirrored at load to face Ellie.
- **Flat chroma key**, flooded away in the browser; magenta for green subjects (hills, trees);
  black + additive for the sparkle pop.
- **Generate large, shrink** with `npm run art:shrink`. **`checkArt()`** after every run.
- **Animation is driven by distance, not the clock**, so a faster world runs faster legs.

## The requests (14 images)

| id | grid | what | used for |
| --- | --- | --- | --- |
| `ellie.motion` | 4×3, 4:3 | run ×4 · jump, fall, slide, sparkle-cast · oops, cheer, dizzy-happy, wave | the player |
| `unicorn.motion` | 4×2 | trot ×4 · delighted, rearing, oops, giggling | JUMP hazard; row 2 once she's cleared it |
| `castle` | still, 9:16 | castle on a flat-bottomed cloud | SLIDE hazard |
| `cloud.motion` | 4×2 | grumpy ×4 · bonked, surprised, happy ×2 | SHOOT hazard (and sky clouds); happy when cleared |
| `boss.motion` | 4×2 | grumpy, puffing, charging, open-wide · bonked, dizzy, happy waving, giggling | the Storm King |
| `powerup.motion` | 4×2 | eight pickup badges | pickups (risky one is stormy grey) |
| `pop.motion` | 4×2, black | rainbow sparkle burst flipbook | every cleared hazard |
| `sky.day/.dusk/.night` | 21:9 | sky + far mountains | crossfaded with the day/night cycle (dusk serves sunrise too) |
| `hills`, `trees` | 21:9, magenta | middle and near parallax strips | tinted per time of day |
| `ground` | 21:9 | grass and soil | tiled, mirrored every other copy |
| `title` | 16:9 | rainbow meadow, open centre | title screen |

Ellie uses tower-defense's exact look text (dark brown wavy hair, honey-tan skin, coral sundress
with white trim) plus white sneakers. The procedural Ellie's hair darkens to match.

## Animation and juice

- **Ellie:** run frames by distance; stretch on take-off, squash on landing, rise/fall frames from
  vertical speed; dust on landing and every other footfall; slide frame with a dust trail; the
  sparkle-cast frame for a beat after each shot; *oops* while invulnerable after a bump; dizzy-happy
  on game over (nobody is hurt); cheer when the boss floats away.
- **Hazards:** the unicorn trots, then looks up delighted once she's over it. A shot cloud flinches,
  and a cleared one turns white and happy and floats off in a rainbow pop. The castle sparkles as
  she slides out from under it.
- **Boss:** frames follow its phase; it flinches when hit and, beaten, turns happy, waves and drifts
  off. Nobody is hurt.
- **World:** sky crossfade with the cycle; clouds lifted from each sky (`backdrop.ts`) drift at
  their own speeds; hills, trees and ground at three parallax rates; fireworks kept at night.
- **Screens:** title picture with Ellie waving; fades between title, run and game over; gentle
  shake on a bump.

## Sound

- **Music (Lyria):** title, day, night, boss. Looped seamlessly from the steady part; the run
  crossfades day ↔ night with the cycle and to boss music while the Storm King is out.
- **Voices (TTS):** Ellie (Zephyr, rate 1, slingshot's profile): *Let's go! Whee! Yay! Got it!
  Uh-oh! Woooow! Again!* The Storm King (Puck, sped up): *Rumble rumble! Hey! Bye-bye!* One
  line at a time, ducking the music, with a quiet gap between lines and most moments only
  sometimes spoken.
- **Effects (synthesised):** footsteps, jump boing, landing thump, slide swish, sparkle zap, plate
  clink, cloud pop with a chime, powerup chime, cartoon bonk, gentle game-over tune, sector chime,
  through a compressor and a short procedural reverb.
- **Controls:** separate SOUND and MUSIC toggles on the title and game-over screens (and `M`),
  remembered. Audio starts on the first gesture and resumes after the tab is backgrounded.

## Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| A sheet comes back with the wrong grid | `checkArt()` catches it; regenerate at most twice, then encode what the model drew. |
| The slide frame isn't long and low | It's fitted into the 24×12 slide box, so a tall pose just draws small; reprompt once. |
| A hazard drawn wider than its box | It's fitted *inside* the box, so it shrinks rather than overhangs. |
| The night sky makes grey clouds vanish | The procedural rim around the rain column follows `darkness`, as before. |
| Sprites missing | Procedural RAINBOW art, exactly as it shipped. |
