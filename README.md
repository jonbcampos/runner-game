# Ellie's Rainbow Run

An auto-runner with exactly three moves — **jump, shoot, slide** — where the whole game is the
split-second question *"which one does this obstacle want?"*

Two themes: **RAINBOW** (the default) and **NEON** (the original look). Switch on the title screen.

Every hazard has exactly one correct answer:

| Hazard | Answer |
| --- | --- |
| Ground hazard (brambles / spikes) | **JUMP** |
| Overhead hazard (rainbow gate / beam) | **SLIDE** |
| Armoured hazard (rain cloud / drone) | **SHOOT** — 2 to 5 times, count the plates |

## Running it

```bash
npm install && npm run dev
```

Open the printed Network URL on your phone to play it on a real touchscreen. On desktop:
arrows/WASD/space, `Z` to shoot.

## Why it's built this way

[DECISIONS.md](DECISIONS.md) is the running log of what we decided and why — read that before
changing anything structural. The short version follows.

## How it's built

TypeScript and a 2D canvas, no engine, no runtime dependencies. The whole game is ~22 kB built.

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
three difficulties, and asserts a fatal hit actually reaches the game-over screen — 37 checks. It
runs the real `GameState` against a fake input, so it catches breakage anywhere in the chain, not
just bad arithmetic in the config.

`validateDesignContracts()` also runs on every page load and logs to the console if any hazard's
dimensions stop enforcing its verb (a drone you could jump over, a beam you could run under).

## Status

Playable and deployed: https://jonbcampos.github.io/runner-game/

Core loop, authored pattern director, boss fights, seven powerups, drone armour tiers, two themes,
installable PWA with offline play. 66 automated design-contract checks.
