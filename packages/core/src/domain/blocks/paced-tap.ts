/**
 * A paced-tap trial — tap along with a schedule of beats.
 *
 * This is the collecting half of every synchronisation block (R1 first; R2–R4
 * reuse it). It is handed a beat schedule, accepts taps as they arrive, decides
 * whether each one counts, and when the trial is over asks the matcher which
 * beat each tap was aiming at. It does no scoring of its own.
 *
 * ## What "counts"
 *
 * A tap is accepted when it falls inside the trial window and is not a
 * double-report of a tap just accepted on the same pad. Everything else is
 * recorded with a reason, never dropped — the same rule as C1, for the same
 * reason: if a third of a participant's taps are being rejected, the data must
 * be able to say so.
 *
 * The window opens one matching-window before the first beat, because a tap
 * slightly ahead of beat zero is an ordinary early response and must be
 * matchable. It closes a grace period after the last beat, so a late response
 * to the final beat is not cut off.
 *
 * Debounce is per pad. A genuine fast left–right alternation is two taps on
 * two pads and must never be collapsed into one; only two touches on the
 * *same* pad within the debounce interval are treated as one.
 *
 * ## Time is an argument
 *
 * As in C1, nothing here reads a clock. The schedule's times are absolute, in
 * whatever base the adapter supplies taps in, and every query takes "now".
 *
 * ## Descriptive, not analytical
 *
 * The mean and SD of asynchrony in the result are descriptive, for the
 * researcher's screen and for development. They are computed from whatever
 * matched, with no sufficiency gate — the gate (`sufficiency.minMatchedForAsynchrony`)
 * belongs to the analysis pipeline at M13, alongside the cleaning steps that
 * must run before it. This mirrors C1, which reports CV without gating it.
 */

import { PROTOCOL } from '../protocol/protocol';
import { matchTapsToBeats, type BeatTapMatch } from '../../analysis/matching';
import { mean, standardDeviation } from '../../analysis/tap-stats';
import type { Beat } from '../beats/beat-schedule';
import type { Hand } from './speed-tap';

/** `pending` before the window opens, `running` inside it, `finished` after. */
export type PacedTapPhase = 'pending' | 'running' | 'finished';

export type PacedTapRejection = 'before-window' | 'after-window' | 'debounce';

export interface PacedTap {
  /** Raw timestamp as supplied by the adapter. Never corrected here. */
  readonly atMs: number;
  /** Which pad was touched. Recorded as a fact; not used for matching yet. */
  readonly side: Hand;
  readonly accepted: boolean;
  readonly rejection: PacedTapRejection | null;
}

export interface PacedTapConfig {
  /** The beats to tap along with. Built by `buildBeatSchedule`; must be non-empty. */
  readonly beats: readonly Beat[];
  /** Two touches on the same pad closer than this are one touch. */
  readonly debounceMs: number;
  /** A tap within this of a beat may be matched to it. */
  readonly matchWindowMs: number;
  /** How long after the last beat the window stays open. */
  readonly graceMs: number;
}

export interface PacedTapResult {
  readonly beats: readonly Beat[];
  /** Every touch, accepted or not, in arrival order. */
  readonly taps: readonly PacedTap[];
  readonly acceptedCount: number;
  readonly rejectedCount: number;

  /**
   * One per matched beat, in beat order. `tapIndex` refers to a position in
   * `taps` above — the full list — not to the accepted subset.
   */
  readonly matches: readonly BeatTapMatch[];
  /** Beats no accepted tap came close enough to. */
  readonly missedBeatIndices: readonly number[];
  /** Accepted taps that won no beat, as positions in `taps`. */
  readonly extraTapIndices: readonly number[];

  /** `tap − beat` for each match, in beat order. Negative is early. */
  readonly asynchroniesMs: readonly number[];
  readonly meanAsynchronyMs: number | null;
  readonly sdAsynchronyMs: number | null;
}

/**
 * The protocol's rules for a given schedule. `ioiMs` is needed because the
 * matching window is a fraction of the tempo, and a schedule of one beat
 * cannot reveal its own tempo.
 */
export function defaultPacedTapConfig(beats: readonly Beat[], ioiMs: number): PacedTapConfig {
  return {
    beats,
    debounceMs: PROTOCOL.cleaning.debounceMs,
    matchWindowMs: PROTOCOL.matching.windowFraction * ioiMs,
    graceMs: PROTOCOL.session.trialGraceMs,
  };
}

/**
 * One trial.
 *
 * Usage: construct with a schedule whose times are already absolute, then
 * `tap(t, side)` for each touch, then `result(now)` once `phaseAt(now)` is
 * `finished`.
 */
export class PacedTapRun {
  readonly config: PacedTapConfig;

  readonly #taps: PacedTap[] = [];
  readonly #lastAcceptedAtMs: { left: number | null; right: number | null } = {
    left: null,
    right: null,
  };

  constructor(config: PacedTapConfig) {
    if (config.beats.length === 0) {
      throw new RangeError('a paced-tap run needs at least one beat');
    }
    if (config.debounceMs < 0) {
      throw new RangeError(`debounceMs cannot be negative, got ${config.debounceMs}`);
    }
    if (!(config.matchWindowMs >= 0) || !Number.isFinite(config.matchWindowMs)) {
      throw new RangeError(`matchWindowMs must be non-negative and finite, got ${config.matchWindowMs}`);
    }
    // A grace shorter than the matching window would reject a late-but-
    // matchable response to the last beat as "after the window". The protocol
    // constants satisfy this; the check is here so a hand-built config cannot.
    if (config.graceMs < config.matchWindowMs) {
      throw new RangeError(
        `graceMs (${config.graceMs}) must be at least matchWindowMs (${config.matchWindowMs})`,
      );
    }
    this.config = config;
  }

  /** When taps start to count: one matching window ahead of the first beat. */
  get windowOpensAtMs(): number {
    return this.config.beats[0]!.atMs - this.config.matchWindowMs;
  }

  /** When taps stop counting: the grace period after the last beat. */
  get windowClosesAtMs(): number {
    return this.config.beats[this.config.beats.length - 1]!.atMs + this.config.graceMs;
  }

  phaseAt(nowMs: number): PacedTapPhase {
    if (nowMs < this.windowOpensAtMs) return 'pending';
    if (nowMs < this.windowClosesAtMs) return 'running';
    return 'finished';
  }

  /** Every touch seen so far, accepted or not. */
  get taps(): readonly PacedTap[] {
    return this.#taps;
  }

  /** Records one touch and reports how it was treated. */
  tap(atMs: number, side: Hand): PacedTap {
    const rejection = this.#rejectionFor(atMs, side);
    const recorded: PacedTap = { atMs, side, accepted: rejection === null, rejection };
    this.#taps.push(recorded);

    if (recorded.accepted) this.#lastAcceptedAtMs[side] = atMs;
    return recorded;
  }

  #rejectionFor(atMs: number, side: Hand): PacedTapRejection | null {
    if (atMs < this.windowOpensAtMs) return 'before-window';
    if (atMs >= this.windowClosesAtMs) return 'after-window';

    const last = this.#lastAcceptedAtMs[side];
    if (last !== null && atMs - last < this.config.debounceMs) return 'debounce';
    return null;
  }

  /**
   * The trial's summary. Null until the window has closed, so a partial trial
   * can never be mistaken for a complete one.
   */
  result(nowMs: number): PacedTapResult | null {
    if (this.phaseAt(nowMs) !== 'finished') return null;

    // The matcher sees only accepted taps; its tap indices are translated back
    // to positions in the full list so a consumer never has to know that.
    const acceptedPositions: number[] = [];
    const acceptedTimes: number[] = [];
    this.#taps.forEach((tap, position) => {
      if (tap.accepted) {
        acceptedPositions.push(position);
        acceptedTimes.push(tap.atMs);
      }
    });

    const beatTimes = this.config.beats.map((b) => b.atMs);
    const matched = matchTapsToBeats(beatTimes, acceptedTimes, this.config.matchWindowMs);

    const matches = matched.matches.map((m) => ({
      ...m,
      tapIndex: acceptedPositions[m.tapIndex]!,
    }));
    const asynchroniesMs = matches.map((m) => m.asynchronyMs);

    return {
      beats: this.config.beats,
      taps: [...this.#taps],
      acceptedCount: acceptedTimes.length,
      rejectedCount: this.#taps.length - acceptedTimes.length,
      matches,
      missedBeatIndices: matched.missedBeatIndices,
      extraTapIndices: matched.extraTapIndices.map((i) => acceptedPositions[i]!),
      asynchroniesMs,
      meanAsynchronyMs: mean(asynchroniesMs),
      sdAsynchronyMs: standardDeviation(asynchroniesMs),
    };
  }
}
