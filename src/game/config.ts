/**
 * Every tuning number in the game lives in this file.
 *
 * Units: virtual pixels and seconds. The game simulates at a fixed virtual
 * resolution (VIRTUAL_W x VIRTUAL_H) and the renderer scales that to whatever
 * the device actually is, so these numbers mean the same thing on every phone.
 *
 * Rule: nothing else in the codebase should contain a magic gameplay number.
 * If you want to change how the game feels, you change it here.
 */

// --- Screen -----------------------------------------------------------------

/**
 * The virtual frame the game is drawn into.
 *
 * Height is FIXED. Everything about the gameplay is vertical — jump apex,
 * beam clearance, how tall a drone is — so a constant height means the game
 * plays identically on every device.
 *
 * Width ADAPTS to the device's aspect ratio, between the two clamps below.
 * A fixed 16:9 frame letterboxed onto a modern phone (often 20:9 or taller in
 * landscape) wastes big black bars on either side. Letting the width follow the
 * screen fills it edge to edge.
 *
 * The tradeoff, stated plainly: a wider frame shows hazards sooner, so it's
 * marginally easier. MAX_VIRTUAL_W bounds how much. It's the same tradeoff
 * every game with a variable viewport makes, and the alternative — hazards
 * popping into existence mid-screen — looks far worse.
 */
export const DESIGN_W = 480;
export const VIRTUAL_H = 270;

/** Never narrower than the design width, or hazards arrive with no warning. */
export const MIN_VIRTUAL_W = DESIGN_W;
/** Caps how much extra reaction time a very wide screen can buy. */
export const MAX_VIRTUAL_W = 560;

/**
 * The live frame size. Mutated by Viewport on resize; read by everything that
 * draws or positions against the screen edges.
 */
export const SCREEN = {
  w: DESIGN_W,
  h: VIRTUAL_H,
  /** True when the device is portrait and the game is being drawn sideways. */
  rotated: false,
};

/** Y coordinate of the ground line. Player stands on this. */
export const GROUND_Y = 210;

/** How far from the left edge the player runs. Everything else scrolls past. */
export const PLAYER_X = 96;

/** Cap devicePixelRatio — a 3x Android screen triples fill cost for no visible gain. */
export const MAX_DPR = 2;

// --- Simulation -------------------------------------------------------------

/** Fixed timestep. The simulation always advances in exactly this increment. */
export const FIXED_DT = 1 / 120;

/**
 * If the tab is backgrounded or a frame hitches, don't try to "catch up" more
 * than this much wall-clock time at once — that produces a death spiral where
 * catching up costs more than the frame you missed.
 */
export const MAX_FRAME_TIME = 0.25;

// --- Player -----------------------------------------------------------------

export const PLAYER = {
  /** Visual size while standing/running. */
  width: 16,
  height: 24,

  /** Visual size while sliding — wider and much shorter. */
  slideWidth: 24,
  slideHeight: 12,

  /**
   * The hurtbox is inset from the visual box on each side. This is the single
   * cheapest way to make a game feel fair: near-misses read as skill because
   * you genuinely weren't hit.
   */
  hurtboxInsetX: 3,
  hurtboxInsetY: 2,

  /**
   * The jump is defined in world-space — how far and how high — and gravity is
   * derived from it at the moment you leave the ground.
   *
   * Same reasoning as slideDistance: a fixed gravity gives a fixed airtime,
   * and a fixed airtime covers less ground the slower the game scrolls. That
   * makes the jump arc shortest on easy mode, where it must be most generous,
   * and it means every speed increase silently re-tunes how much a jump clears.
   *
   * Pinning distance and height instead makes the arc look and behave
   * identically at every scroll speed — a jump always carries you this far
   * over the ground. What changes with speed is how long it takes, which is
   * exactly the thing that *should* change when the world moves faster.
   */
  /**
   * 108px at the base normal speed of 150 works out to ~0.72s of airtime, which
   * is in the usual platformer range. It was 130 (~0.87s) and read as floaty:
   * airtime is the main thing "floaty" actually means, and since airtime is
   * jumpDistance / scrollSpeed, this is the knob that fixes it.
   */
  jumpDistance: 108,
  jumpApex: 66,

  /**
   * Share of airtime spent rising. Below 0.5, so you fall faster than you rose.
   * Symmetric arcs are physically honest and feel terrible — floaty and
   * unresponsive — so essentially every platformer cheats here. Lowering this
   * makes the descent snappier without changing how far the jump carries you.
   */
  jumpRiseFraction: 0.4,

  /** Guard rails on the derived airtime at speed extremes. */
  jumpMinAirtime: 0.3,
  jumpMaxAirtime: 1.25,

  /**
   * Releasing jump early cuts upward velocity by this factor, giving a
   * continuous range between a hop and a full leap from one button.
   */
  jumpCutMultiplier: 0.45,

  /** Upward kick on death, so the body reacts instead of just stopping. */
  deathPopVelocity: 260,

  /**
   * A slide is tuned as a *distance*, not a duration.
   *
   * Duration is the intuitive knob and it's the wrong one. A fixed-time slide
   * covers `duration x scrollSpeed` pixels, so it covers the least ground at
   * the slowest speed — which is easy mode, sector one, the exact place the
   * game must be most forgiving. Tuning a time that works there makes the slide
   * absurdly long later; tuning one that feels right later silently fails to
   * clear a beam on easy.
   *
   * Fixing the distance makes the mechanic mean the same thing at every speed:
   * a slide always carries you this far, so it always clears a beam. Duration
   * is derived per-tick from the current scroll speed. Same idea as expressing
   * obstacle spacing in seconds — pick the unit that stays invariant.
   *
   * The floor is set by the beam it has to clear: a beam's danger window is its
   * own width plus the sliding player's, and there has to be enough left over
   * that the press doesn't need to be frame-perfect. validateDesignContracts()
   * enforces 40px of slack, so this can't be shortened into a mechanic that
   * only works if you time it exactly.
   */
  slideDistance: 108,

  /**
   * Guard rails on the derived duration, so extreme speeds stay sane. This is
   * the *maximum* slide — how far a fully-held slide carries you.
   */
  slideMinDuration: 0.25,
  slideMaxDuration: 1.0,

  /**
   * Slide is hold-to-continue: it ends when you let go, capped at the derived
   * max. Same shape as variable jump height — one button covering a range
   * rather than a fixed animation you wait out — which means committing to a
   * long slide is a real choice, since the sliding hitbox reaches further
   * forward into whatever is coming next.
   *
   * This minimum exists so a quick tap still produces a slide you can see and
   * that clears something. Without it a 1-frame slide looks like a dropped
   * input rather than a short one.
   */
  slideMinHold: 0.12,

  /** You can't immediately re-slide; prevents mashing through beam sections. */
  slideCooldown: 0.12,

  /** Jump still works for this long after leaving the ground. */
  coyoteTime: 0.1,

  /** A press this long before it becomes legal is remembered and fires. */
  inputBuffer: 0.13,

  shotCooldown: 0.22,

  /** Where the gun muzzle sits, relative to the player box's top-left. */
  muzzleX: 16,
  muzzleYStand: 9,
  muzzleYSlide: 4,

  /** Invulnerability after taking a hit, so one hazard can't drain all HP. */
  invulnDuration: 1.0,
} as const;

// --- Projectiles ------------------------------------------------------------

export const SHOT = {
  speed: 420,
  width: 8,
  height: 3,
  /** Pool size. More than can ever be alive at once given speed + cooldown. */
  poolSize: 32,

  /**
   * How far a shot travels before it fizzles out, in virtual pixels.
   *
   * Roughly half the design width. An unlimited-range gun makes shooting a
   * hold-the-button non-decision: you fire the moment a drone appears and it
   * dies somewhere off in the distance. Capping the reach means you have to let
   * the target come to you, which turns the third verb into a timing read like
   * the other two — and leaves obvious room for a long-shot powerup to matter.
   */
  range: 230,

  /** Damage per shot. The stronger-gun powerup raises this. */
  damage: 1,
} as const;

// --- World / pacing ---------------------------------------------------------

export const WORLD = {
  /** Scroll speed at the start of a run, in virtual px/sec. */
  baseScrollSpeed: 150,

  /** Added to scroll speed per completed sector. */
  speedPerSector: 6,

  speedCap: 340,

  /** Seconds of running per sector. */
  sectorLength: 20,

  /**
   * Boss cadence. The first arrives at sector 3 (~40s in) and then every
   * `bossEvery` sectors. Late enough to be a reward for a good run, early
   * enough that a decent player actually sees one.
   */
  bossFirstSector: 3,
  bossEvery: 2,
} as const;

// --- Obstacles --------------------------------------------------------------

/**
 * Each obstacle family has exactly one correct verb, and the *dimensions* are
 * what actually enforce that. Get these wrong and the design silently breaks —
 * a drone you can jump over stops being a reason to shoot.
 *
 * The constraints, given a 66px jump apex and a 12px-tall slide:
 *
 *   spike  height > slideHeight        so you can't slide through it
 *          height < jumpApex           so you CAN jump it            -> JUMP
 *
 *   beam   clearance > slideHeight     so you can slide under
 *          clearance < standing height so you can't run through
 *          extends above jump apex     so jumping puts you into it   -> SLIDE
 *
 *   drone  bottomGap < slideHeight     so you can't slide under
 *          top above jump apex         so you can't jump over        -> SHOOT
 *
 * There's an assertion in state.ts that re-checks these against the physics at
 * startup, so changing a jump height can't quietly invalidate a hazard.
 */
export const OBSTACLE = {
  spike: { width: 20, height: 22 },

  /** Overhead beam. `clearance` is the gap between the ground and its underside. */
  beam: { width: 34, height: 60, clearance: 16 },

  /**
   * A hovering drone projecting a shield column to the ground. The column is
   * why it can't be slid under and the height is why it can't be jumped — and
   * the visual (body on top, energy beneath) makes both readable at a glance.
   */
  drone: {
    width: 22,
    /** Full hitbox height: from `bottomGap` above the ground up past jump apex. */
    height: 78,
    /** Gap between the shield column and the ground. Smaller than a slide. */
    bottomGap: 6,
    /** Height of the solid drone body at the top; the rest renders as shield. */
    bodyHeight: 26,
    /** Baseline armour. Individual drones use a tier from the table below. */
    hp: 2,

    /**
     * Armour tiers, 2 to 5 shots.
     *
     * The point is to make "shoot it" a *read* rather than a reflex: a 5-plate
     * drone has to be engaged the moment it appears, a 2-plate one can wait.
     * Tougher tiers unlock by sector so the vocabulary grows instead of
     * arriving all at once.
     *
     * Each tier is drawn in its own colour AND with one armour plate per hit,
     * so the count is countable rather than memorised. Colour alone would mean
     * learning a legend; plates you can just look at.
     */
    tiers: [
      { hp: 2, weight: 10, minSector: 1 },
      { hp: 3, weight: 8, minSector: 2 },
      { hp: 4, weight: 5, minSector: 3 },
      { hp: 5, weight: 3, minSector: 4 },
    ],

    /**
     * Fraction of a drone's approach the player is assumed to actually spend
     * shooting. The rest is reaction time and imprecision.
     *
     * This exists because armour and the shot-range cap fight each other: a
     * drone can only be hit once it's close, and it only stays close for so
     * long. Above a certain scroll speed a 5-plate drone cannot be destroyed
     * before contact by *any* input — see maxKillableArmour().
     */
    killSafetyFactor: 0.72,
  },

  /**
   * Only spawns while FLIGHT is active. Small, fragile, and placed at whatever
   * altitude you're flying at — the thing that stops flight from being a
   * do-nothing power. One shot each, because you're also steering.
   */
  skydrone: { width: 20, height: 18, hp: 1 },

  /** Hazard hurtboxes are inset too — same fairness reason as the player's. */
  hurtboxInset: 2,
} as const;

// --- Boss -------------------------------------------------------------------

/**
 * The boss alternates between two distances, and that's the whole fight.
 *
 * Far away it launches ordinary hazards, so the three verbs still answer
 * everything and no new vocabulary is needed. Then it closes in and opens its
 * core — and because shots only reach SHOT.range, closing in is the *only*
 * time you can hurt it. The shot-range cap and the boss design justify each
 * other rather than each being an isolated rule.
 */
export const BOSS = {
  width: 54,
  height: 46,
  /**
   * Hover height while it's at range — above the beam lane, out of reach.
   *
   * It does NOT stay there. The player's gun fires from roughly 15px above the
   * ground, so a boss parked at this altitude is literally unshootable; shots
   * sail underneath it. It descends to `nearBottomGap` when it closes in, which
   * is what makes the opening an opening.
   */
  hoverY: 96,

  /** Gap between the boss's underside and the ground while it's closed in. */
  nearBottomGap: 5,

  hp: 10,
  /** Easy mode gets a shorter fight rather than a different one. */
  hpScale: { kid: 0.6, normal: 1, hard: 1.2 },

  /** Distance from the right edge while launching hazards. */
  farInset: 74,
  /** Absolute x it closes to when vulnerable — inside SHOT.range of the muzzle. */
  nearX: 250,

  enterDuration: 1.3,
  /** Hazards launched per attack run. */
  attacksPerRun: 3,
  /** Authored gap between launches; the real gap also respects the verb floor. */
  attackGap: 1.15,
  closeDuration: 0.75,
  vulnerableDuration: 1.3,
  retreatDuration: 0.75,
  deathDuration: 1.6,

  /** Healed on victory, capped at the run's max. */
  healOnDefeat: 1,
} as const;

// --- Powerups ---------------------------------------------------------------

export const POWERUP = {
  size: 14,
  /** Vertical bob, so pickups read as collectible items rather than hazards. */
  bobAmplitude: 3,

  /** Seconds between pickup spawns. The director places them between patterns. */
  spawnIntervalMin: 9,
  spawnIntervalMax: 15,

  // --- Effect magnitudes ---
  /** OVERDRIVE: the gamble. Faster world, but score accrues much faster too. */
  speedScale: 1.4,
  speedScoreScale: 1.9,

  /**
   * HIGH JUMP: tall enough to clear a beam, which nothing else can do.
   *
   * A beam's top edge sits 76px above the ground against a normal 66px apex, so
   * the boost has to comfortably exceed that — barely clearing it would make the
   * powerup a coin flip rather than the promise its name makes.
   */
  jumpApexScale: 1.9,

  /**
   * ...and the ascent is quicker, not just taller.
   *
   * Scaling height alone means you're still low when the obstacle arrives, so
   * you'd have to re-learn your timing to use the powerup — which is a strange
   * thing to ask of a reward. Snapping upward faster keeps roughly the timing
   * you already have and lets the extra height do the work.
   */
  jumpRiseScale: 0.7,

  /** HEAVY SHOT: one-shot kills. */
  powerDamage: 2,

  /** LONG SHOT: reach, which matters a lot now that range is capped. */
  rangeScale: 2.3,

  /**
   * REPAIR: how far above the difficulty's starting HP you can stack hearts.
   *
   * Capped so a lucky run of pickups can't turn HARD into a game where mistakes
   * stop mattering — the 1-HP tension is the whole point of that mode.
   */
  repairMaxBonus: 2,

  // --- Flight ---
  /** Upward speed while JUMP is held, and the sink rate when it isn't. */
  flightClimbSpeed: 150,
  flightSinkSpeed: 110,
  /** Altitude band, as heights above the ground line. */
  flightMinHeight: 26,
  flightMaxHeight: 150,
  /** Seconds between sky drones while flying. Flight must not be a free ride. */
  skyDroneInterval: 1.35,
} as const;

// --- Difficulty -------------------------------------------------------------

export type DifficultyId = 'kid' | 'normal' | 'hard';

export interface Difficulty {
  id: DifficultyId;
  label: string;
  /** Multiplies both base speed and per-sector escalation. */
  speedScale: number;
  /** Multiplies the gap between obstacles. Higher = more reaction time. */
  spacingScale: number;
  /** Hits you can take before dying. */
  hp: number;
  /** Max number of distinct verbs a pattern may demand (used by the M3 director). */
  maxPatternVerbs: number;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  kid: {
    id: 'kid',
    label: 'EASY',
    speedScale: 0.75,
    spacingScale: 1.5,
    hp: 3,
    maxPatternVerbs: 1,
  },
  normal: {
    id: 'normal',
    label: 'NORMAL',
    speedScale: 1.0,
    spacingScale: 1.0,
    hp: 2,
    maxPatternVerbs: 2,
  },
  hard: {
    id: 'hard',
    label: 'HARD',
    speedScale: 1.2,
    spacingScale: 0.8,
    hp: 1,
    maxPatternVerbs: 3,
  },
};

// --- Juice ------------------------------------------------------------------

export const JUICE = {
  /** Freeze the whole simulation briefly on impact. Sells every hit. */
  hitstopDuration: 0.05,
  killHitstopDuration: 0.03,
  shakeOnHit: 6,
  shakeOnKill: 2.5,
  /** Screenshake decays exponentially at this rate. */
  shakeDecay: 8,
} as const;

// --- Derived ----------------------------------------------------------------

/**
 * Peak height of a full jump. Now simply a tuning value rather than something
 * derived from gravity — which is the point of defining the arc in world-space:
 * the numbers the design depends on are the ones you actually set.
 */
export const JUMP_APEX_HEIGHT = PLAYER.jumpApex;

/** Airtime for a full jump at a given scroll speed. */
export function jumpAirtimeAt(scrollSpeed: number): number {
  const raw = PLAYER.jumpDistance / Math.max(scrollSpeed, 1);
  return Math.min(PLAYER.jumpMaxAirtime, Math.max(PLAYER.jumpMinAirtime, raw));
}
