import { Audio } from './core/audio';
import { Input } from './core/input';
import { startLoop } from './core/loop';
import { Viewport } from './core/viewport';
import { PLAYER_X, type DifficultyId } from './game/config';
import { GameState, validateDesignContracts, type GameEvent } from './game/state';
import { neonRenderer } from './render/neon';
import { Particles } from './render/particles';
import { gameOverMenu, hitTestMenu, muteButton, setMutedDisplay, titleMenu } from './ui/screens';

const BEST_KEY = 'three-verbs.best';
const DIFFICULTY_KEY = 'three-verbs.difficulty';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('#game canvas missing');

const viewport = new Viewport(canvas);
const input = new Input(viewport);
const state = new GameState();
const renderer = neonRenderer;
const particles = new Particles();
const audio = new Audio();
setMutedDisplay(audio.muted);

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
function routeMenus(): void {
  const tap = input.consumeTap();
  if (!tap) return;

  if (state.phase === 'title') {
    const mute = muteButton();
    if (tap.x >= mute.x - 8 && tap.x <= mute.x + mute.w + 8 &&
        tap.y >= mute.y - 8 && tap.y <= mute.y + mute.h + 8) {
      setMutedDisplay(audio.toggleMute());
      if (!audio.muted) audio.play('select');
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
  particles.reset();
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
  const random = () => state.rng.next();
  switch (event.type) {
    case 'jump':
      audio.play('jump');
      break;
    case 'slide':
      audio.play('slide');
      break;
    case 'shoot':
      audio.play('shoot');
      break;
    case 'shoot-impact':
      particles.shotImpact(event.x, event.y, random);
      break;
    case 'land':
      particles.landing(event.x, random);
      break;
    case 'kill':
      audio.play('kill');
      particles.droneDeath(event.x, event.y, random);
      break;
    case 'hit':
      audio.play('hit');
      particles.playerDeath(event.x, event.y, random);
      break;
    case 'death':
      audio.play('death');
      particles.playerDeath(event.x, event.y, random);
      break;
    case 'sector':
      audio.play('sector');
      break;
    case 'boss-arrive':
      audio.play('sector');
      break;
    case 'boss-hurt':
      audio.play('kill');
      particles.shotImpact(event.x, event.y, random);
      break;
    case 'powerup':
      audio.play('sector');
      particles.droneDeath(event.x, event.y, random);
      break;
    case 'powerup-expire':
      audio.play('select');
      break;
    case 'boss-die':
      audio.play('death');
      particles.droneDeath(event.x, event.y, random);
      particles.droneDeath(event.x + 10, event.y + 8, random);
      break;
  }
}

/** Trailing sparks while sliding. Continuous, so it isn't an event. */
let slideSparkTimer = 0;
function updateSlideSparks(dt: number): void {
  if (state.phase !== 'playing' || !state.player.sliding) return;
  slideSparkTimer -= dt;
  if (slideSparkTimer > 0) return;
  slideSparkTimer = 0.03;
  particles.slideSpark(PLAYER_X + 2, () => state.rng.next());
}

/** One simulation step: menus, then the run itself, then presentation. */
function step(dt: number): void {
  // Any touch at all is a valid gesture to start audio with; browsers refuse
  // to create an AudioContext before one.
  if (input.consumeAnyPress()) audio.unlock();

  routeMenus();
  state.update(dt, input);
  state.drainEvents(presentEvent);
  updateSlideSparks(dt);
  particles.update(dt, state.phase === 'playing' ? state.scrollSpeed : 0);

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
  void Promise.all([import('./dev/verify'), import('./dev/tune')]).then(([v, t]) => {
    (window as unknown as Record<string, unknown>).__game = {
      state,
      input,
      viewport,
      startRun,
      audio,
      particles,
      verify: v.verify,
      tune: t.tune,
      showTuning: t.showTuning,
      // Lets a test drive the real loop body when rAF is unavailable — e.g. a
      // backgrounded tab, where the browser suspends animation frames entirely.
      step,
    };
  });
}

// Keyboard shortcut for desktop testing: Enter/Space on a menu.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Enter' && e.code !== 'Space') return;
  if (state.phase === 'title') startRun(lastDifficulty);
  else if (state.phase === 'gameover') startRun(lastDifficulty);
});
