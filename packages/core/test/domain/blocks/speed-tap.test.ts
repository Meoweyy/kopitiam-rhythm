import { describe, expect, it } from 'vitest';

import {
  SpeedTapRun,
  defaultSpeedTapConfig,
  type SpeedTapConfig,
} from '../../../src/domain/blocks/speed-tap';

/** A short window keeps the arithmetic in these tests easy to read. */
const config: SpeedTapConfig = { hand: 'left', durationMs: 1000, debounceMs: 70 };

/** Taps a run at the given offsets from its start time. */
function runWithTapsAt(offsets: readonly number[], cfg: SpeedTapConfig = config): SpeedTapRun {
  const run = new SpeedTapRun(cfg);
  run.start(10_000);
  for (const offset of offsets) run.tap(10_000 + offset);
  return run;
}

describe('SpeedTapRun', () => {
  describe('phases', () => {
    it('starts idle and reports the full duration as remaining', () => {
      const run = new SpeedTapRun(config);
      expect(run.phaseAt(10_000)).toBe('idle');
      expect(run.remainingMsAt(10_000)).toBe(1000);
      expect(run.startedAtMs).toBeNull();
    });

    it('runs until the window closes, then finishes', () => {
      const run = new SpeedTapRun(config);
      run.start(10_000);

      expect(run.phaseAt(10_000)).toBe('running');
      expect(run.phaseAt(10_999)).toBe('running');
      expect(run.phaseAt(11_000)).toBe('finished');
      expect(run.remainingMsAt(10_400)).toBe(600);
      expect(run.remainingMsAt(99_999)).toBe(0);
    });

    it('refuses to be started twice', () => {
      const run = new SpeedTapRun(config);
      run.start(10_000);
      expect(() => run.start(10_500)).toThrow();
    });

    it('rejects a non-positive duration at construction', () => {
      expect(() => new SpeedTapRun({ ...config, durationMs: 0 })).toThrow(RangeError);
    });
  });

  describe('accepting taps', () => {
    it('counts taps inside the window', () => {
      const run = runWithTapsAt([0, 100, 200, 300]);
      expect(run.taps.filter((t) => t.accepted)).toHaveLength(4);
    });

    it('rejects a tap before the window opens', () => {
      const run = new SpeedTapRun(config);
      run.start(10_000);
      expect(run.tap(9_999).rejection).toBe('before-start');
    });

    it('rejects a tap after the window closes', () => {
      const run = runWithTapsAt([0]);
      expect(run.tap(11_000).rejection).toBe('after-window');
    });

    it('rejects taps before the run has started at all', () => {
      const run = new SpeedTapRun(config);
      expect(run.tap(5_000).rejection).toBe('before-start');
    });
  });

  describe('debounce', () => {
    /**
     * Capacitive digitisers sometimes report one touch twice a few
     * milliseconds apart. Counted, those inflate the rate and — worse — inject
     * near-zero intervals that crush the SD, making a participant look far more
     * consistent than they are.
     */
    it('drops a second touch within the debounce window', () => {
      const run = runWithTapsAt([0, 30]);
      expect(run.taps[0]!.accepted).toBe(true);
      expect(run.taps[1]!.rejection).toBe('debounce');
    });

    it('accepts a touch exactly at the debounce boundary', () => {
      const run = runWithTapsAt([0, 70]);
      expect(run.taps[1]!.accepted).toBe(true);
    });

    /**
     * The window is measured from the last ACCEPTED tap, not the last touch.
     * Measuring from the last touch would let a burst of rejected touches keep
     * pushing the window forward and swallow a genuine tap after it.
     */
    it('measures from the last accepted tap, not the last touch', () => {
      const run = runWithTapsAt([0, 30, 60, 90]);
      const accepted = run.taps.filter((t) => t.accepted).map((t) => t.atMs - 10_000);
      expect(accepted).toEqual([0, 90]);
    });

    /**
     * 70 ms permits about 14 taps per second — beyond what anyone sustains —
     * so genuine fast tapping is never eaten. This is the reason C1 uses a
     * shorter window than the 100 ms used elsewhere.
     */
    it('leaves genuine fast tapping at 8 Hz untouched', () => {
      const offsets = Array.from({ length: 8 }, (_, i) => i * 125);
      const run = runWithTapsAt(offsets);
      expect(run.taps.every((t) => t.accepted)).toBe(true);
    });
  });

  describe('result', () => {
    it('is null until the window has closed', () => {
      const run = runWithTapsAt([0, 100]);
      expect(run.result(10_500)).toBeNull();
      expect(run.result(11_000)).not.toBeNull();
    });

    it('computes the summary from accepted taps only', () => {
      // Five taps 200 ms apart, plus one digitiser double-report.
      const run = runWithTapsAt([0, 200, 210, 400, 600, 800]);
      const result = run.result(11_000)!;

      expect(result.acceptedCount).toBe(5);
      expect(result.rejectedCount).toBe(1);
      expect(result.intervalsMs).toEqual([200, 200, 200, 200]);
      expect(result.meanIntervalMs).toBe(200);
      expect(result.sdIntervalMs).toBe(0);
      expect(result.cvInterval).toBe(0);
      expect(result.tapsPerSecond).toBe(5);
    });

    // Nothing is thrown away. If a fifth of someone's taps are being debounced
    // that must be visible in the data, not inferred from a missing count.
    it('retains rejected taps in the record', () => {
      const run = runWithTapsAt([0, 30]);
      const result = run.result(11_000)!;

      expect(result.taps).toHaveLength(2);
      expect(result.taps[1]!.rejection).toBe('debounce');
      expect(result.acceptedCount).toBe(1);
    });

    it('reports nulls rather than NaN when there are too few taps', () => {
      const run = runWithTapsAt([0]);
      const result = run.result(11_000)!;

      expect(result.acceptedCount).toBe(1);
      expect(result.intervalsMs).toEqual([]);
      expect(result.meanIntervalMs).toBeNull();
      expect(result.sdIntervalMs).toBeNull();
      expect(result.cvInterval).toBeNull();
    });

    it('handles a run with no taps at all', () => {
      const run = new SpeedTapRun(config);
      run.start(10_000);
      const result = run.result(11_000)!;

      expect(result.acceptedCount).toBe(0);
      expect(result.tapsPerSecond).toBe(0);
      expect(result.meanIntervalMs).toBeNull();
    });

    it('stores raw timestamps, applying no correction', () => {
      // Latency correction belongs to the analysis pipeline, referencing a
      // calibration row. If it were applied here, the raw values would be lost
      // and a wrong constant could never be undone.
      const run = runWithTapsAt([0, 250]);
      expect(run.result(11_000)!.taps.map((t) => t.atMs)).toEqual([10_000, 10_250]);
    });
  });

  describe('defaultSpeedTapConfig', () => {
    it('takes its values from the protocol, not from literals', () => {
      const cfg = defaultSpeedTapConfig('right');
      expect(cfg.hand).toBe('right');
      expect(cfg.durationMs).toBe(10_000);
      expect(cfg.debounceMs).toBe(70);
    });
  });
});
