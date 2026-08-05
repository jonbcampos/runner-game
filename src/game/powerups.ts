import { GROUND_Y, POWERUP, SCREEN } from './config';
import type { Aabb } from './collision';

/**
 * Powerups.
 *
 * The design rule they all obey: **a powerup must be a decision, not a gift.**
 * A pickup that is simply good is a reflex — you grab it without thinking, and
 * nothing about the moment is interesting. So each one either costs something,
 * changes how you have to play, or (in the case of SPEED) is an outright
 * gamble.
 *
 * They are all timed, and only one can be active at once: taking a new pickup
 * drops whatever you were holding. That makes even collection a choice, because
 * grabbing a long-shot while you're mid-flight throws the flight away.
 */

export type PowerupKind =
  | 'speed'
  | 'highJump'
  | 'flight'
  | 'invincible'
  | 'power'
  | 'longShot'
  | 'autoShot'
  | 'repair';

export interface PowerupDef {
  kind: PowerupKind;
  label: string;
  /** Short blurb shown when collected. */
  blurb: string;
  duration: number;
  /** True for pickups that are a risk rather than a reward. */
  risky: boolean;
  /**
   * Applied the moment it's collected and then gone, rather than occupying the
   * timed slot. A heal has nothing to count down, and making it consume the
   * slot would mean throwing away an active flight to pick up a heart.
   */
  instant?: boolean;
  /**
   * Set false to take a powerup out of rotation without deleting it.
   *
   * FLIGHT and HIGH JUMP are parked here rather than removed: both work and
   * both are tested, they just aren't earning their place yet. Keeping the code
   * live means turning them back on is a one-word change, and the tests keep
   * proving they still function in the meantime.
   */
  enabled: boolean;
  /** Relative spawn weight. */
  weight: number;
}

export const POWERUP_DEFS: Record<PowerupKind, PowerupDef> = {
  /**
   * The gamble. Everything speeds up — which is harder — but score accrues far
   * faster. Worth taking when you're comfortable, worth dodging at 1 HP. It's
   * the only pickup where the right answer depends on how the run is going,
   * which is what makes it the most interesting one in the set.
   */
  speed: {
    kind: 'speed',
    enabled: true,
    label: 'OVERDRIVE',
    blurb: 'FASTER — AND WORTH MORE',
    duration: 8,
    risky: true,
    weight: 10,
  },
  /** Clears anything you could normally only slide under. */
  highJump: {
    kind: 'highJump',
    // Paused: overlaps with simply jumping, and rarely changed a decision.
    enabled: false,
    label: 'HIGH JUMP',
    blurb: 'JUMP OVER ANYTHING',
    duration: 9,
    risky: false,
    weight: 10,
  },
  /**
   * Hold JUMP to climb, release to sink. Ground hazards stop mattering — so
   * sky drones appear while it's active, and you still have to shoot.
   */
  flight: {
    kind: 'flight',
    // Paused: interesting to look at, but it removed the game for its duration
    // more than it changed it. Worth revisiting with a stronger sky threat.
    enabled: false,
    label: 'FLIGHT',
    blurb: 'HOLD JUMP TO CLIMB',
    duration: 7,
    risky: false,
    weight: 7,
  },
  /** Straightforwardly amazing, so it's rare and short. */
  invincible: {
    kind: 'invincible',
    enabled: true,
    label: 'INVINCIBLE',
    blurb: 'NOTHING CAN TOUCH YOU',
    duration: 5,
    risky: false,
    weight: 5,
  },
  /** One-shot kills, so drones stop costing you two windows of attention. */
  power: {
    kind: 'power',
    enabled: true,
    label: 'HEAVY SHOT',
    blurb: 'ONE SHOT, ONE KILL',
    duration: 9,
    risky: false,
    weight: 9,
  },
  /**
   * Fires by itself, fast. Frees the thumb that was holding FIRE, which is what
   * makes a 4- or 5-plate drone feel handled rather than frantic.
   */
  autoShot: {
    kind: 'autoShot',
    enabled: true,
    label: 'AUTOFIRE',
    blurb: 'GUN RUNS ITSELF',
    duration: 8,
    risky: false,
    weight: 9,
  },
  /** Reach, which after the range cap is a genuine change in how you play. */
  longShot: {
    kind: 'longShot',
    enabled: true,
    label: 'LONG SHOT',
    blurb: 'REACH FURTHER',
    duration: 10,
    risky: false,
    weight: 9,
  },
  /**
   * The only instant pickup. Restores a heart, or raises your maximum if you're
   * already full — so it's never a wasted grab, and on HARD (which starts at a
   * single hit point) it's the only way to ever get a second chance.
   */
  repair: {
    kind: 'repair',
    enabled: true,
    label: 'REPAIR',
    blurb: '+1 HP',
    duration: 0,
    risky: false,
    instant: true,
    weight: 7,
  },
};

const ALL_KINDS = Object.keys(POWERUP_DEFS) as PowerupKind[];

export interface Pickup {
  kind: PowerupKind;
  x: number;
  prevX: number;
  y: number;
  active: boolean;
  /** Drives the bobbing animation, so pickups read as items not obstacles. */
  phase: number;
}

const POOL_SIZE = 6;

export class PickupField {
  readonly items: Pickup[] = [];

  constructor() {
    for (let i = 0; i < POOL_SIZE; i++) {
      this.items.push({ kind: 'speed', x: 0, prevX: 0, y: 0, active: false, phase: 0 });
    }
  }

  spawn(kind: PowerupKind, x: number, y: number): Pickup | null {
    const item = this.items.find((p) => !p.active);
    if (!item) return null;
    item.kind = kind;
    item.x = x;
    item.prevX = x;
    item.y = y;
    item.phase = 0;
    item.active = true;
    return item;
  }

  update(dt: number, scrollSpeed: number): void {
    for (const item of this.items) {
      if (!item.active) continue;
      item.prevX = item.x;
      item.x -= scrollSpeed * dt;
      item.phase += dt;
      if (item.x + POWERUP.size < -8) item.active = false;
    }
  }

  reset(): void {
    for (const item of this.items) item.active = false;
  }

  static box(item: Pickup, out: Aabb): Aabb {
    out.x = item.x;
    out.y = item.y + Math.sin(item.phase * 3) * POWERUP.bobAmplitude;
    out.w = POWERUP.size;
    out.h = POWERUP.size;
    return out;
  }

  /** Same as the obstacle spawn point, so gaps measured in seconds line up. */
  static get spawnX(): number {
    return SCREEN.w + 16;
  }
}

/**
 * Weighted pick across everything currently enabled.
 * @param riskyScale Multiplies the weight of risky pickups, so easy mode sees
 * OVERDRIVE rarely rather than treating it as ordinary furniture.
 */
export function pickPowerup(random: () => number, riskyScale = 1): PowerupKind {
  const pool = ALL_KINDS.filter((k) => POWERUP_DEFS[k].enabled);
  const weightOf = (k: PowerupKind): number =>
    POWERUP_DEFS[k].weight * (POWERUP_DEFS[k].risky ? riskyScale : 1);

  const total = pool.reduce((sum, k) => sum + weightOf(k), 0);
  let roll = random() * total;
  for (const kind of pool) {
    roll -= weightOf(kind);
    if (roll <= 0) return kind;
  }
  return pool[pool.length - 1] ?? 'repair';
}

/**
 * Height a pickup floats at.
 *
 * Deliberately varied: some sit at running height and are collected by doing
 * nothing, others need a jump. That matters most for OVERDRIVE — a risky
 * pickup you have to actively avoid is a far better moment than one you
 * simply decline to reach for.
 */
export function pickupY(kind: PowerupKind, random: () => number): number {
  const high = random() < 0.5;
  const base = high ? GROUND_Y - 58 : GROUND_Y - 22;
  // Risky pickups skew low, right in the running lane, so dodging them costs
  // a real input rather than being the default.
  if (POWERUP_DEFS[kind].risky) return GROUND_Y - 22;
  return base;
}

/** Instant pickups apply and vanish; they never occupy the timed slot. */
export function isInstant(kind: PowerupKind): boolean {
  return POWERUP_DEFS[kind].instant === true;
}
