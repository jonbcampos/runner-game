import { Input } from './core/input';
import { startLoop } from './core/loop';
import { Viewport } from './core/viewport';
import type { DifficultyId } from './game/config';
import { GameState, validateDesignContracts } from './game/state';
import { neonRenderer } from './render/neon';
import { gameOverMenu, hitTestMenu, titleMenu } from './ui/screens';

const BEST_KEY = 'three-verbs.best';
const DIFFICULTY_KEY = 'three-verbs.difficulty';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('#game canvas missing');

const viewport = new Viewport(canvas);
const input = new Input(viewport);
const state = new GameState();
const renderer = neonRenderer;

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
    const hit = hitTestMenu(titleMenu(), tap.x, tap.y);
    if (hit && hit.id !== 'restart' && hit.id !== 'menu') {
      startRun(hit.id);
    }
    return;
  }

  if (state.phase === 'gameover') {
    const hit = hitTestMenu(gameOverMenu(), tap.x, tap.y);
    if (hit?.id === 'restart') startRun(lastDifficulty);
    else if (hit?.id === 'menu') state.phase = 'title';
  }
}

function startRun(difficulty: DifficultyId): void {
  lastDifficulty = difficulty;
  localStorage.setItem(DIFFICULTY_KEY, difficulty);
  previousBest = state.best;
  // A fresh seed per run. Deterministic within a run (see Rng), random between.
  state.start(difficulty, (Math.random() * 0xffffffff) >>> 0);
  // Drop anything buffered by the tap that started the run, so the first frame
  // of gameplay doesn't open with a phantom jump.
  input.clearBuffers();
}

/** One simulation step: menus, then the run itself, then score persistence. */
function step(dt: number): void {
  routeMenus();
  state.update(dt, input);

  if (state.best > previousBest) {
    previousBest = state.best;
    localStorage.setItem(BEST_KEY, String(state.best));
  }
}

startLoop({
  update: step,
  render(alpha) {
    renderer.draw(viewport.ctx, state, input, alpha);
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
