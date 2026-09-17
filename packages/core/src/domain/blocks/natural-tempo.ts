/**
 * Block C2 — the natural tempo.
 *
 * Ten seconds of tapping at whatever pace feels comfortable. The median gap
 * between taps, clamped to the protocol's range, becomes the participant's
 * tempo: every paced block for the rest of the study runs at it.
 *
 * ## Why one tempo per person, locked
 *
 * Steadiness depends on tempo — the same person wobbles more, in
 * milliseconds, at a slower pace, and BAASTA (Dalla Bella et al., 2017)
 * found continuation variability differs significantly across tempi. If the
 * tempo moved between sessions, "they got steadier" and "the tempo changed"
 * would be indistinguishable. So it is measured once, at session 1, and
 * frozen. A later C2 is recorded for monitoring, never used.
 *
 * ## Why the median
 *
 * One stray gap — a hesitation, a double-touch that slipped past the
 * debounce — would drag a mean. The median ignores it. No other cleaning is
 * applied here; that is the analysis pipeline's job (M13), and the estimate
 * only needs to be robust, not perfect.
 *
 * ## Why the clamp
 *
 * Outside 500–900 ms the paced blocks stop being a timing task: too fast and
 * finger speed dominates, too slow and a trial takes minutes. A participant
 * whose natural pace falls outside is run at the boundary, and the fact that
 * they were clamped is recorded — it is a property of that participant the
 * analysis may need.
 *
 * ## Reuse, not abstraction
 *
 * The run itself — armed by a button, started by the first tap, a fixed
 * window, per-pad debounce, rejections recorded — is exactly C1's, so
 * `SpeedTapRun` is reused with C2's configuration rather than copied. The
 * shared `Block` contract is extracted at M5, now that two blocks exist.
 */

import { PROTOCOL } from '../protocol/protocol';
import { median } from '../../analysis/tap-stats';
import { type Hand, type SpeedTapConfig, type SpeedTapResult } from './speed-tap';

export interface NaturalTempoLimits {
  readonly minMs: number;
  readonly maxMs: number;
  /** Below this many usable intervals, no tempo is estimated. */
  readonly minIntervals: number;
}

export type TempoClamp = 'none' | 'raised-to-min' | 'lowered-to-max';

export interface NaturalTempoEstimate {
  /** Gaps between accepted taps that the estimate was made from. */
  readonly intervalCount: number;
  readonly medianIntervalMs: number | null;
  /**
   * The tempo to lock, in milliseconds per beat. Null when there were too
   * few intervals — never a number computed from too little data.
   */
  readonly tempoMs: number | null;
  /** Null when there is no tempo; otherwise whether and how the clamp acted. */
  readonly clamp: TempoClamp | null;
}

/** C2's run configuration: C1's mechanics, C2's timing rules. */
export function defaultNaturalTempoConfig(hand: Hand): SpeedTapConfig {
  return {
    hand,
    durationMs: PROTOCOL.naturalTempo.durationMs,
    // Comfortable tapping is far slower than C1's, so the ordinary debounce applies.
    debounceMs: PROTOCOL.cleaning.debounceMs,
    startTimeoutMs: PROTOCOL.naturalTempo.startTimeoutMs,
  };
}

export function defaultNaturalTempoLimits(): NaturalTempoLimits {
  return {
    minMs: PROTOCOL.tempo.minMs,
    maxMs: PROTOCOL.tempo.maxMs,
    minIntervals: PROTOCOL.tempo.minIntervalsForEstimate,
  };
}

/** Turns a finished C2 run into the tempo to lock. Pure; safe to call on any result. */
export function estimateNaturalTempo(
  result: SpeedTapResult,
  limits: NaturalTempoLimits = defaultNaturalTempoLimits(),
): NaturalTempoEstimate {
  if (!(limits.minMs > 0) || !(limits.maxMs >= limits.minMs) || limits.minIntervals < 1) {
    throw new RangeError('natural-tempo limits must satisfy 0 < minMs <= maxMs and minIntervals >= 1');
  }

  const intervals = result.intervalsMs;
  const medianMs = median(intervals);

  if (medianMs === null || intervals.length < limits.minIntervals) {
    return { intervalCount: intervals.length, medianIntervalMs: medianMs, tempoMs: null, clamp: null };
  }

  if (medianMs < limits.minMs) {
    return { intervalCount: intervals.length, medianIntervalMs: medianMs, tempoMs: limits.minMs, clamp: 'raised-to-min' };
  }
  if (medianMs > limits.maxMs) {
    return { intervalCount: intervals.length, medianIntervalMs: medianMs, tempoMs: limits.maxMs, clamp: 'lowered-to-max' };
  }
  return { intervalCount: intervals.length, medianIntervalMs: medianMs, tempoMs: medianMs, clamp: 'none' };
}
