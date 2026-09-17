/**
 * Continuation — what the taps did after the cue stopped.
 *
 * This is the descriptive summary of an R4 trial: the numbers the proposal
 * names as outcomes, computed plainly from a finished `PacedTapResult`.
 *
 *  - **Continuation consistency** — CV of the gaps between taps after the
 *    cut-off. The primary outcome.
 *  - **Synchronisation consistency** — the same, for the cued part.
 *  - **Cue dependence** — continuation minus synchronisation: how much worse
 *    a person gets when the cue is taken away.
 *  - **Drift** — two views of the same thing. The tempo ratio: how much the
 *    continuation gaps differ from the tempo (+0.02 = 2% slow). And the
 *    asynchrony slope against the phantom beats: how many milliseconds per
 *    beat the taps slide.
 *
 * ## Where the cut-off is, and where the end is
 *
 * A tap is *continuation* if it falls after the midpoint between the last
 * cued beat and the first phantom, and before the midpoint after the last
 * phantom. A late-but-matchable response to the last cued beat is still
 * synchronisation; the first tap that could only belong to a phantom is
 * continuation; a tap to the first trailing click — the power coming back
 * on — is neither. This is decided by time, not by matching, so an extra tap
 * in the dark still counts as a continuation event — the analysis pipeline
 * (M13) is what decides whether it is an artefact.
 *
 * ## Transition intervals
 *
 * The first intervals after the cut-off are re-anchoring, not steady
 * continuation, and are excluded from the consistency measures — the count
 * comes from the protocol (`blackout.transitionIntervalsExcluded`), and it is
 * pre-registered. They are still in the record.
 *
 * ## Descriptive, not analytical
 *
 * As with `tap-stats`: no outlier policy, no sufficiency gate, `null` rather
 * than `NaN` when there is too little. The pipeline at M13 applies the
 * cleaning rules in their fixed order before it computes anything; this
 * summary exists so the researcher's screen and the development build can
 * see the trial straight away.
 */

import type { PacedTapResult } from '../domain/blocks/paced-tap';
import { coefficientOfVariation, interTapIntervals, mean, slope, standardDeviation } from './tap-stats';

export interface ContinuationSummary {
  readonly cuedBeats: number;
  readonly phantomBeats: number;

  /** Accepted taps before and after the cut-off. */
  readonly synchronisationTapCount: number;
  readonly continuationTapCount: number;

  /** Gaps between continuation taps, after the transition intervals were dropped. */
  readonly continuationIntervalsMs: readonly number[];
  readonly excludedTransitionIntervals: number;

  readonly synchronisationCv: number | null;
  /** The primary outcome, descriptively. */
  readonly continuationCv: number | null;
  /** `continuationCv − synchronisationCv`. Null if either is null. */
  readonly cueDependence: number | null;

  readonly continuationMeanIntervalMs: number | null;
  readonly continuationSdIntervalMs: number | null;
  /** `mean continuation interval / tempo − 1`. Positive is slowing down. */
  readonly tempoDriftRatio: number | null;

  /** Phantom beats that received a tap, and the slope of their asynchrony per beat. */
  readonly matchedPhantomCount: number;
  readonly missedPhantomCount: number;
  readonly asynchronyDriftMsPerBeat: number | null;
}

export function summariseContinuation(
  result: PacedTapResult,
  ioiMs: number,
  excludedTransitionIntervals: number,
): ContinuationSummary {
  if (!(ioiMs > 0) || !Number.isFinite(ioiMs)) {
    throw new RangeError(`ioiMs must be a positive finite number, got ${ioiMs}`);
  }
  if (!Number.isInteger(excludedTransitionIntervals) || excludedTransitionIntervals < 0) {
    throw new RangeError(
      `excludedTransitionIntervals must be a non-negative integer, got ${excludedTransitionIntervals}`,
    );
  }

  const beats = result.beats;
  const cued = beats.filter((b) => b.cued);
  const phantom = beats.filter((b) => !b.cued);
  const lastCued = cued[cued.length - 1];
  if (lastCued === undefined) {
    throw new RangeError('a trial must have at least one cued beat');
  }

  // The cut-off: halfway from the last cued beat to where the next beat falls,
  // whether or not there is a phantom there. The end: halfway past the last
  // beat on the grid, so a response to a trailing click is not continuation.
  const cutOffMs = lastCued.atMs + ioiMs / 2;
  const endMs = beats[beats.length - 1]!.atMs + ioiMs / 2;

  const accepted = result.taps.filter((t) => t.accepted).map((t) => t.atMs).sort((a, b) => a - b);
  const syncTaps = accepted.filter((t) => t < cutOffMs);
  const contTaps = accepted.filter((t) => t >= cutOffMs && t < endMs);

  const allContIntervals = interTapIntervals(contTaps);
  const continuationIntervalsMs = allContIntervals.slice(excludedTransitionIntervals);
  const excluded = Math.min(excludedTransitionIntervals, allContIntervals.length);

  const synchronisationCv = coefficientOfVariation(interTapIntervals(syncTaps));
  const continuationCv = coefficientOfVariation(continuationIntervalsMs);
  const continuationMean = mean(continuationIntervalsMs);

  // Asynchrony of taps matched to phantom beats, against the beat index.
  const phantomIndices = new Set(phantom.map((b) => b.index));
  const phantomMatches = result.matches.filter((m) => phantomIndices.has(m.beatIndex));
  const asynchronyDriftMsPerBeat = slope(
    phantomMatches.map((m) => m.beatIndex),
    phantomMatches.map((m) => m.asynchronyMs),
  );

  return {
    cuedBeats: cued.length,
    phantomBeats: phantom.length,
    synchronisationTapCount: syncTaps.length,
    continuationTapCount: contTaps.length,
    continuationIntervalsMs,
    excludedTransitionIntervals: excluded,
    synchronisationCv,
    continuationCv,
    cueDependence:
      continuationCv === null || synchronisationCv === null ? null : continuationCv - synchronisationCv,
    continuationMeanIntervalMs: continuationMean,
    continuationSdIntervalMs: standardDeviation(continuationIntervalsMs),
    tempoDriftRatio: continuationMean === null ? null : continuationMean / ioiMs - 1,
    matchedPhantomCount: phantomMatches.length,
    missedPhantomCount: phantom.length - phantomMatches.length,
    asynchronyDriftMsPerBeat,
  };
}
