import { Audio } from './core/audio';
import { Cast } from './core/cast';
import { Input } from './core/input';
import { startLoop } from './core/loop';
import { Viewport } from './core/viewport';
import { PLAYER_X, type DifficultyId } from './game/config';
import { environment } from './render/environment';
import { cheerUpCloud, juice, pop, resetJuice, updateJuice } from './render/juice';
import { loadSprites } from './render/sprites';
import { SOLVED_BY } from './game/obstacles';
import { GameState, validateDesignContracts, type GameEvent } from './game/state';
import { neonTheme } from './render/neon';
import { sceneRenderer } from './render/scene';
import { initTheme, nextTheme, registerTheme } from './render/theme';
import { unicornTheme } from './render/unicorn';
import { Particles } from './render/particles';
import {
  gameOverMenu,
  hitTestMenu,
  musicButton,
  muteButton,
  setMusicMutedDisplay,
  setMutedDisplay,
  themeButton,
  titleMenu,
} from './ui/screens';
import { setTouchpadActions } from './ui/touchpad';

const BEST_KEY = 'ellies-rainbow-run.best';
const DIFFICULTY_KEY = 'ellies-rainbow-run.difficulty';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('#game canvas missing');

const viewport = new Viewport(canvas);
const input = new Input(viewport);
const state = new GameState();
const renderer = sceneRenderer;

// Rainbow first: it's the default this game is named after. Neon stays as a
// second theme rather than being replaced — see decision 36.
registerTheme(unicornTheme);
registerTheme(neonTheme);
initTheme(unicornTheme.id);
const particles = new Particles();
const audio = new Audio();
const cast = new Cast(audio);
setMutedDisplay(audio.muted);
setMusicMutedDisplay(audio.musicMuted);
juice.particles = particles;
juice.onCleared = () => audio.play('twinkle');

// Painted art, voices and music: all optional (ART-PLAN.md). Without them the
// game is exactly the procedural one it shipped as.
loadSprites(import.meta.env.BASE_URL);
audio.loadRecorded(import.meta.env.BASE_URL);

// Surface any broken design contract loudly. See validateDesignContracts().
for (const problem of validateDesignContracts()) {
  console.error(`[design] ${problem}`);
}

state.best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
let lastDifficulty = (localStorage.getItem(DIFFICULTY_KEY) as DifficultyId | null) ?? 'normal';
let previousBest = state.best;

/**
 * Menu input routing.
 *
 * Menus are polled here rather than inside the simulation because they aren't
 * part of the simulation — GameState.update() early-returns unless the phase is
 * 'playing', so it stays purely about the run itself.
 */
function inside(r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  return x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 6 && y <= r.y + r.h + 6;
}

function toggleSound(): void {
  setMutedDisplay(audio.toggleMute());
  if (!audio.muted) audio.play('select');
}

function toggleMusic(): void {
  setMusicMutedDisplay(audio.toggleMusic());
  audio.play('select');
}

function routeMenus(): void {
  const tap = input.consumeTap();
  if (!tap) return;

  // The two sound toggles live on both menu screens.
  if (state.phase !== 'playing') {
    if (inside(muteButton(), tap.x, tap.y)) return toggleSound();
    if (inside(musicButton(), tap.x, tap.y)) return toggleMusic();
  }

  if (state.phase === 'title') {
    const themeBtn = themeButton();
    if (tap.x >= themeBtn.x - 8 && tap.x <= themeBtn.x + themeBtn.w + 8 &&
        tap.y >= themeBtn.y - 8 && tap.y <= themeBtn.y + themeBtn.h + 8) {
      nextTheme();
      audio.play('select');
      return;
    }
    const hit = hitTestMenu(titleMenu(), tap.x, tap.y);
    if (hit && hit.id !== 'restart' && hit.id !== 'menu') {
      audio.play('select');
      startRun(hit.id);
    }
    return;
  }

  if (state.phase === 'gameover') {
    const hit = hitTestMenu(gameOverMenu(), tap.x, tap.y);
    if (hit?.id === 'restart') {
      audio.play('select');
      startRun(lastDifficulty);
    } else if (hit?.id === 'menu') {
      audio.play('select');
      state.phase = 'title';
    }
  }
}

function startRun(difficulty: DifficultyId): void {
  lastDifficulty = difficulty;
  localStorage.setItem(DIFFICULTY_KEY, difficulty);
  previousBest = state.best;
  // A fresh seed per run. Deterministic within a run (see Rng), random between.
  state.start(difficulty, (Math.random() * 0xffffffff) >>> 0);
  // The controls follow the difficulty's hazard vocabulary: no beams, no slide
  // button. Derived from allowedKinds so the two can never disagree.
  setTouchpadActions(['shoot', ...state.difficulty.allowedKinds.map((k) => SOLVED_BY[k])]);
  particles.reset();
  resetJuice();
  cast.line('ellie', ['e.letsgo'], 1, 0.15, true);
  // Drop anything buffered by the tap that started the run, so the first frame
  // of gameplay doesn't open with a phantom jump.
  input.clearBuffers();
}

/**
 * Turn one simulation event into sound and particles.
 *
 * This lives here rather than in the game so that `src/game/` stays unaware of
 * both renderers and speakers — the same boundary that keeps the pixel-art
 * renderer a drop-in later.
 */
function presentEvent(event: GameEvent): void {
  // Math.random, not state.rng: presentation must never consume the seeded
  // simulation's random stream, or adding a dust puff would change the run.
  const random = Math.random;
  switch (event.type) {
    case 'jump':
      audio.play('jump');
      juice.sinceJump = 0;
      particles.dust(PLAYER_X + 6, 3, random, -20);
      cast.line('ellie', ['e.whee'], 0.06);
      break;
    case 'slide':
      audio.play('slide');
      particles.dust(PLAYER_X + 14, 4, random);
      break;
    case 'shoot':
      audio.play('zap');
      juice.sinceShot = 0;
      break;
    case 'shoot-impact':
      audio.play('clink');
      particles.shotImpact(event.x, event.y, random);
      break;
    case 'land':
      audio.play('land');
      juice.sinceLand = 0;
      particles.dust(event.x, 6, random);
      break;
    case 'kill':
      // Nobody is hurt: the cloud cheers up and floats away in a sparkle.
      audio.play('pop');
      cheerUpCloud(event.x, event.y, random);
      cast.line('ellie', ['e.gotit', 'e.yay'], 0.2);
      break;
    case 'hit':
      audio.play('bonk');
      juice.sinceHit = 0;
      particles.sparkle(event.x, event.y - 8, random, 8, 50);
      cast.line('ellie', ['e.uhoh'], 0.7, 0, true);
      break;
    case 'death':
      audio.play('bonk');
      juice.sinceHit = 0;
      particles.sparkle(event.x, event.y, random, 14, 80);
      cast.line('ellie', ['e.uhoh'], 1, 0, true);
      break;
    case 'sector':
      audio.play('sector');
      break;
    case 'boss-arrive':
      audio.play('sector');
      cast.line('storm', ['b.hello'], 1, 0.6, true);
      break;
    case 'boss-hurt':
      audio.play('clink', 1.2);
      particles.shotImpact(event.x, event.y, random);
      cast.line('storm', ['b.hey'], 0.35);
      break;
    case 'powerup':
      audio.play('chime');
      particles.sparkle(event.x, event.y, random, 14, 70);
      break;
    case 'repair':
      audio.play('chime');
      particles.sparkle(event.x, event.y, random, 10, 60);
      break;
    case 'powerup-expire':
      audio.play('expire');
      break;
    case 'boss-die':
      // The Storm King cheers up and floats away waving. Ellie cheers.
      audio.play('boss-pop');
      juice.sinceBossDie = 0;
      juice.sinceCheer = 0;
      pop(event.x, event.y, 70, random);
      pop(event.x + 14, event.y + 10, 40, random);
      cast.line('storm', ['b.bye'], 1, 0.3, true);
      cast.line('ellie', ['e.yay', 'e.wow'], 1, 1.3, true);
      break;
  }
}

/**
 * Footfalls: a soft patter and a puff of dust, from distance run (the same
 * clock as her run frames, so feet and sound agree at any speed).
 */
let footfallCount = 0;
function updateFootfalls(): void {
  const p = state.player;
  if (state.phase !== 'playing' || p.pose !== 'run') {
    juice.lastFootfall = state.distance;
    return;
  }
  if (state.distance - juice.lastFootfall < 22) return;
  juice.lastFootfall = state.distance;
  audio.play('step');
  if (++footfallCount % 2 === 0) particles.dust(PLAYER_X + 4, 1, Math.random, -30);
}

/**
 * Which music, now. Title and game over get the title tune; a run plays the
 * day or night track with the cycle (they crossfade as the sky does), and the
 * boss track while the Storm King is out.
 */
let wasDark = false;
let lastPhase = state.phase;
function updateMusicAndMoments(): void {
  const dark = environment().darkness > 0.7;
  if (state.phase === 'playing') {
    const bossOut = state.boss.active && state.boss.phase !== 'dying' && state.boss.phase !== 'done';
    audio.setMusic(bossOut ? 'music.boss' : dark ? 'music.night' : 'music.day');
    // Night falling is a moment: fireworks are coming.
    if (dark && !wasDark) cast.line('ellie', ['e.wow'], 0.6, 0.5);
  } else {
    audio.setMusic('music.title');
  }
  if (state.phase === 'gameover' && lastPhase === 'playing') {
    audio.play('gameover');
    cast.line('ellie', ['e.again'], 0.8, 1.6, true);
  }
  wasDark = dark;
  lastPhase = state.phase;
  audio.updateMusic();
}

/** Trailing sparks while sliding. Continuous, so it isn't an event. */
let slideSparkTimer = 0;
function updateSlideSparks(dt: number): void {
  if (state.phase !== 'playing' || !state.player.sliding) return;
  slideSparkTimer -= dt;
  if (slideSparkTimer > 0) return;
  slideSparkTimer = 0.03;
  particles.slideSpark(PLAYER_X + 2, Math.random);
}

/** One simulation step: menus, then the run itself, then presentation. */
/** Dev only: `__game.pause(true)` freezes the simulation so a scene can be staged and inspected. */
let devPaused = false;

function step(dt: number): void {
  if (devPaused) {
    updateJuice(dt, 0);
    return;
  }
  // Any touch at all is a valid gesture to start audio with; browsers refuse
  // to create an AudioContext before one.
  if (input.consumeAnyPress()) audio.unlock();

  routeMenus();
  state.update(dt, input);
  state.drainEvents(presentEvent);
  updateSlideSparks(dt);
  updateFootfalls();
  particles.update(dt, state.phase === 'playing' ? state.scrollSpeed : 0);
  updateJuice(dt, state.phase === 'playing' && state.hitstop <= 0 ? state.scrollSpeed : 0);
  updateMusicAndMoments();

  if (state.best > previousBest) {
    previousBest = state.best;
    localStorage.setItem(BEST_KEY, String(state.best));
  }
}

startLoop({
  update: step,
  render(alpha) {
    renderer.draw(viewport.ctx, state, input, alpha, particles);
  },
});

/**
 * Register the service worker in production only.
 *
 * Deliberately not in dev: a caching worker sitting in front of the Vite dev
 * server intercepts module requests and serves stale code, which produces
 * "I changed the file and nothing happened" bugs that cost far more time than
 * the worker saves.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // BASE_URL keeps this correct whether the game is served from the domain
    // root or from a GitHub Pages subpath.
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((error) => console.warn('[sw] registration failed', error));
  });
}

// Dev-only handle for poking at a live run from the console. Stripped from
// production builds by the `import.meta.env.DEV` guard.
if (import.meta.env.DEV) {
  void Promise.all([import('./dev/verify'), import('./dev/tune'), import('./dev/art')]).then(([v, t, a]) => {
    (window as unknown as Record<string, unknown>).__game = {
      state,
      input,
      viewport,
      startRun,
      audio,
      particles,
      verify: v.verify,
      checkArt: a.checkArt,
      pause: (on = true) => {
        devPaused = on;
      },
      art: a.artDebug,
      juice,
      tune: t.tune,
      showTuning: t.showTuning,
      // Lets a test drive the real loop body when rAF is unavailable — e.g. a
      // backgrounded tab, where the browser suspends animation frames entirely.
      step,
      /** Draw one frame now, for when the pane is hidden and rAF is paused. */
      render: () => renderer.draw(viewport.ctx, state, input, 1, particles),
      /** Advance the real loop body by `seconds` in fixed steps (rAF-free). */
      advance: (seconds: number) => {
        for (let t = 0; t < seconds; t += 1 / 120) step(1 / 120);
      },
    };
  });
}

// Keyboard shortcut for desktop testing: Enter/Space on a menu.
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    if (e.shiftKey) toggleMusic();
    else toggleSound();
    return;
  }
  if (e.code !== 'Enter' && e.code !== 'Space') return;
  if (state.phase === 'title') startRun(lastDifficulty);
  else if (state.phase === 'gameover') startRun(lastDifficulty);
});
