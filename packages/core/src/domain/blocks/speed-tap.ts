/**
 * Block C1 — the speed tap.
 *
 * Ten seconds per hand, tapping as fast as possible. It is not a rhythm task:
 * it exists so that if a participant's timing improves over the training
 * period, the analysis can show the improvement was not simply their fingers
 * getting faster. Fast-tap rate and its variability enter the models as motor
 * covariates.
 *
 * ## Why time is an argument, never something this class reads
 *
 * Nothing here calls a clock. Every method that cares about time is handed the
 * time. Three consequences, all of which matter for a measurement instrument:
 *
 *  - The whole block is deterministic, so its tests cannot flake.
 *  - A ten-second run can be tested in microseconds by passing the timestamps
 *    it would have seen.
 *  - There is no hidden dependency on a platform clock, which is what keeps
 *    this package free of React and Node.
 *
 * The adapter in the app package owns the real clock and feeds timestamps in.
 */

import { PROTOCOL } from '../protocol/protocol';
import {
  coefficientOfVariation,
  interTapIntervals,
  mean,
  median,
  standardDeviation,
} from '../../analysis/tap-stats';

export type Hand = 'left' | 'right';

export type SpeedTapPhase = 'idle' | 'running' | 'finished';

/** Why a tap was not counted. Rejections are recorded, never silently dropped. */
export type TapRejection = 'debounce' | 'before-start' | 'after-window';

export interface RecordedTap {
  /** Raw timestamp as supplied by the adapter. Never corrected here. */
  readonly atMs: number;
  readonly accepted: boolean;
  readonly rejection: TapRejection | null;
}

export interface SpeedTapConfig {
  readonly hand: Hand;
  readonly durationMs: number;
  /**
   * Two touches on the same pad closer together than this are treated as one.
   *
   * C1 deliberately provokes rates above 6 Hz, so the ordinary 100 ms debounce
   * used elsewhere would eat genuine taps. At 70 ms a real rate of up to about
   * 14 Hz still passes, which is beyond what a human sustains, while digitiser
   * double-reports are still caught.
   */
  readonly debounceMs: number;
}

export interface SpeedTapResult {
  readonly hand: Hand;
  readonly durationMs: number;

  /** Every touch, accepted or not, in arrival order. */
  readonly taps: readonly RecordedTap[];
  readonly acceptedCount: number;
  readonly rejectedCount: number;

  readonly tapsPerSecond: number;

  /** Gaps between accepted taps: the quantity that carries the information. */
  readonly intervalsMs: readonly number[];
  readonly meanIntervalMs: number | null;
  readonly medianIntervalMs: number | null;
  readonly sdIntervalMs: number | null;
  /** Scale-free consistency, so fast and slow tappers are comparable. */
  readonly cvInterval: number | null;
}

export function defaultSpeedTapConfig(hand: Hand): SpeedTapConfig {
  return {
    hand,
    durationMs: PROTOCOL.speedTap.durationMs,
    debounceMs: PROTOCOL.cleaning.speedTapDebounceMs,
  };
}

/**
 * One ten-second run, for one hand.
 *
 * Usage: `start(t)`, then `tap(t)` for each touch, then `result()` once the
 * window has closed. Query `phaseAt(now)` to drive the UI.
 */
export class SpeedTapRun {
  readonly config: SpeedTapConfig;

  #startedAtMs: number | null = null;
  #lastAcceptedAtMs: number | null = null;
  readonly #taps: RecordedTap[] = [];

  constructor(config: SpeedTapConfig) {
    if (config.durationMs <= 0) {
      throw new RangeError(`durationMs must be positive, got ${config.durationMs}`);
    }
    if (config.debounceMs < 0) {
      throw new RangeError(`debounceMs cannot be negative, got ${config.debounceMs}`);
    }
    this.config = config;
  }

  get startedAtMs(): number | null {
    return this.#startedAtMs;
  }

  /** When the window closes. Null until the run has started. */
  get endsAtMs(): number | null {
    return this.#startedAtMs === null ? null : this.#startedAtMs + this.config.durationMs;
  }

  /** Opens the response window. Calling twice is a programming error, not a warning. */
  start(atMs: number): void {
    if (this.#startedAtMs !== null) {
      throw new Error('SpeedTapRun has already been started');
    }
    this.#startedAtMs = atMs;
  }

  phaseAt(nowMs: number): SpeedTapPhase {
    if (this.#startedAtMs === null) return 'idle';
    return nowMs < this.endsAtMs! ? 'running' : 'finished';
  }

  /** Milliseconds left in the window, floored at zero. */
  remainingMsAt(nowMs: number): number {
    if (this.#startedAtMs === null) return this.config.durationMs;
    return Math.max(0, this.endsAtMs! - nowMs);
  }

  /**
   * Records one touch and reports how it was treated.
   *
   * A rejected tap is still stored. If a fifth of someone's taps are being
   * debounced that has to be discoverable from the data — it would mean the
   * digitiser is double-reporting, or the participant is resting a finger, and
   * either would quietly distort their rate.
   */
  tap(atMs: number): RecordedTap {
    const rejection = this.#rejectionFor(atMs);
    const recorded: RecordedTap = {
      atMs,
      accepted: rejection === null,
      rejection,
    };
    this.#taps.push(recorded);
    if (recorded.accepted) {
      this.#lastAcceptedAtMs = atMs;
    }
    return recorded;
  }

  #rejectionFor(atMs: number): TapRejection | null {
    if (this.#startedAtMs === null || atMs < this.#startedAtMs) return 'before-start';
    if (atMs >= this.endsAtMs!) return 'after-window';
    if (
      this.#lastAcceptedAtMs !== null &&
      atMs - this.#lastAcceptedAtMs < this.config.debounceMs
    ) {
      return 'debounce';
    }
    return null;
  }

  /** Every touch seen so far, accepted or not. */
  get taps(): readonly RecordedTap[] {
    return this.#taps;
  }

  /**
   * The run's summary. Null until the window has closed, so a partial run can
   * never be mistaken for a complete one.
   */
  result(nowMs: number): SpeedTapResult | null {
    if (this.phaseAt(nowMs) !== 'finished') return null;

    const acceptedTimes = this.#taps.filter((t) => t.accepted).map((t) => t.atMs);
    const intervalsMs = interTapIntervals(acceptedTimes);

    return {
      hand: this.config.hand,
      durationMs: this.config.durationMs,
      taps: [...this.#taps],
      acceptedCount: acceptedTimes.length,
      rejectedCount: this.#taps.length - acceptedTimes.length,
      tapsPerSecond: acceptedTimes.length / (this.config.durationMs / 1000),
      intervalsMs,
      meanIntervalMs: mean(intervalsMs),
      medianIntervalMs: median(intervalsMs),
      sdIntervalMs: standardDeviation(intervalsMs),
      cvInterval: coefficientOfVariation(intervalsMs),
    };
  }
}
