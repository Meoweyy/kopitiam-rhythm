import { describe, expect, it } from 'vitest';

import { summariseContinuation } from '../../src/analysis/continuation';
import { buildBeatSchedule } from '../../src/domain/beats/beat-schedule';
import { PacedTapRun, defaultPacedTapConfig } from '../../src/domain/blocks/paced-tap';

const IOI = 700;
const START = 10_000;
const CUED = 8;
const TOTAL = 20;
const BEATS = buildBeatSchedule({ startAtMs: START, ioiMs: IOI, beatCount: TOTAL, side: 'right', cuedBeats: CUED });
const END = BEATS[TOTAL - 1]!.atMs + 1000;
const EXCLUDE = 2;

/** A finished R4 trial with taps at the given absolute times. */
function trialWithTaps(times: readonly number[]) {
  const run = new PacedTapRun(defaultPacedTapConfig(BEATS, IOI));
  for (const t of times) run.tap(t, 'right');
  return run.result(END)!;
}

/** Taps on every beat, with continuation taps stretched by `driftRatio` per beat. */
function tapsWithDrift(driftRatio: number): number[] {
  return BEATS.map((b) =>
    b.cued ? b.atMs : BEATS[CUED - 1]!.atMs + (b.index - (CUED - 1)) * IOI * (1 + driftRatio),
  );
}

describe('summariseContinuation', () => {
  it('splits taps at the midpoint after the last cued beat', () => {
    const summary = summariseContinuation(trialWithTaps(BEATS.map((b) => b.atMs)), IOI, EXCLUDE);

    expect(summary.cuedBeats).toBe(8);
    expect(summary.phantomBeats).toBe(12);
    expect(summary.synchronisationTapCount).toBe(8);
    expect(summary.continuationTapCount).toBe(12);
  });

  it('counts a late response to the last cued beat as synchronisation, not continuation', () => {
    const times = BEATS.map((b) => (b.index === CUED - 1 ? b.atMs + 300 : b.atMs));
    const summary = summariseContinuation(trialWithTaps(times), IOI, EXCLUDE);

    expect(summary.synchronisationTapCount).toBe(8);
    expect(summary.continuationTapCount).toBe(12);
  });

  it('reports zero wobble and zero drift for a perfect continuation', () => {
    const summary = summariseContinuation(trialWithTaps(BEATS.map((b) => b.atMs)), IOI, EXCLUDE);

    expect(summary.continuationCv).toBe(0);
    expect(summary.synchronisationCv).toBe(0);
    expect(summary.cueDependence).toBe(0);
    expect(summary.tempoDriftRatio).toBeCloseTo(0, 12);
    expect(summary.asynchronyDriftMsPerBeat).toBeCloseTo(0, 9);
    expect(summary.matchedPhantomCount).toBe(12);
    expect(summary.missedPhantomCount).toBe(0);
  });

  it('drops the transition intervals from the consistency measures but keeps the count', () => {
    const summary = summariseContinuation(trialWithTaps(BEATS.map((b) => b.atMs)), IOI, EXCLUDE);

    // 12 continuation taps → 11 intervals → 9 after excluding the first two.
    expect(summary.continuationIntervalsMs).toHaveLength(9);
    expect(summary.excludedTransitionIntervals).toBe(2);
  });

  it('sees a 2% slow-down as tempo drift and as asynchrony sliding later each beat', () => {
    const summary = summariseContinuation(trialWithTaps(tapsWithDrift(0.02)), IOI, EXCLUDE);

    expect(summary.tempoDriftRatio).toBeCloseTo(0.02, 9);
    // Every beat the tap lands 2% of 700 ms = 14 ms later than the last.
    expect(summary.asynchronyDriftMsPerBeat).toBeCloseTo(14, 6);
    // Steady drift is not wobble: the gaps are all the same length.
    expect(summary.continuationCv).toBeCloseTo(0, 12);
  });

  it('shows cue dependence when continuation is wobblier than synchronisation', () => {
    const times = BEATS.map((b, k) => (b.cued ? b.atMs : b.atMs + (k % 2 === 0 ? 40 : -40)));
    const summary = summariseContinuation(trialWithTaps(times), IOI, EXCLUDE);

    expect(summary.synchronisationCv).toBe(0);
    expect(summary.continuationCv).toBeGreaterThan(0.05);
    expect(summary.cueDependence).toBe(summary.continuationCv);
  });

  it('reports nulls, not numbers, when the participant stopped at the cut-off', () => {
    const summary = summariseContinuation(trialWithTaps(BEATS.filter((b) => b.cued).map((b) => b.atMs)), IOI, EXCLUDE);

    expect(summary.continuationTapCount).toBe(0);
    expect(summary.continuationCv).toBeNull();
    expect(summary.cueDependence).toBeNull();
    expect(summary.tempoDriftRatio).toBeNull();
    expect(summary.asynchronyDriftMsPerBeat).toBeNull();
    expect(summary.missedPhantomCount).toBe(12);
  });

  it('keeps an extra tap in the dark as a continuation event', () => {
    // Taps arrive in time order, so the extra one is spliced in where it happened.
    const times = [...BEATS.map((b) => b.atMs), BEATS[12]!.atMs + 350].sort((a, b) => a - b);
    const summary = summariseContinuation(trialWithTaps(times), IOI, EXCLUDE);

    expect(summary.continuationTapCount).toBe(13);
    // An extra tap makes short intervals: the descriptive CV rises. Cleaning is M13's.
    expect(summary.continuationCv).toBeGreaterThan(0);
  });

  it('does not count a response to the first trailing click as continuation', () => {
    // The power comes back on one beat after the last phantom; a tap there is
    // a response to that click, not a continuation tap.
    const trailing = BEATS[TOTAL - 1]!.atMs + IOI;
    const times = [...BEATS.map((b) => b.atMs), trailing + 30];
    const summary = summariseContinuation(trialWithTaps(times), IOI, EXCLUDE);

    expect(summary.continuationTapCount).toBe(12);
  });

  it('works when every beat is cued — there is simply no continuation', () => {
    const allCued = buildBeatSchedule({ startAtMs: START, ioiMs: IOI, beatCount: 8, side: 'right' });
    const run = new PacedTapRun(defaultPacedTapConfig(allCued, IOI));
    for (const b of allCued) run.tap(b.atMs, 'right');
    const summary = summariseContinuation(run.result(allCued[7]!.atMs + 1000)!, IOI, EXCLUDE);

    expect(summary.phantomBeats).toBe(0);
    expect(summary.continuationTapCount).toBe(0);
    expect(summary.continuationCv).toBeNull();
  });

  it('rejects a bad tempo or exclusion count', () => {
    const result = trialWithTaps([]);
    expect(() => summariseContinuation(result, 0, EXCLUDE)).toThrow(RangeError);
    expect(() => summariseContinuation(result, IOI, -1)).toThrow(RangeError);
    expect(() => summariseContinuation(result, IOI, 1.5)).toThrow(RangeError);
  });
});
