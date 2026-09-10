import { describe, expect, it } from 'vitest';

import {
  SpeedTapRun,
  defaultSpeedTapConfig,
  type SpeedTapConfig,
} from '../../../src/domain/blocks/speed-tap';

/** A short window keeps the arithmetic in these tests easy to read. */
const config: SpeedTapConfig = {
  hand: 'left',
  durationMs: 1000,
  debounceMs: 70,
  startTimeoutMs: 5000,
};

const ARMED_AT = 10_000;

/** Arms at a fixed time, then taps at the given offsets from arming. */
function armedRunWithTapsAt(
  offsets: readonly number[],
  cfg: SpeedTapConfig = config,
): SpeedTapRun {
  const run = new SpeedTapRun(cfg);
  run.arm(ARMED_AT);
  for (const offset of offsets) run.tap(ARMED_AT + offset);
  return run;
}

describe('SpeedTapRun', () => {
  describe('phases', () => {
    it('starts idle', () => {
      const run = new SpeedTapRun(config);
      expect(run.phaseAt(ARMED_AT)).toBe('idle');
      expect(run.armedAtMs).toBeNull();
      expect(run.windowStartedAtMs).toBeNull();
    });

    it('waits in armed until the first tap', () => {
      const run = new SpeedTapRun(config);
      run.arm(ARMED_AT);

      expect(run.phaseAt(ARMED_AT)).toBe('armed');
      expect(run.phaseAt(ARMED_AT + 3000)).toBe('armed');
      // Still the full duration: none of the waiting counts against it.
      expect(run.remainingMsAt(ARMED_AT + 3000)).toBe(1000);
    });

    it('runs from the first tap until the window closes', () => {
      const run = armedRunWithTapsAt([400]);

      expect(run.windowStartedAtMs).toBe(ARMED_AT + 400);
      expect(run.phaseAt(ARMED_AT + 400)).toBe('running');
      expect(run.phaseAt(ARMED_AT + 1399)).toBe('running');
      expect(run.phaseAt(ARMED_AT + 1400)).toBe('finished');
      expect(run.remainingMsAt(ARMED_AT + 900)).toBe(500);
    });

    it('refuses to be armed twice', () => {
      const run = new SpeedTapRun(config);
      run.arm(ARMED_AT);
      expect(() => run.arm(ARMED_AT + 500)).toThrow();
    });

    it('rejects nonsensical configuration at construction', () => {
      expect(() => new SpeedTapRun({ ...config, durationMs: 0 })).toThrow(RangeError);
      expect(() => new SpeedTapRun({ ...config, debounceMs: -1 })).toThrow(RangeError);
      expect(() => new SpeedTapRun({ ...config, startTimeoutMs: 0 })).toThrow(RangeError);
    });
  });

  /**
   * The regression this design exists for.
   *
   * Measured on a real tablet, the gap between pressing "I'm ready" and the
   * first tap was about a second out of ten — reporting a true 6.67 taps per
   * second as 6.1, an 8.5% undercount. That gap is person-specific and will be
   * longer in older adults, so a participant slow to get their hand into
   * position would read as a slow tapper. C1 exists to rule out exactly that
   * confound, so it must not introduce it.
   */
  describe('the window is not eaten by setup time', () => {
    it('gives the full duration however long the participant takes to start', () => {
      const promptRun = armedRunWithTapsAt([0]);
      const slowRun = armedRunWithTapsAt([3000]);

      expect(promptRun.endsAtMs).toBe(ARMED_AT + 1000);
      expect(slowRun.endsAtMs).toBe(ARMED_AT + 4000);
      expect(slowRun.phaseAt(ARMED_AT + 3999)).toBe('running');
    });

    it('gives two participants the same rate for the same tapping', () => {
      const offsets = [0, 200, 400, 600, 800];
      const prompt = armedRunWithTapsAt(offsets);
      const hesitant = armedRunWithTapsAt(offsets.map((o) => o + 3000));

      const a = prompt.result(ARMED_AT + 99_999)!;
      const b = hesitant.result(ARMED_AT + 99_999)!;

      expect(b.tapsPerSecond).toBe(a.tapsPerSecond);
      expect(b.meanIntervalMs).toBe(a.meanIntervalMs);
    });
  });

  describe('timing out', () => {
    it('finishes with no taps if the participant never starts', () => {
      const run = new SpeedTapRun(config);
      run.arm(ARMED_AT);

      expect(run.phaseAt(ARMED_AT + 4999)).toBe('armed');
      expect(run.phaseAt(ARMED_AT + 5000)).toBe('finished');

      const result = run.result(ARMED_AT + 5000)!;
      expect(result.timedOut).toBe(true);
      expect(result.acceptedCount).toBe(0);
      expect(result.spanMs).toBeNull();
    });

    it('rejects a first tap that arrives after the wait has expired', () => {
      const run = new SpeedTapRun(config);
      run.arm(ARMED_AT);
      expect(run.tap(ARMED_AT + 6000).rejection).toBe('after-window');
    });
  });

  describe('accepting taps', () => {
    it('counts taps inside the window', () => {
      const run = armedRunWithTapsAt([0, 100, 200, 300]);
      expect(run.taps.filter((t) => t.accepted)).toHaveLength(4);
    });

    it('rejects a tap before the run is armed at all', () => {
      const run = new SpeedTapRun(config);
      expect(run.tap(5_000).rejection).toBe('before-armed');
    });

    it('rejects a tap after the window closes', () => {
      const run = armedRunWithTapsAt([0]);
      expect(run.tap(ARMED_AT + 1000).rejection).toBe('after-window');
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
      const run = armedRunWithTapsAt([0, 30]);
      expect(run.taps[0]!.accepted).toBe(true);
      expect(run.taps[1]!.rejection).toBe('debounce');
    });

    it('accepts a touch exactly at the debounce boundary', () => {
      const run = armedRunWithTapsAt([0, 70]);
      expect(run.taps[1]!.accepted).toBe(true);
    });

    /**
     * The window is measured from the last ACCEPTED tap, not the last touch.
     * Measuring from the last touch would let a burst of rejected touches keep
     * pushing the window forward and swallow a genuine tap after it.
     */
    it('measures from the last accepted tap, not the last touch', () => {
      const run = armedRunWithTapsAt([0, 30, 60, 90]);
      const accepted = run.taps.filter((t) => t.accepted).map((t) => t.atMs - ARMED_AT);
      expect(accepted).toEqual([0, 90]);
    });

    /**
     * 70 ms permits about 14 taps per second — beyond what anyone sustains —
     * so genuine fast tapping is never eaten. This is the reason C1 uses a
     * shorter window than the 100 ms used elsewhere.
     */
    it('leaves genuine fast tapping at 8 Hz untouched', () => {
      const offsets = Array.from({ length: 8 }, (_, i) => i * 125);
      const run = armedRunWithTapsAt(offsets);
      expect(run.taps.every((t) => t.accepted)).toBe(true);
    });
  });

  describe('result', () => {
    it('is null until the window has closed', () => {
      const run = armedRunWithTapsAt([0, 100]);
      expect(run.result(ARMED_AT + 500)).toBeNull();
      expect(run.result(ARMED_AT + 1000)).not.toBeNull();
    });

    it('is null while still waiting for the first tap', () => {
      const run = new SpeedTapRun(config);
      run.arm(ARMED_AT);
      expect(run.result(ARMED_AT + 1000)).toBeNull();
    });

    it('computes the summary from accepted taps only', () => {
      // Five taps 200 ms apart, plus one digitiser double-report.
      const run = armedRunWithTapsAt([0, 200, 210, 400, 600, 800]);
      const result = run.result(ARMED_AT + 1000)!;

      expect(result.acceptedCount).toBe(5);
      expect(result.rejectedCount).toBe(1);
      expect(result.intervalsMs).toEqual([200, 200, 200, 200]);
      expect(result.meanIntervalMs).toBe(200);
      expect(result.sdIntervalMs).toBe(0);
      expect(result.cvInterval).toBe(0);
      expect(result.tapsPerSecond).toBe(5);
      expect(result.spanMs).toBe(800);
      expect(result.timedOut).toBe(false);
    });

    /**
     * `spanMs` catches something the rate alone hides: a participant who taps
     * briskly for three seconds and then stops has a respectable mean interval
     * but only covers part of the window.
     */
    it('reports the span so early stopping is visible', () => {
      const run = armedRunWithTapsAt([0, 100, 200]);
      expect(run.result(ARMED_AT + 1000)!.spanMs).toBe(200);
    });

    // Nothing is thrown away. If a fifth of someone's taps are being debounced
    // that must be visible in the data, not inferred from a missing count.
    it('retains rejected taps in the record', () => {
      const run = armedRunWithTapsAt([0, 30]);
      const result = run.result(ARMED_AT + 1000)!;

      expect(result.taps).toHaveLength(2);
      expect(result.taps[1]!.rejection).toBe('debounce');
      expect(result.acceptedCount).toBe(1);
    });

    it('reports nulls rather than NaN when there are too few taps', () => {
      const run = armedRunWithTapsAt([0]);
      const result = run.result(ARMED_AT + 1000)!;

      expect(result.acceptedCount).toBe(1);
      expect(result.intervalsMs).toEqual([]);
      expect(result.meanIntervalMs).toBeNull();
      expect(result.sdIntervalMs).toBeNull();
      expect(result.cvInterval).toBeNull();
      expect(result.spanMs).toBe(0);
    });

    it('stores raw timestamps, applying no correction', () => {
      // Latency correction belongs to the analysis pipeline, referencing a
      // calibration row. If it were applied here, the raw values would be lost
      // and a wrong constant could never be undone.
      const run = armedRunWithTapsAt([0, 250]);
      expect(run.result(ARMED_AT + 1000)!.taps.map((t) => t.atMs)).toEqual([
        ARMED_AT,
        ARMED_AT + 250,
      ]);
    });
  });

  describe('defaultSpeedTapConfig', () => {
    it('takes its values from the protocol, not from literals', () => {
      const cfg = defaultSpeedTapConfig('right');
      expect(cfg.hand).toBe('right');
      expect(cfg.durationMs).toBe(10_000);
      expect(cfg.debounceMs).toBe(70);
      expect(cfg.startTimeoutMs).toBe(20_000);
    });
  });
});
