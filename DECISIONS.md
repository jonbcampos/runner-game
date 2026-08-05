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

---

## 23. Shots have limited range

**Decided:** Shots fizzle after ~230px, about half the design width. Range and damage are stats, not
constants, so powerups can change them.

**Why:** An unlimited gun made shooting a non-decision. You held the button the moment a drone
appeared and it died somewhere off in the distance — no timing, no read, nothing to get better at.
The other two verbs are timing problems; this makes the third one match. You have to let the target
come to you.

It also creates the space for LONG SHOT to be a genuine upgrade rather than a cosmetic one, and it's
what makes the boss fight work at all (decision 24).

---

## 24. The boss adds no fourth verb

**Decided:** The boss launches ordinary spikes, beams and drones from range, then closes in,
descends, and opens its core — which is the only window in which it can be damaged. Sector 3, then
every 2 sectors.

**Why:** A boss that needed a new input would turn the whole rest of the game into a tutorial for
one encounter. Fighting with the existing vocabulary means everything you've learned transfers, and
the boss is a *test* of that vocabulary rather than a detour from it.

The approach-and-open loop is what makes it a boss rather than a dense patch of track, and it only
works because of decision 23: since shots don't reach across the screen, the boss coming to you is
the only chance you get. The two decisions justify each other.

**Boss hazards go through the same spacing floor as the director's**, so even a boss can't emit an
unsurvivable gap.

**Two bugs worth remembering**, both found by tests and neither visible while playing:
- The boss originally hovered 96px up while the gun fires from ~15px, so every shot sailed
  underneath and the fight was silently unwinnable — nothing errored, the health bar just never
  moved. It now descends to meet you, which is better choreography anyway.
- The first boss test sampled vulnerability *before* `update()`, but the boss can open and take a
  legal hit within the same tick, so it reported phantom violations. The lesson: when a test samples
  state around a mutation, check the invariant directly instead.

---

## 25. A powerup must be a decision, not a gift

**Decided:** Six timed powerups, one active at a time — a new pickup replaces whatever you're
holding. OVERDRIVE (faster world, much faster scoring), HIGH JUMP, FLIGHT, INVINCIBLE, HEAVY SHOT,
LONG SHOT.

**Why:** A pickup that is simply good is a reflex, not a choice — you grab it without thinking and
the moment is uninteresting. So each one either costs something, changes how you have to play, or is
an outright gamble.

**OVERDRIVE is the interesting one.** It speeds the world up (harder) *and* multiplies scoring
(better). Worth taking when you're comfortable, worth dodging at 1 HP. It's the only pickup whose
correct answer depends on how the run is going, and risky pickups spawn low in the running lane so
declining one costs a real input rather than being the default.

**Single-slot is what makes collection itself a decision:** grabbing a long shot while you're
mid-flight throws the flight away.

---

## 26. FLIGHT spawns sky drones

**Decided:** Hold JUMP to climb, release to sink, within a clamped altitude band. While it's active,
sky drones spawn at roughly your altitude.

**Why:** Without them, flight is seven seconds of holding a button above a game that cannot touch
you — the most powerful pickup and by far the most boring. Sky drones put the third verb back in the
air with you, so flight changes *what* you're doing rather than removing the need to do anything.

Reusing JUMP for climb was deliberate: it's the button already associated with "up", and inventing a
control that exists for seven seconds a run is a bad trade.

---

## 27. HIGH JUMP rises faster, not just higher

**Decided:** 1.9× apex *and* a 0.7× rise time.

**Why:** Scaling only the height meant you were still low when the obstacle arrived, so you had to
re-learn your timing to use the reward — a strange thing to ask of a powerup. Snapping upward faster
keeps roughly the timing you already have and lets the extra height do the work.

Caught by the test asserting HIGH JUMP clears a beam (76px top) while a normal jump (66px apex)
cannot. The first version passed the "is it taller" check and still failed the real one, which is
exactly why the tests assert observable outcomes rather than that a field got set.

---

## 28. Drones have armour tiers, and the game guarantees they're killable

**Decided:** Drones come in 2/3/4/5-hit tiers, colour-coded on an orange→red→white heat ramp *and*
drawn with one armour plate per remaining hit. Tougher tiers unlock by sector.

**Why the plates and not just colour:** colour alone means learning a legend, and nobody does that at
speed. Plates make the shot count literally countable, and watching them break off one at a time is
also the clearest possible feedback that your shots are connecting. Colour then just makes the tier
recognisable before you've had time to count.

The ramp deliberately stays inside orange/red/white. The first version used a magenta for tier 4
that sat right next to the spike pink — and confusing a drone for a spike means answering with the
wrong verb entirely, which is the worst mistake this game can induce.

**The non-obvious part:** armour and the shot-range cap (decision 23) pull against each other. A
drone can only be hit once it's close, it only stays close for so long, and shots are paced by a
cooldown — so above a certain scroll speed a 5-plate drone **cannot be destroyed by any input at
all.** Worse, that failure looks exactly like the player being bad at the game.

So `maxKillableArmour(scrollSpeed)` computes the ceiling from the approach time, and the director
never exceeds it. Same shape of promise as the spacing floor: the game may be hard, but it never
asks for the impossible. In practice the ceiling only binds at the very top speeds, so it's a safety
net rather than a constant restriction.

**Consequence worth knowing:** heavy drones are an early- and mid-run feature. Late in a run
everything moves too fast to chew through five plates, so difficulty there comes from speed and
density instead. HEAVY SHOT doubles the ceiling, which is a large part of why that powerup feels
good.

**Verified**, not assumed: 83 tier/speed combinations across all three difficulties, each one
actually simulated to confirm a player holding fire destroys the drone before contact.

---

## 29. REPAIR is instant, and never occupies the powerup slot

**Decided:** A seventh pickup, `+1 HP`, applied the moment you touch it. It restores a heart, or
raises your maximum if you're already full, capped at the difficulty's starting HP + 2.

**Why it's structurally different:** every other powerup is timed, but a heal has nothing to count
down. More importantly, if it consumed the single slot (decision 25) then grabbing a heart would
throw away an active FLIGHT — a bizarre trade that would make players avoid health.

**Why it extends the maximum when you're already full:** otherwise it's dead weight whenever you're
healthy, and on HARD it would do nothing *at all* — that mode starts at one hit point, so there's no
such state as "hurt but alive". Extending the max makes it the only route to a second chance on
Hard, which is exactly where a heal should matter most.

**Why the cap exists:** without it a lucky run of pickups turns Hard into a mode where mistakes stop
costing anything, and the one-hit tension is the entire point of that difficulty.

It's drawn in the same cyan as the HUD hearts, so what it does is obvious without a legend — the
same reasoning as the armour plates in decision 28.

---

## 30. OVERDRIVE scales your fire rate too — and that's a fairness fix, not a buff

**Found by playing**, which is the point of playing: collected a speed boost in sector 2, ran
straight into a drone, and couldn't shoot it down in time.

**The hole:** decision 28's armour ceiling is evaluated when a drone *spawns*. OVERDRIVE speeds the
world up *afterwards*, so a drone chosen as fair became unkillable mid-flight. The death traced back
to a decision made seconds earlier, with nothing on screen to connect the two — the worst kind of
unfair, because it reads as you being bad.

**The fix:** OVERDRIVE now scales the gun by the same factor as the world. Approach time shrinks by
1.4×, the shot interval shrinks by 1.4×, so the number of shots you can land is *invariant*. The
guarantee holds automatically for both spawn-time and mid-flight boosts, rather than needing a
special case.

The gamble is intact — you still have far less time to read and answer everything — but it can no
longer hand you a situation no input could survive.

**Generalised:** a guarantee evaluated once at spawn time is only as good as the assumption that
nothing it depends on can change afterwards. When a powerup can move one of those inputs, either
re-evaluate or make the quantity invariant. Invariant is better; there's nothing to remember.

---

## 31. The director reserves a gap for pickups

**Also from that same death:** pickups spawn on their own timer, independent of the director, so a
pickup and a hazard could arrive together. Collecting something that instantly changes how you play,
while a drone is already on top of you, is not a decision — it's a coin flip.

**First attempt failed instructively.** Requiring clearance on both sides means demanding a window
twice as wide, and the pacing never produces one: it placed **zero** pickups in three minutes.
Loosening it wasn't enough either, because the rest between patterns *shrinks* as sectors climb
(decision 20) — so late in a run no natural gap is ever wide enough and pickups would be silently
starved out exactly when the run gets interesting.

**The fix:** the director *reserves* the space. A pickup waits only for the trailing side to clear
naturally, then pushes the next hazard back. Pacing bends slightly around a pickup roughly once
every ten seconds, rather than pickups being crowded out by their own safety rule.

Pickups also now spawn at the same x as obstacles, so gaps measured in seconds actually line up —
the two spawn points differed by 4px, which was enough to fail the check by 0.03s.

---

## 32. The jump preserves distance, not airtime, when speed changes mid-air

**Found by playing:** jumped a spike at OVERDRIVE speed, the boost expired at the apex, the world
slowed, and the jump landed short — on the spike.

**The mistake was mine, and it was a reasoned one.** Decision 9 says the jump is defined in
world-space: how far and how high. But I then froze gravity at takeoff, with a comment saying a
mid-air speed change shouldn't "warp an arc the player has already committed to". That preserves
*airtime*, which is the wrong quantity. When the world slows, the same airtime covers far less
ground, so the jump lands short of what it was aimed at — and the player did nothing wrong.

**The fix:** on a speed change while airborne, scale velocity by k and both gravities by k² (k =
speed ratio). That leaves the apex untouched and scales airtime by exactly 1/k, so ground covered —
airtime × speed — is unchanged. The arc you committed to is the arc you get.

**The lesson generalises past this bug:** "don't change it underneath the player" and "keep the
promise you made to the player" are not the same rule, and when they conflict the second one wins.
Freezing a value feels safe; what matters is which quantity the design actually guarantees.

---

## 33. Powerups can be parked without being deleted

**Decided:** `PowerupDef.enabled`. FLIGHT and HIGH JUMP are switched off after playtesting — flight
"sort of worthless but interesting", high jump too close to just jumping.

**Why not delete them:** both work and both are tested. Parking keeps them a one-word change away,
and the tests keep proving they still function while they're out of rotation, so turning them back
on later isn't a gamble on code nobody has run in months. Flight is worth revisiting if the sky
threat gets strong enough to make altitude a real decision.

**Added AUTOFIRE** in their place: fires by itself, fast, with no button held. It's distinct from
HEAVY SHOT (damage) and LONG SHOT (reach) because what it really gives back is a *thumb* — both
hands free for jumps and slides. That's what makes a 4-plate drone feel handled rather than frantic.

---

## 34. Two separate ceilings on drone armour

**Decided:** `Difficulty.maxDroneArmour` (kid 3, normal 4, hard 5), on top of the existing
speed-based ceiling.

**Why two:** they answer different questions. The speed ceiling is about *possibility* — can this be
killed at all before it reaches you. The difficulty cap is about *demand* — should this mode be
asking for five fast accurate taps.

They pull in opposite directions, which is what makes both necessary. Easy is the **slowest**
difficulty, so the possibility ceiling is at its most generous there — a 5-plate drone is entirely
killable on easy, and it still felt like too much, because the constraint that bit wasn't time, it
was how frantic it was. A single ceiling could not have expressed that.

**Also:** OVERDRIVE's spawn weight now scales per difficulty (easy ×0.25). It's a genuine hazard,
and on easy it should be a rare curiosity rather than regular furniture.

---

## 35. The boss randomises everything except reachability

**Decided:** approach distance, phase timings, attack count and hazard order are all randomised, and
the boss sometimes feints — pulling up short without opening.

**Why:** the fight was correct but a metronome. Once you'd seen one cycle you'd seen them all, and a
boss you can answer from memory isn't testing anything.

**The one thing that stays guaranteed:** the opening must be inside the gun's reach. Randomness
against a hard range limit is exactly the shape of bug that shows up rarely and can't be reproduced
— "I couldn't hit it that one time". So `validateDesignContracts()` checks the far end of the
approach band against SHOT.range at startup, and the harness walks 25 seeds and verifies every
opening the boss actually offers. 127 openings checked, furthest 188px against 230px of reach.

Feints never happen twice in a row, so unpredictability can't turn into stalling.
