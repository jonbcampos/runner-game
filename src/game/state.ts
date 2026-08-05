import {
  DIFFICULTIES,
  GROUND_Y,
  JUICE,
  JUMP_APEX_HEIGHT,
  OBSTACLE,
  PLAYER,
  WORLD,
  type Difficulty,
  type DifficultyId,
} from './config';
import { inset, overlaps, type Aabb } from './collision';
import { ObstacleField, type ObstacleKind } from './obstacles';
import { Player } from './player';
import { ShotPool } from './projectiles';
import { Rng } from '../core/rng';
import type { Input } from '../core/input';

export type Phase = 'title' | 'playing' | 'gameover';

/** Virtual pixels per displayed "meter". Purely cosmetic scoring scale. */
const PX_PER_METRE = 8;

/**
 * M1 obstacle script: a fixed, hand-placed rotation that shows every family and
 * every two-verb pairing. It is deliberately not random — the point of M1 is to
 * answer "does this feel good", and that question needs a repeatable sequence.
 * The M3 director replaces this with an authored pattern library.
 *
 * `gap` is the pause in *seconds* before the next obstacle, never pixels. Since
 * hazards travel at the scroll speed, a seconds-based gap means the player's
 * reaction time is constant as the game speeds up — the distance stretches, the
 * difficulty doesn't secretly spike.
 */
export interface ScriptBeat {
  kind: ObstacleKind;
  gap: number;
}

const M1_SCRIPT: readonly ScriptBeat[] = [
  { kind: 'spike', gap: 2.0 },
  { kind: 'beam', gap: 2.0 },
  { kind: 'drone', gap: 2.2 },
  { kind: 'spike', gap: 0.9 },
  { kind: 'spike', gap: 2.0 },
  { kind: 'beam', gap: 1.8 },
  { kind: 'drone', gap: 1.0 },
  { kind: 'beam', gap: 2.2 },
  { kind: 'drone', gap: 2.0 },
  { kind: 'spike', gap: 1.0 },
  { kind: 'beam', gap: 2.4 },
];

export class GameState {
  phase: Phase = 'title';
  difficulty: Difficulty = DIFFICULTIES.normal;

  readonly player = new Player();
  readonly obstacles = new ObstacleField();
  readonly shots = new ShotPool();
  rng = new Rng(1);

  /** Total virtual px travelled this run. */
  distance = 0;
  scrollSpeed: number = WORLD.baseScrollSpeed;
  sector = 1;
  elapsed = 0;

  best = 0;

  /** Simulation freeze on impact. Sells hits far better than any animation. */
  hitstop = 0;
  shake = 0;

  private scriptIndex = 0;
  private spawnTimer = 0;
  /**
   * The obstacle script for this run. Injectable so the contract tests can run
   * a run with a single hand-placed hazard and nothing else, and so the M3
   * director can slot in here without changing GameState.
   */
  private script: readonly ScriptBeat[] = M1_SCRIPT;

  /** Scratch boxes, reused every tick so collision allocates nothing. */
  private boxA: Aabb = { x: 0, y: 0, w: 0, h: 0 };
  private boxB: Aabb = { x: 0, y: 0, w: 0, h: 0 };
  private hurtA: Aabb = { x: 0, y: 0, w: 0, h: 0 };
  private hurtB: Aabb = { x: 0, y: 0, w: 0, h: 0 };

  get metres(): number {
    return Math.floor(this.distance / PX_PER_METRE);
  }

  start(difficultyId: DifficultyId, seed: number, script: readonly ScriptBeat[] = M1_SCRIPT): void {
    this.difficulty = DIFFICULTIES[difficultyId];
    this.script = script;
    this.rng = new Rng(seed);
    this.phase = 'playing';
    this.distance = 0;
    this.elapsed = 0;
    this.sector = 1;
    this.scrollSpeed = WORLD.baseScrollSpeed * this.difficulty.speedScale;
    this.hitstop = 0;
    this.shake = 0;
    this.scriptIndex = 0;
    // A beat of empty track before the first hazard, so the run doesn't open
    // with a reaction test before the player's thumbs are even down.
    this.spawnTimer = 1.4 * this.difficulty.spacingScale;

    this.player.reset(this.difficulty.hp, this.scrollSpeed);
    this.obstacles.reset();
    this.shots.reset();
  }

  update(dt: number, input: Input): void {
    if (this.phase !== 'playing') return;

    // Hitstop freezes the entire simulation, including input consumption, for a
    // few frames. Nothing else this cheap makes an impact land as hard.
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.decayShake(dt);
      return;
    }

    input.tick(dt);
    this.elapsed += dt;
    this.decayShake(dt);

    this.updateSpeedAndSector();

    const shot = this.player.update(dt, input, this.scrollSpeed);
    if (shot && !this.player.dead) this.shots.spawn(shot.x, shot.y);

    this.distance += this.scrollSpeed * dt;
    this.obstacles.update(dt, this.scrollSpeed);
    this.shots.update(dt);

    if (!this.player.dead) {
      this.updateSpawning(dt);
      this.resolveShotHits();
      this.resolvePlayerHits();
    } else if (this.player.feetY > GROUND_Y + 80) {
      // Body has fallen off the bottom of the screen — the run is over.
      this.endRun();
    }
  }

  private updateSpeedAndSector(): void {
    this.sector = Math.floor(this.elapsed / WORLD.sectorLength) + 1;
    const target =
      (WORLD.baseScrollSpeed + WORLD.speedPerSector * (this.sector - 1)) *
      this.difficulty.speedScale;
    this.scrollSpeed = Math.min(target, WORLD.speedCap * this.difficulty.speedScale);
  }

  private updateSpawning(dt: number): void {
    if (this.script.length === 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    const beat = this.script[this.scriptIndex % this.script.length]!;
    this.obstacles.spawn(beat.kind, ObstacleField.spawnX);
    this.scriptIndex++;
    this.spawnTimer = beat.gap * this.difficulty.spacingScale;
  }

  private resolveShotHits(): void {
    for (const shot of this.shots.shots) {
      if (!shot.active) continue;
      ShotPool.box(shot, this.boxA);

      for (const item of this.obstacles.items) {
        if (!ObstacleField.isHazardous(item)) continue;
        if (!ObstacleField.isShootable(item)) continue;

        ObstacleField.box(item, this.boxB);
        inset(this.boxB, OBSTACLE.hurtboxInset, OBSTACLE.hurtboxInset, this.hurtB);
        if (!overlaps(this.boxA, this.hurtB)) continue;

        shot.active = false;
        item.hp -= 1;
        item.hitFlash = 0.08;
        if (item.hp <= 0) {
          this.obstacles.kill(item);
          this.hitstop = Math.max(this.hitstop, JUICE.killHitstopDuration);
          this.shake = Math.max(this.shake, JUICE.shakeOnKill);
        }
        break;
      }
    }
  }

  private resolvePlayerHits(): void {
    if (this.player.invulnerable) return;

    this.player.bounds(this.boxA);
    inset(this.boxA, PLAYER.hurtboxInsetX, PLAYER.hurtboxInsetY, this.hurtA);

    for (const item of this.obstacles.items) {
      if (!ObstacleField.isHazardous(item)) continue;

      ObstacleField.box(item, this.boxB);
      inset(this.boxB, OBSTACLE.hurtboxInset, OBSTACLE.hurtboxInset, this.hurtB);
      if (!overlaps(this.hurtA, this.hurtB)) continue;

      if (this.player.takeHit()) {
        this.hitstop = JUICE.hitstopDuration;
        this.shake = JUICE.shakeOnHit;
      }
      return;
    }
  }

  private decayShake(dt: number): void {
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - this.shake * JUICE.shakeDecay * dt - 0.01);
    }
  }

  private endRun(): void {
    this.phase = 'gameover';
    if (this.metres > this.best) this.best = this.metres;
  }
}

/**
 * Cross-check the hazard dimensions against the actual jump/slide physics.
 *
 * Every one of these encodes a design contract: "a spike must be jumpable",
 * "a drone must NOT be jumpable". They're derived from config values that are
 * meant to be tuned freely, so it's entirely possible to raise the jump height
 * one afternoon and silently make every drone hoppable. This turns that from a
 * bug someone eventually notices into a console error on the next reload.
 */
export function validateDesignContracts(): string[] {
  const problems: string[] = [];
  const check = (ok: boolean, message: string) => {
    if (!ok) problems.push(message);
  };

  const apex = JUMP_APEX_HEIGHT;
  const slideH = PLAYER.slideHeight;

  check(OBSTACLE.spike.height < apex, `spike (${OBSTACLE.spike.height}) is taller than jump apex (${apex.toFixed(1)}) — unjumpable`);
  check(OBSTACLE.spike.height > slideH, `spike (${OBSTACLE.spike.height}) is shorter than a slide (${slideH}) — slideable, should require jump`);

  check(OBSTACLE.beam.clearance > slideH, `beam clearance (${OBSTACLE.beam.clearance}) is under slide height (${slideH}) — unslideable`);
  check(OBSTACLE.beam.clearance < PLAYER.height, `beam clearance (${OBSTACLE.beam.clearance}) exceeds standing height (${PLAYER.height}) — you can just run under it`);
  const beamTopAboveGround = OBSTACLE.beam.clearance + OBSTACLE.beam.height;
  check(beamTopAboveGround > apex, `beam only reaches ${beamTopAboveGround} above ground but jump apex is ${apex.toFixed(1)} — jumpable, should require slide`);

  // A slide must physically carry the player past a beam, with enough left
  // over that the press doesn't have to be frame-perfect. The danger window is
  // the beam's width plus the sliding player's own width — the hazard has to
  // clear the player's back edge, not just their front.
  const beamDangerWindow = OBSTACLE.beam.width + PLAYER.slideWidth;
  const slideSlack = PLAYER.slideDistance - beamDangerWindow;
  check(
    slideSlack >= 40,
    `slide covers ${PLAYER.slideDistance}px but a beam's danger window is ${beamDangerWindow}px — only ${slideSlack}px of timing slack, needs 40+`,
  );

  check(OBSTACLE.drone.bottomGap < slideH, `drone gap (${OBSTACLE.drone.bottomGap}) fits a slide (${slideH}) — slideable, should require shooting`);
  const droneTopAboveGround = OBSTACLE.drone.bottomGap + OBSTACLE.drone.height;
  check(droneTopAboveGround > apex, `drone only reaches ${droneTopAboveGround} above ground but jump apex is ${apex.toFixed(1)} — jumpable, should require shooting`);

  return problems;
}
