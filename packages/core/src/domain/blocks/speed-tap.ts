/**
 * Block C1 — the speed tap.
 *
 * Ten seconds per hand, tapping as fast as possible. It is not a rhythm task:
 * it exists so that if a participant's timing improves over the training
 * period, the analysis can show the improvement was not simply their fingers
 * getting faster. Fast-tap rate and its variability enter the models as motor
 * covariates.
 *
 * ## Why the window starts on the first tap
 *
 * The obvious design — start counting when the participant presses "ready" —
 * quietly measures the wrong thing. Between pressing the button and the first
 * tap there is a gap while the hand moves and the person gets poised, and that
 * gap lands inside the measured window.
 *
 * Measured on the real device, that cost about a second out of ten: a rate of
 * 6.67 taps per second was reported as 6.1, an 8.5% undercount. Worse, the gap
 * is person-specific and will be longer in exactly the population this study is
 * for. A participant slow to get their hand into position would look like a
 * slow tapper, which is precisely the confound C1 exists to rule out.
 *
 * So the run is *armed* by the button and *starts* on the first accepted tap.
 * The ten seconds then contain nothing but tapping.
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

/**
 * `idle` before arming, `armed` while waiting for the first tap, `running`
 * once the window has opened, `finished` when it closes — or when the
 * participant never tapped at all and the wait timed out.
 */
export type SpeedTapPhase = 'idle' | 'armed' | 'running' | 'finished';

/** Why a tap was not counted. Rejections are recorded, never silently dropped. */
export type TapRejection = 'before-armed' | 'debounce' | 'after-window';

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
  /**
   * How long to wait for the first tap before giving up.
   *
   * Without this an armed run would sit open forever if a participant did not
   * understand the instruction or simply stopped, and the session could not
   * move on. A timed-out run finishes with zero taps and is visibly empty in
   * the data rather than silently absent.
   */
  readonly startTimeoutMs: number;
}

export interface SpeedTapResult {
  readonly hand: Hand;
  /** The nominal window length, not the elapsed wall time. */
  readonly durationMs: number;

  /** Every touch, accepted or not, in arrival order. */
  readonly taps: readonly RecordedTap[];
  readonly acceptedCount: number;
  readonly rejectedCount: number;

  /** True when the participant never tapped and the wait timed out. */
  readonly timedOut: boolean;

  readonly tapsPerSecond: number;
  /**
   * First to last accepted tap. Should sit just under `durationMs`; a much
   * smaller value means the participant stopped early, which the rate alone
   * would not reveal.
   */
  readonly spanMs: number | null;

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
    startTimeoutMs: PROTOCOL.speedTap.startTimeoutMs,
  };
}

/**
 * One run, for one hand.
 *
 * Usage: `arm(t)` when the participant says they are ready, then `tap(t)` for
 * each touch — the first accepted one opens the window — then `result()` once
 * the window has closed. Query `phaseAt(now)` to drive the UI.
 */
export class SpeedTapRun {
  readonly config: SpeedTapConfig;

  #armedAtMs: number | null = null;
  #windowStartedAtMs: number | null = null;
  #lastAcceptedAtMs: number | null = null;
  readonly #taps: RecordedTap[] = [];

  constructor(config: SpeedTapConfig) {
    if (config.durationMs <= 0) {
      throw new RangeError(`durationMs must be positive, got ${config.durationMs}`);
    }
    if (config.debounceMs < 0) {
      throw new RangeError(`debounceMs cannot be negative, got ${config.debounceMs}`);
    }
    if (config.startTimeoutMs <= 0) {
      throw new RangeError(`startTimeoutMs must be positive, got ${config.startTimeoutMs}`);
    }
    this.config = config;
  }

  get armedAtMs(): number | null {
    return this.#armedAtMs;
  }

  /** When the first accepted tap landed, which is when the window opened. */
  get windowStartedAtMs(): number | null {
    return this.#windowStartedAtMs;
  }

  /** When the window closes. Null until the first tap has opened it. */
  get endsAtMs(): number | null {
    return this.#windowStartedAtMs === null
      ? null
      : this.#windowStartedAtMs + this.config.durationMs;
  }

  /** Readies the run. Calling twice is a programming error, not a warning. */
  arm(atMs: number): void {
    if (this.#armedAtMs !== null) {
      throw new Error('SpeedTapRun has already been armed');
    }
    this.#armedAtMs = atMs;
  }

  /** True once the participant waited too long without tapping. */
  #hasTimedOutAt(nowMs: number): boolean {
    return (
      this.#armedAtMs !== null &&
      this.#windowStartedAtMs === null &&
      nowMs - this.#armedAtMs >= this.config.startTimeoutMs
    );
  }

  phaseAt(nowMs: number): SpeedTapPhase {
    if (this.#armedAtMs === null) return 'idle';
    if (this.#windowStartedAtMs === null) {
      return this.#hasTimedOutAt(nowMs) ? 'finished' : 'armed';
    }
    return nowMs < this.endsAtMs! ? 'running' : 'finished';
  }

  /** Milliseconds left in the window, floored at zero. Full while armed. */
  remainingMsAt(nowMs: number): number {
    if (this.#windowStartedAtMs === null) return this.config.durationMs;
    return Math.max(0, this.endsAtMs! - nowMs);
  }

  /**
   * Records one touch and reports how it was treated.
   *
   * The first accepted tap opens the window and is itself counted, so the ten
   * seconds contain tapping from their very first instant.
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
      this.#windowStartedAtMs ??= atMs;
      this.#lastAcceptedAtMs = atMs;
    }
    return recorded;
  }

  #rejectionFor(atMs: number): TapRejection | null {
    if (this.#armedAtMs === null || atMs < this.#armedAtMs) return 'before-armed';

    // Waiting for the first tap: it can only be too late, never too early.
    if (this.#windowStartedAtMs === null) {
      return this.#hasTimedOutAt(atMs) ? 'after-window' : null;
    }

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

    const first = acceptedTimes[0];
    const last = acceptedTimes[acceptedTimes.length - 1];
    const spanMs = first === undefined || last === undefined ? null : last - first;

    return {
      hand: this.config.hand,
      durationMs: this.config.durationMs,
      taps: [...this.#taps],
      acceptedCount: acceptedTimes.length,
      rejectedCount: this.#taps.length - acceptedTimes.length,
      timedOut: this.#windowStartedAtMs === null,
      tapsPerSecond: acceptedTimes.length / (this.config.durationMs / 1000),
      spanMs,
      intervalsMs,
      meanIntervalMs: mean(intervalsMs),
      medianIntervalMs: median(intervalsMs),
      sdIntervalMs: standardDeviation(intervalsMs),
      cvInterval: coefficientOfVariation(intervalsMs),
    };
  }
}
