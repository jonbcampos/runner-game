import {
  BOSS,
  DIFFICULTIES,
  GROUND_Y,
  JUICE,
  JUMP_APEX_HEIGHT,
  OBSTACLE,
  PLAYER,
  PLAYER_X,
  SHOT,
  WORLD,
  type Difficulty,
  type DifficultyId,
} from './config';
import { Boss } from './boss';
import { inset, overlaps, type Aabb } from './collision';
import { Director } from './director';
import { ObstacleField } from './obstacles';
import { Player } from './player';
import { ShotPool } from './projectiles';
import { Rng } from '../core/rng';
import type { Input } from '../core/input';

export type Phase = 'title' | 'playing' | 'gameover';

export type GameEventType =
  | 'jump'
  | 'shoot'
  /** A shot connected but didn't destroy the target. */
  | 'shoot-impact'
  | 'slide'
  | 'land'
  | 'hit'
  | 'kill'
  | 'death'
  | 'sector'
  | 'boss-arrive'
  | 'boss-hurt'
  | 'boss-die';

export interface GameEvent {
  type: GameEventType;
  x: number;
  y: number;
}

/**
 * Cap on events per tick. Far more than can actually occur, and a hard bound
 * beats an unbounded array that quietly grows.
 */
const MAX_EVENTS = 16;

/** Virtual pixels per displayed "meter". Purely cosmetic scoring scale. */
const PX_PER_METRE = 8;

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

  /** Counts down after a sector change, driving the on-screen announcement. */
  sectorFlash = 0;

  /**
   * Things that happened this tick, for sound and particles to react to.
   *
   * An event queue rather than direct calls, because `src/game/` must not know
   * that renderers or speakers exist — the same separation that keeps the
   * planned pixel-art renderer a drop-in. Slots are pre-allocated and reused,
   * so a busy frame costs no garbage.
   */
  private readonly eventPool: GameEvent[] = Array.from({ length: MAX_EVENTS }, () => ({
    type: 'jump' as GameEventType,
    x: 0,
    y: 0,
  }));
  private eventCount = 0;

  readonly boss = new Boss();
  /** Counts down after a boss dies, driving the victory banner. */
  bossVictoryFlash = 0;

  readonly director = new Director();
  /**
   * Whether the director is spawning. Off for the contract tests, which place a
   * single hazard by hand and need nothing else on the track.
   */
  private directorEnabled = true;

  /** Scratch boxes, reused every tick so collision allocates nothing. */
  private boxA: Aabb = { x: 0, y: 0, w: 0, h: 0 };
  private boxB: Aabb = { x: 0, y: 0, w: 0, h: 0 };
  private hurtA: Aabb = { x: 0, y: 0, w: 0, h: 0 };
  private hurtB: Aabb = { x: 0, y: 0, w: 0, h: 0 };

  get metres(): number {
    return Math.floor(this.distance / PX_PER_METRE);
  }

  /** Current shot reach. A plain getter for now; powerups will scale it. */
  get shotRange(): number {
    return SHOT.range;
  }

  /** Damage per shot. Same story — the stronger-gun powerup raises it. */
  get shotDamage(): number {
    return SHOT.damage;
  }

  private emit(type: GameEventType, x = 0, y = 0): void {
    if (this.eventCount >= MAX_EVENTS) return;
    const event = this.eventPool[this.eventCount++]!;
    event.type = type;
    event.x = x;
    event.y = y;
  }

  /** Hand this tick's events to a consumer, then clear them. */
  drainEvents(consume: (event: GameEvent) => void): void {
    for (let i = 0; i < this.eventCount; i++) consume(this.eventPool[i]!);
    this.eventCount = 0;
  }

  start(difficultyId: DifficultyId, seed: number, directorEnabled = true): void {
    this.difficulty = DIFFICULTIES[difficultyId];
    this.directorEnabled = directorEnabled;
    this.rng = new Rng(seed);
    this.phase = 'playing';
    this.distance = 0;
    this.elapsed = 0;
    this.sector = 1;
    this.scrollSpeed = WORLD.baseScrollSpeed * this.difficulty.speedScale;
    this.hitstop = 0;
    this.shake = 0;
    this.sectorFlash = 0;
    this.bossVictoryFlash = 0;
    this.eventCount = 0;

    this.boss.reset();
    this.director.reset(this.difficulty);
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
    if (this.sectorFlash > 0) this.sectorFlash -= dt;

    this.updateSpeedAndSector();

    const shot = this.player.update(dt, input, this.scrollSpeed);
    if (shot && !this.player.dead) {
      this.shots.spawn(shot.x, shot.y);
      this.emit('shoot', shot.x, shot.y);
    }
    if (this.player.justJumped) this.emit('jump');
    if (this.player.justSlid) this.emit('slide');
    if (this.player.justLanded) this.emit('land', PLAYER_X + PLAYER.width / 2);

    this.distance += this.scrollSpeed * dt;
    this.obstacles.update(dt, this.scrollSpeed);
    this.shots.update(dt, this.shotRange);

    if (this.bossVictoryFlash > 0) this.bossVictoryFlash -= dt;

    if (!this.player.dead) {
      this.updateBoss(dt);
      this.updateSpawning(dt);
      this.resolveShotHits();
      this.resolvePlayerHits();
    } else if (this.player.feetY > GROUND_Y + 80) {
      // Body has fallen off the bottom of the screen — the run is over.
      this.endRun();
    }
  }

  private updateSpeedAndSector(): void {
    const sector = Math.floor(this.elapsed / WORLD.sectorLength) + 1;
    if (sector !== this.sector) {
      // Escalation you can see and hear, not just feel. Without a marker the
      // game gets harder for reasons the player can't name.
      this.sectorFlash = 1.8;
      this.emit('sector');
      if (this.directorEnabled && this.isBossSector(sector) && !this.boss.active) {
        this.boss.spawn(this.difficulty);
        this.emit('boss-arrive');
      }
    }
    this.sector = sector;
    const target =
      (WORLD.baseScrollSpeed + WORLD.speedPerSector * (this.sector - 1)) *
      this.difficulty.speedScale;
    this.scrollSpeed = Math.min(target, WORLD.speedCap * this.difficulty.speedScale);
  }

  private isBossSector(sector: number): boolean {
    if (sector < WORLD.bossFirstSector) return false;
    return (sector - WORLD.bossFirstSector) % WORLD.bossEvery === 0;
  }

  private updateBoss(dt: number): void {
    if (!this.boss.active) return;
    const wasAlive = this.boss.phase !== 'dying' && this.boss.phase !== 'done';

    this.boss.update(dt, { scrollSpeed: this.scrollSpeed, rng: this.rng }, (kind, x) => {
      this.obstacles.spawn(kind, x);
    });

    if (wasAlive && this.boss.phase === 'dying') {
      this.bossVictoryFlash = 2.2;
      this.emit('boss-die', this.boss.x + BOSS.width / 2, this.boss.y + BOSS.height / 2);
      // A heal is the reward. Distance alone is a weak payoff for the hardest
      // thing in the run, and on Hard (1 HP) it's the only way to ever recover.
      if (this.player.hp < this.player.maxHp) this.player.hp += BOSS.healOnDefeat;
    }
  }

  private updateSpawning(dt: number): void {
    if (!this.directorEnabled) return;
    // The director stays quiet during a fight; the boss is the only source of
    // hazards, so the screen can't get double-loaded.
    if (this.boss.blocking) return;
    this.director.update(
      dt,
      {
        difficulty: this.difficulty,
        sector: this.sector,
        scrollSpeed: this.scrollSpeed,
        rng: this.rng,
      },
      (kind) => this.obstacles.spawn(kind, ObstacleField.spawnX),
    );
  }

  private resolveShotHits(): void {
    for (const shot of this.shots.shots) {
      if (!shot.active) continue;
      ShotPool.box(shot, this.boxA);

      if (this.boss.vulnerable) {
        this.boss.bounds(this.boxB);
        if (overlaps(this.boxA, this.boxB)) {
          shot.active = false;
          this.boss.takeHit(this.shotDamage);
          this.hitstop = Math.max(this.hitstop, JUICE.killHitstopDuration);
          this.shake = Math.max(this.shake, JUICE.shakeOnKill);
          this.emit('boss-hurt', shot.x, shot.y);
          continue;
        }
      }

      for (const item of this.obstacles.items) {
        if (!ObstacleField.isHazardous(item)) continue;
        if (!ObstacleField.isShootable(item)) continue;

        ObstacleField.box(item, this.boxB);
        inset(this.boxB, OBSTACLE.hurtboxInset, OBSTACLE.hurtboxInset, this.hurtB);
        if (!overlaps(this.boxA, this.hurtB)) continue;

        shot.active = false;
        item.hp -= 1;
        item.hitFlash = 0.08;
        this.emit('shoot-impact', shot.x, shot.y + SHOT.height / 2);
        if (item.hp <= 0) {
          this.obstacles.kill(item);
          this.hitstop = Math.max(this.hitstop, JUICE.killHitstopDuration);
          this.shake = Math.max(this.shake, JUICE.shakeOnKill);
          this.emit('kill', item.x + item.w / 2, item.y + OBSTACLE.drone.bodyHeight / 2);
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
        this.player.bounds(this.boxA);
        this.emit(
          this.player.dead ? 'death' : 'hit',
          this.boxA.x + this.boxA.w / 2,
          this.boxA.y + this.boxA.h / 2,
        );
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
