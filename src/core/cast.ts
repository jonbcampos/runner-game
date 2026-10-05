import type { Audio } from './audio';

/**
 * Who says what, and how often. Slingshot's lesson (its decision 18): voices
 * are lovely the first time and wearing by the tenth, and "characters
 * shouldn't talk too much". So every line goes through here:
 *
 *  - a **quiet gap** after any line from the same speaker,
 *  - a **chance** per moment, so most jumps and most clouds pass in silence,
 *  - and `Audio.say` itself refuses to talk over a line already playing.
 *
 * The big moments (the run starting, the boss arriving and leaving) are
 * always spoken; the small ones only sometimes.
 */
export class Cast {
  private readonly quietUntil = new Map<string, number>();

  constructor(private readonly audio: Audio) {}

  /** Seconds of quiet after a speaker's line. */
  private static readonly GAP: Record<string, number> = { ellie: 5, storm: 2.5 };

  private now(): number {
    return performance.now() / 1000;
  }

  /** Maybe say one of `ids`. Returns true if a line was started. */
  line(speaker: 'ellie' | 'storm', ids: readonly string[], chance = 1, delay = 0, force = false): boolean {
    const now = this.now();
    if (!force && now < (this.quietUntil.get(speaker) ?? 0)) return false;
    if (Math.random() > chance) return false;
    const said = this.audio.say(ids, { delay, interrupt: force });
    if (said) this.quietUntil.set(speaker, now + delay + (Cast.GAP[speaker] ?? 4));
    return said;
  }
}
