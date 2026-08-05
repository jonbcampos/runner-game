import { MAX_DPR, VIRTUAL_H, VIRTUAL_W } from '../game/config';

/**
 * Maps the fixed virtual resolution onto whatever the real device screen is.
 *
 * The whole game is authored at VIRTUAL_W x VIRTUAL_H. This picks the largest
 * integer-friendly scale that fits, centers it (letterboxing the remainder),
 * and hands back a transform so input can convert a real touch coordinate back
 * into virtual space.
 *
 * Keeping this indirection is what makes the planned pixel-art switch cheap:
 * the virtual resolution never changes, only what gets drawn into it.
 */
export class Viewport {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  /** Virtual px -> CSS px. */
  scale = 1;
  /** Letterbox offset in CSS px. */
  offsetX = 0;
  offsetY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;

    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
  }

  resize = (): void => {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;

    // Fit the virtual frame inside the screen, preserving aspect ratio.
    this.scale = Math.min(cssW / VIRTUAL_W, cssH / VIRTUAL_H);
    this.offsetX = (cssW - VIRTUAL_W * this.scale) / 2;
    this.offsetY = (cssH - VIRTUAL_H * this.scale) / 2;

    // Everything downstream draws in virtual coordinates and this transform
    // handles both the letterbox and the device pixel ratio.
    this.ctx.setTransform(
      this.scale * dpr,
      0,
      0,
      this.scale * dpr,
      this.offsetX * dpr,
      this.offsetY * dpr,
    );
    this.ctx.imageSmoothingEnabled = false;
  };

  /** Convert a pointer event's CSS-pixel position into virtual coordinates. */
  toVirtual(clientX: number, clientY: number): { x: number; y: number } {
    return {
      x: (clientX - this.offsetX) / this.scale,
      y: (clientY - this.offsetY) / this.scale,
    };
  }
}
