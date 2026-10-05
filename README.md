# Ellie's Rainbow Run

An auto-runner with exactly three moves — **jump, shoot, slide** — where the whole game is the
split-second question *"which one does this obstacle want?"*

Two themes: **RAINBOW** (the default, painted, with music and voices) and **NEON** (the original
procedural look). Switch on the title screen.

Every hazard has exactly one correct answer:

| Hazard | Answer |
| --- | --- |
| Ground hazard (unicorn / spike) | **JUMP** |
| Overhead hazard (floating castle / beam) | **SLIDE** |
| Armoured hazard (rain cloud / drone) | **SHOOT** — 2 to 5 times, count the plates |

The difficulty ladder is **verbs first, speed second**: EASY is a two-button game (jump and fire,
no overhead hazards at all), NORMAL adds the third verb at almost the same pace, and HARD keeps
that vocabulary and turns the speed up. Introducing a new thing to think about and a speed jump
together makes it impossible to tell which one beat you.

## Running it

```bash
npm install && npm run dev
```

Open the printed Network URL on your phone to play it on a real touchscreen. On desktop:
arrows/WASD/space, `Z` to shoot, `M` for sound and `Shift+M` for music.

## Art, music and voices

The RAINBOW theme is painted: Ellie, the unicorns, castles, rain clouds, the Storm King, the
pickups, three skies that follow the day/night cycle, parallax hills, trees and ground, and a
title picture. Music (title, day, night, boss) is from Lyria and a few short voice lines are from
Gemini TTS; every sound effect is synthesised. [ART-PLAN.md](ART-PLAN.md) has the plan and the
rules, which are mostly `../tower-defense`'s and `../slingshot`'s.

**All of it is optional.** Delete `public/sprites/` or `public/sounds/` and the game is the
procedural one it shipped as. To regenerate (needs a key in the gitignored `.env.local`, see
`.env.example`):

```bash
npm run art          # images that are missing (--only=id, --force, --dry-run, --reindex)
npm run art:shrink   # resample to display size (macOS sips)
npm run sound        # voices and music that are missing
```

Then check the grids in the browser console: `__game.checkArt()`. `__game.art.hitboxes()` outlines
every hitbox over the art: a painting may be smaller than its hitbox, never larger.

## Why it's built this way

[DECISIONS.md](DECISIONS.md) is the running log of what we decided and why — read that before
changing anything structural. The short version follows.

## How it's built

TypeScript and a 2D canvas, no engine, no runtime dependencies. The code is ~34 kB gzipped; the
optional art and sound add about 1.9 MB and 1.5 MB.

- **`src/game/`** — the simulation. Never imports from `src/render/`; it has no idea how it looks.
- **`src/render/`** — drawing, behind a `Renderer` interface. The planned 16-bit pixel look is a
  second implementation of that interface, not a rewrite.
- **`src/game/config.ts`** — every tuning number in the game. Nothing magic lives anywhere else.

### Three ideas worth knowing before you change anything

**1. The loop is fixed-timestep.** Physics advances in exact 1/120s increments regardless of the
display's refresh rate, and the renderer interpolates between steps. Without this, jump heights
literally differ between a 60Hz and a 120Hz phone.

**2. Everything is tuned in the unit that stays invariant.** Obstacle spacing is in *seconds*, not
pixels, so reaction time stays constant as the game speeds up. The jump and slide are tuned as
*distances*, not durations, so they cover the same ground at every speed — a fixed-duration jump
covers the least ground at the slowest speed, which is easy mode, which is exactly where it needs to
be most forgiving. Gravity is derived from the target arc at takeoff.

**3. The controls are forgiving on purpose.** Coyote time, input buffering, variable jump height,
and hurtboxes inset inside the visible sprites. These are invisible when they work, and they're the
whole difference between "tight" and "this game eats my inputs."

### Verifying it

The design contracts are machine-checkable, because they're the thing most likely to break silently
when someone re-tunes a jump height:

```js
__game.verify()   // in the browser console, dev builds only
```

This simulates all three hazards against all four responses (each verb, plus doing nothing) on all
three difficulties, and asserts a fatal hit actually reaches the game-over screen. It
runs the real `GameState` against a fake input, so it catches breakage anywhere in the chain, not
just bad arithmetic in the config.

`validateDesignContracts()` also runs on every page load and logs to the console if any hazard's
dimensions stop enforcing its verb (a drone you could jump over, a beam you could run under).

## Status

Playable and deployed: https://jonbcampos.github.io/runner-game/

Core loop, authored pattern director, boss fights, seven powerups, drone armour tiers, two themes,
a day/night cycle with fireworks, installable PWA with offline play. 70 automated design-contract
checks. The RAINBOW theme is painted and animated, with music, a few voice lines and synthesised
effects (decisions 43–47).
