# Decision log

Why this project is the way it is. Append to it; don't rewrite history — a decision that
turned out wrong is more useful with its reasoning intact than quietly deleted.

Format: **what was decided**, *why*, and what would make us revisit it.

---

## 1. The game is an auto-runner with exactly three verbs

**Decided:** Jump, shoot, slide. Every obstacle has exactly one correct answer. The game is the
split-second question *"which one does this want?"*

**Why:** The itch came from Mega Man X — a character with a small, expressive move set and levels
built to interrogate it. Three verbs is small enough to actually finish, and it isolates the one
thing that makes action games good: input feel. A bigger move set would spread effort across
content instead of concentrating it on feel.

**Revisit if:** The core loop turns out to be boring even with good feel — that would mean the
problem is the verb count, not the tuning.

---

## 2. TypeScript + HTML5 canvas, no engine

**Decided:** Plain canvas, zero runtime dependencies. Built game is ~22 kB.

**Why:** For a game this small an engine adds more concepts than it saves. Jonathan is a strong
developer who's never made a game, so the fundamentals — fixed-timestep loop, state machine,
collision, spawn scheduling — are the point, not overhead to be abstracted away. It also gives the
fastest possible iteration loop: save a file, reload the phone.

**Considered and rejected:** Godot (real engine, but you learn GDScript and iOS/Android export
before your first pixel moves) and Swift/SpriteKit (best native feel, but every iteration goes
through Xcode and a device build, while learning two new things at once).

---

## 3. Ships as a web app installed to the home screen, not a native app

**Decided:** Static build → GitHub Pages → "Install app" in Chrome on Android.

**Why:** Indistinguishable from native for a game like this, and sharing it with his daughter is
sending a link. No store account, no review, no signing. Capacitor can wrap the exact same code as
an APK later if that's ever wanted — it's an additive step, not a rewrite.

---

## 4. Three on-screen buttons, not gestures

**Decided:** Shoot on the left thumb; jump and slide on the right.

**Why:** Unambiguous and spammable. Swipe recognition costs ~80ms, which fights directly against
timing-critical input — the exact thing this game is made of. Auto-fire was also rejected because
it removes shooting as a *choice*, which is the whole design.

---

## 5. Endless and escalating, with a boss planned every few sectors

**Decided:** One infinite run that speeds up. Score is distance. Boss comes in M4.

**Why:** A run is 30–90 seconds, which is the right shape for a phone. Simplest to build and by far
the easiest to tune well. Hand-designed levels stay possible — see decision 8.

---

## 6. Neon vector art now, 16-bit pixel art later

**Decided:** Glowing geometric shapes on a dark parallax background, drawn procedurally. No art
assets at all.

**Why:** Speed. It reads as cool to an adult and bright to a kid, stays crisp at any resolution, and
needed zero sprite work to get playable. The 16-bit look is the eventual destination.

**How the later switch stays cheap:** The game renders at a fixed virtual *height* (see decision 19)
and all drawing sits behind a `Renderer` interface. `src/game/` never imports from `src/render/` — the
simulation has no idea how it looks. The pixel renderer is a second implementation of that
interface; the game logic doesn't change by a line.

---

## 7. Fixed-timestep simulation with render interpolation

**Decided:** Physics always advances in exact 1/120s steps; the renderer interpolates between them.

**Why:** A variable `update(deltaTime)` produces different physics at different refresh rates — jump
heights genuinely differ between a 60 Hz and a 120 Hz phone, and fast objects tunnel through
collisions on slow frames. Android spans 60–144 Hz, so this is a real problem, not a theoretical one.

---

## 8. Obstacles come from authored patterns, never spawned individually

**Decided:** M1 used a fixed hand-written script; M3 replaced it with a library of authored patterns
picked by a director (see decision 20).

**Why:** Randomly placing individual obstacles produces runs that feel arbitrary. Authored chunks
feel designed. It also means hand-designed levels are a *new consumer of existing data* rather than
a rewrite: an endless run is patterns shuffled, a level is patterns in a fixed order.

---

## 9. Tune every quantity in the unit that stays invariant

**This is the most important decision in the codebase, and it was learned the hard way.**

**Decided:**
- Obstacle spacing is in **seconds**, never pixels.
- Jump and slide are tuned as **distances**, never durations. Gravity is solved from the target arc
  at the moment of takeoff.

**Why:** Both jump and slide were originally fixed *durations*, which seemed like the obvious knob.
But a fixed-duration move covers `duration × scrollSpeed` pixels — so it covers the **least ground
at the slowest speed**, which is easy mode, sector one: precisely where the game has to be most
forgiving. Sliding under a beam on easy failed by about 1.5 pixels, and jumping a spike on easy
failed outright. Tuning a duration that worked there would have made both absurd at high speed.

Pinning the distance makes each mechanic mean the same thing at every speed: a slide always carries
you far enough to clear a beam, a jump always covers the same ground. What changes with speed is how
long it takes — which is exactly what *should* change when the world moves faster.

Same principle for spacing: seconds are what a human reacts in, so seconds are what stays fixed.

**Generalised:** before tuning a number, ask which unit stays constant across the range the game
actually spans. Tune in that one.

---

## 10. The design contracts are machine-checked

**Decided:** `__game.verify()` (dev builds) simulates every hazard against every verb on every
difficulty, plus hold-to-slide behaviour and director spacing — 43 checks and growing. `validateDesignContracts()` runs on page load and logs errors.

**Why:** "A drone must not be jumpable" is enforced by the *dimensions*, which are derived from
values meant to be tuned freely. Raising the jump height one afternoon could silently make every
drone hoppable. Checking arithmetic wasn't enough either — the tests run the real `GameState`
against a fake input, so they catch breakage anywhere in the chain.

This paid for itself immediately: it found both bugs in decision 9, and separately caught that a
fatal hit never reached the game-over screen (the corpse was being clamped to the ground by the
normal landing code, so it never fell off-screen).

---

## 11. Forgiveness mechanics are in from day one

**Decided:** Coyote time (0.1s), input buffering (0.13s), variable jump height, hurtboxes inset
inside the visible sprites, hitstop and screenshake on impact.

**Why:** These are invisible when they work and are the entire difference between "tight" and "this
game keeps eating my inputs". Input buffering in particular — a jump pressed just before landing
firing on touchdown — is the single biggest "why does this feel bad" fix. They're cheap, and
retrofitting feel onto a game that shipped without it is much harder than starting with it.

---

## 12. Multi-touch is tracked per pointer ID

**Decided:** Every active pointer tracked independently by `pointerId`; `touch-action: none` in CSS;
buttons drawn on the canvas rather than as DOM elements.

**Why:** "Shooting while jumping doesn't register" is the classic mobile game bug. Canvas-drawn
buttons also scale automatically with the letterbox transform and keep all input on one pipeline.

**Verified:** three simultaneous fingers, independent press and release.

---

## 13. Difficulty is a small set of multipliers, not separate content

**Decided:** `kid` / `normal` / `hard` scale speed, obstacle spacing, starting HP, and which
patterns are eligible.

**Why:** The game is for both Jonathan and his daughter. One game with scaling constants is far less
work than two, and it keeps the design honest — if a mechanic only works on one difficulty, that's a
bug in the mechanic (which is exactly how decision 9's bugs surfaced).

---

## 14. Feel numbers are tunable live from the console

**Decided:** `__game.tune({ jumpDistance: 100 })` mutates config in place, applies to the next jump,
re-runs all 37 contracts, and prints what the number means in seconds.

**Why:** Game feel can't be reasoned to — you change a number, play ten seconds, and decide. That
loop should take seconds, not a round-trip. It re-checks contracts because the feel knobs and the
design constraints are the same numbers: shortening a slide until it feels snappy can quietly
shorten it past the point where it clears a beam.

---

## 15. Repo is `jonbcampos/runner-game`, public

**Decided:** Public repo on the personal account. `jonbcampos-alto` (work) is a collaborator and is
what pushes from this machine.

**Why:** GitHub Pages only publishes from a private repo on a paid plan; on Free it requires the repo
to be public. Given a hobby game with no secrets, public was the cheaper trade than moving hosting.
Netlify and Cloudflare Pages were the alternative — both deploy from private repos free — and remain
the fallback if the repo ever needs to go private.

**Note:** commits are currently authored as `jonathan@ridealto.com` (the global git identity), so
they don't link to the personal GitHub profile. Unresolved.

---

## 16. Service worker uses two strategies, and offline starts from the second load

**Decided:** Navigations are network-first with a cached fallback; everything else is
stale-while-revalidate.

**Why:** `index.html` is the only file whose name never changes, so trusting cache for it would pin
you to an old build forever. Everything else is content-hashed by Vite, so a changed file is a
different URL and a stale cache entry can never be *wrong* content.

**Known limit:** the first visit populates the cache, so offline works from the second launch on.
Since installing to the home screen requires visiting first, the game is always cached by the time
the icon exists. Full first-load precaching would need a build-time asset manifest — not worth the
coupling yet.

---

## 17. Icons are generated by a committed script

**Decided:** `scripts/make-icons.mjs` rasterises the PNGs from the game's own palette. No
dependencies — it writes the PNG with Node's built-in zlib.

**Why:** A committed binary is opaque and un-editable. A script means the icon regenerates when the
art direction changes — which it will, at the 16-bit switch.

---

## 18. Slide is hold-to-continue, capped at the distance-derived max

**Decided:** Pressing slide starts it; releasing ends it, subject to a 0.12s minimum. A fully-held
slide still lasts exactly as long as decision 9 requires.

**Why:** Jonathan's call, and it's right — it mirrors variable jump height, which was already the
best-feeling thing in the game. A fixed-duration slide is an animation you wait out; a held one is a
decision you keep making. It has a real cost too, because the sliding hitbox reaches further forward
into whatever is coming next, so over-committing is punished.

The minimum hold exists so a quick tap still produces a visible slide. Without it, a one-frame slide
looks like a dropped input rather than a short one.

**Knock-on benefit:** the director can space obstacles tighter after a beam, because the player is
now only committed for the minimum hold plus cooldown rather than the full slide.

**Jumping out of a slide deliberately skips the re-slide cooldown** — slide, jump, slide on landing
is a real move, and charging it a cooldown would punish the better player.

---

## 19. The frame adapts in width, and rotates in portrait

**Decided:** Virtual height stays fixed at 270. Width follows the device aspect ratio, clamped to
480–560. In portrait, the entire presentation is drawn rotated 90°.

**Why:** Jonathan reported the game was tiny on his phone. Two separate causes:

*Landscape:* a fixed 16:9 frame on a 20:9 phone wastes two fat black bars. Fixing height keeps
gameplay identical everywhere (jump apex, beam clearance and drone height are all vertical), while
letting width follow the screen fills it edge to edge.

*Portrait:* a landscape frame letterboxed into portrait is a thin strip across the middle — most of
the screen wasted. Rotating the presentation ourselves means the game fills the screen and the
player just turns the phone. This matters more than it sounds: **plenty of people keep rotation lock
on**, so the browser never reports landscape no matter how they hold the device, and the manifest's
`orientation: landscape` only binds once the PWA is installed. Rotating ourselves works regardless.

**Tradeoff, stated plainly:** a wider frame shows hazards sooner, so it is marginally easier.
MAX_VIRTUAL_W bounds how much. The alternative — hazards popping into existence mid-screen — looks
far worse.

**Cost:** `toVirtual` has to invert the rotation exactly, or buttons are drawn in one place and
tappable in another. Verified with a round-trip test: zero drift.

---

## 20. The director guarantees spacing; patterns only describe rhythm

**Decided:** `patterns.ts` holds ~22 authored sequences tiered by verb count and minimum sector.
`director.ts` picks among the eligible ones and widens any gap that's too tight for the verbs on
either side of it, using per-verb recovery times computed at the *current* scroll speed.

**Why:** Pattern authors should write the feel they want without reasoning about scroll speed. A gap
that reads fine at 150 px/s can be unfair at 400. Rather than requiring every author to do that
arithmetic, the director enforces the floor at runtime — the same "express it in the invariant unit"
idea as decision 9, applied to authoring.

Recovery time per hazard: a spike costs the full jump airtime (you're committed until you land), a
beam costs only the minimum slide hold plus cooldown (thanks to decision 18), a drone costs the time
to land the shots that kill it.

**Verified**, not assumed: the harness runs the real director at each difficulty's top speed for 300
simulated seconds and asserts no emitted gap is ever below the floor — ~900 spawns, zero violations.

**Difficulty rises mainly through the rest between patterns**, not through tighter gaps inside them.
Phrases stay readable; you just get less time to breathe between them.

---

## 21. Sound is synthesized, never sampled

**Decided:** Every effect is oscillators and envelopes built at runtime. No audio files.

**Why:** Keeps the whole game a ~25 kB download and means sounds are tuned by editing numbers rather
than by opening an audio editor. It also suits the art direction — this should sound like a machine,
not like a recording.

The AudioContext is created on the first user gesture (browsers refuse earlier) and resumed on every
play, because a backgrounded app can get its context suspended and would otherwise go silent forever.

---

## 22. Presentation is driven by an event queue, not by direct calls

**Decided:** `GameState` pushes typed events (`jump`, `kill`, `sector`, …) into a pre-allocated ring;
`main.ts` drains them into sound and particles.

**Why:** `src/game/` must not know that renderers or speakers exist — the same boundary that keeps
the planned pixel-art renderer a drop-in (decision 6). Direct calls from the simulation into an audio
module would quietly couple them.

Slots are pre-allocated and reused, so a busy frame allocates nothing (decision 11's reasoning about
GC hitches applies here too).
