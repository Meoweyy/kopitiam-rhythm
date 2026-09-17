import { describe, expect, it } from 'vitest';

import {
  defaultNaturalTempoConfig,
  defaultNaturalTempoLimits,
  estimateNaturalTempo,
  type NaturalTempoLimits,
} from '../../../src/domain/blocks/natural-tempo';
import { SpeedTapRun } from '../../../src/domain/blocks/speed-tap';
import { PROTOCOL } from '../../../src/domain/protocol/protocol';

const limits: NaturalTempoLimits = { minMs: 500, maxMs: 900, minIntervals: 8 };

/** A finished C2 run with taps at the given gaps, starting at t = 1000. */
function finishedRunWithGaps(gapsMs: readonly number[]) {
  const run = new SpeedTapRun(defaultNaturalTempoConfig('right'));
  run.arm(0);
  let t = 1000;
  run.tap(t);
  for (const gap of gapsMs) {
    t += gap;
    run.tap(t);
  }
  return run.result(1000 + PROTOCOL.naturalTempo.durationMs)!;
}

describe('estimateNaturalTempo', () => {
  it('locks the median gap when it is inside the range', () => {
    const result = finishedRunWithGaps([650, 660, 640, 655, 645, 650, 700, 600, 650]);
    const estimate = estimateNaturalTempo(result, limits);

    expect(estimate.intervalCount).toBe(9);
    expect(estimate.medianIntervalMs).toBe(650);
    expect(estimate.tempoMs).toBe(650);
    expect(estimate.clamp).toBe('none');
  });

  it('is robust to one stray gap, because it is a median', () => {
    // A 2 s hesitation would drag a mean to ~800; the median stays put.
    const result = finishedRunWithGaps([650, 650, 650, 650, 2000, 650, 650, 650, 650]);
    expect(estimateNaturalTempo(result, limits).tempoMs).toBe(650);
  });

  it('raises a too-fast tapper to the minimum and says so', () => {
    const result = finishedRunWithGaps([400, 410, 390, 400, 405, 395, 400, 400]);
    const estimate = estimateNaturalTempo(result, limits);

    expect(estimate.medianIntervalMs).toBe(400);
    expect(estimate.tempoMs).toBe(500);
    expect(estimate.clamp).toBe('raised-to-min');
  });

  it('lowers a too-slow tapper to the maximum and says so', () => {
    const result = finishedRunWithGaps([1000, 1010, 990, 1000, 1005, 995, 1000, 1000]);
    const estimate = estimateNaturalTempo(result, limits);

    expect(estimate.medianIntervalMs).toBe(1000);
    expect(estimate.tempoMs).toBe(900);
    expect(estimate.clamp).toBe('lowered-to-max');
  });

  it('refuses to estimate from too few intervals', () => {
    // Seven gaps: one short of the minimum. The median is reported, the tempo is not.
    const result = finishedRunWithGaps([650, 650, 650, 650, 650, 650, 650]);
    const estimate = estimateNaturalTempo(result, limits);

    expect(estimate.intervalCount).toBe(7);
    expect(estimate.medianIntervalMs).toBe(650);
    expect(estimate.tempoMs).toBeNull();
    expect(estimate.clamp).toBeNull();
  });

  it('handles a run with no taps at all', () => {
    const run = new SpeedTapRun(defaultNaturalTempoConfig('right'));
    run.arm(0);
    const result = run.result(PROTOCOL.naturalTempo.startTimeoutMs)!;
    const estimate = estimateNaturalTempo(result, limits);

    expect(result.timedOut).toBe(true);
    expect(estimate.intervalCount).toBe(0);
    expect(estimate.medianIntervalMs).toBeNull();
    expect(estimate.tempoMs).toBeNull();
  });

  it('treats the boundaries as inside the range', () => {
    expect(estimateNaturalTempo(finishedRunWithGaps(Array(8).fill(500)), limits)).toMatchObject({
      tempoMs: 500,
      clamp: 'none',
    });
    expect(estimateNaturalTempo(finishedRunWithGaps(Array(8).fill(900)), limits)).toMatchObject({
      tempoMs: 900,
      clamp: 'none',
    });
  });

  it('rejects nonsensical limits', () => {
    const result = finishedRunWithGaps(Array(8).fill(650));
    expect(() => estimateNaturalTempo(result, { ...limits, minMs: 0 })).toThrow(RangeError);
    expect(() => estimateNaturalTempo(result, { ...limits, maxMs: 400 })).toThrow(RangeError);
    expect(() => estimateNaturalTempo(result, { ...limits, minIntervals: 0 })).toThrow(RangeError);
  });
});

describe('C2 configuration', () => {
  it('reuses C1 mechanics with C2 timing rules', () => {
    const config = defaultNaturalTempoConfig('left');
    expect(config.hand).toBe('left');
    expect(config.durationMs).toBe(PROTOCOL.naturalTempo.durationMs);
    expect(config.startTimeoutMs).toBe(PROTOCOL.naturalTempo.startTimeoutMs);
    // Comfortable tapping uses the ordinary debounce, not C1's shortened one.
    expect(config.debounceMs).toBe(PROTOCOL.cleaning.debounceMs);
    expect(config.debounceMs).toBeGreaterThan(PROTOCOL.cleaning.speedTapDebounceMs);
  });

  it('takes its limits from the protocol', () => {
    expect(defaultNaturalTempoLimits()).toEqual({
      minMs: PROTOCOL.tempo.minMs,
      maxMs: PROTOCOL.tempo.maxMs,
      minIntervals: PROTOCOL.tempo.minIntervalsForEstimate,
    });
  });

  it('can reach the minimum interval count inside the window at the slowest tempo', () => {
    // Ten seconds at 900 ms gives 11 gaps; the estimate needs 8. If someone
    // shortened the window or raised the minimum, C2 could become impossible
    // for exactly the slow tappers it most needs to measure.
    const gapsInWindow = Math.floor(PROTOCOL.naturalTempo.durationMs / PROTOCOL.tempo.maxMs);
    expect(gapsInWindow).toBeGreaterThanOrEqual(PROTOCOL.tempo.minIntervalsForEstimate);
  });
});
