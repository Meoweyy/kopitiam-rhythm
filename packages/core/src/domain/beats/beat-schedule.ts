/**
 * The beat schedule — when each beat of a trial is supposed to happen.
 *
 * ## Why this is its own thing
 *
 * Every paced block in the study is the same shape underneath: a list of
 * moments at which a beat falls, and a window in which the participant's taps
 * are collected and compared against those moments. R1 shows every beat. R4
 * shows the first few and then goes dark, but the beats keep falling unseen,
 * because "how far did you drift from where the beat would have been" is the
 * primary outcome. The schedule is the ground truth both are scored against,
 * so it is built once, here, and handed to whoever needs it.
 *
 * ## Why beat times are multiplied, not accumulated
 *
 * The obvious loop — `t += ioi` for each beat — is wrong for a measurement
 * instrument. A tempo like 733.3 ms is not exactly representable in floating
 * point, and the error compounds with every addition, so beat 40 lands a
 * little off the grid. Instead every beat is `start + k × ioi`, a single
 * multiplication from the anchor: the error is the same tiny amount for every
 * beat and never grows. The audio engine will follow the same rule when it
 * places clicks in a sample buffer (`frame_k = F0 + round(k × ioi × rate)`),
 * so the visual and audible beats stay on one grid.
 *
 * ## What is deliberately absent
 *
 * No clock, no randomness, no notion of "now". The schedule is data. A block
 * decides the start time, the tempo and the sides; this module only lays the
 * grid. Whether a beat is shown or hidden (R4's power cut) is not a property of
 * the grid and is not modelled here yet — it will be added when R4 is built,
 * not guessed at now.
 */

import type { Hand } from '../blocks/speed-tap';

export interface Beat {
  /** Position in the trial, from zero. */
  readonly index: number;
  /**
   * When the beat falls, in the same clock base as the taps it will be
   * compared with. Absolute, never corrected.
   */
  readonly atMs: number;
  /** Which pad this beat asks for. */
  readonly side: Hand;
}

export interface BeatScheduleConfig {
  /** When beat zero falls. Everything else is measured from here. */
  readonly startAtMs: number;
  /** Inter-onset interval: the tempo, as a gap in milliseconds. */
  readonly ioiMs: number;
  readonly beatCount: number;
  /**
   * The side every beat asks for. R1 is a single-hand block; the two-hand
   * blocks will supply a pattern of sides instead, and this field will become
   * that pattern when they exist.
   */
  readonly side: Hand;
}

/**
 * Lays out the beats of one trial.
 *
 * The result is frozen: a schedule is the ground truth a trial is scored
 * against, and nothing downstream may nudge a beat after the fact.
 */
export function buildBeatSchedule(config: BeatScheduleConfig): readonly Beat[] {
  const { startAtMs, ioiMs, beatCount, side } = config;

  if (!Number.isFinite(startAtMs)) {
    throw new RangeError(`startAtMs must be finite, got ${startAtMs}`);
  }
  if (!(ioiMs > 0) || !Number.isFinite(ioiMs)) {
    throw new RangeError(`ioiMs must be a positive finite number, got ${ioiMs}`);
  }
  if (!Number.isInteger(beatCount) || beatCount < 1) {
    throw new RangeError(`beatCount must be a positive integer, got ${beatCount}`);
  }

  const beats: Beat[] = [];
  for (let index = 0; index < beatCount; index += 1) {
    beats.push(Object.freeze({ index, atMs: beatTimeAt(startAtMs, ioiMs, index), side }));
  }
  return Object.freeze(beats);
}

/**
 * The time of beat `index` on a grid anchored at `startAtMs`.
 *
 * Exposed on its own so a presenter that wants "where is beat k" for a beat
 * beyond the schedule — the turning table keeps turning past the last cup —
 * computes it by exactly the same rule.
 */
export function beatTimeAt(startAtMs: number, ioiMs: number, index: number): number {
  return startAtMs + index * ioiMs;
}
