import { describe, expect, it } from 'vitest';

import { buildBeatSchedule } from '../../../src/domain/beats/beat-schedule';
import {
  PacedTapRun,
  defaultPacedTapConfig,
  type PacedTapConfig,
} from '../../../src/domain/blocks/paced-tap';
import { PROTOCOL } from '../../../src/domain/protocol/protocol';

const IOI = 700;
const START = 10_000;
const BEATS = buildBeatSchedule({ startAtMs: START, ioiMs: IOI, beatCount: 8, side: 'left' });
const LAST_BEAT = BEATS[BEATS.length - 1]!.atMs;

const config: PacedTapConfig = {
  beats: BEATS,
  debounceMs: 100,
  matchWindowMs: 350,
  graceMs: 1000,
};

/** A run with taps at the given absolute times, all on the left pad. */
function runWithTapsAt(times: readonly number[], cfg: PacedTapConfig = config): PacedTapRun {
  const run = new PacedTapRun(cfg);
  for (const t of times) run.tap(t, 'left');
  return run;
}

const AFTER_CLOSE = LAST_BEAT + 1000;

describe('PacedTapRun', () => {
  describe('window and phases', () => {
    it('opens one matching window before the first beat', () => {
      const run = new PacedTapRun(config);
      expect(run.windowOpensAtMs).toBe(START - 350);
      expect(run.phaseAt(START - 351)).toBe('pending');
      expect(run.phaseAt(START - 350)).toBe('running');
    });

    it('closes a grace period after the last beat', () => {
      const run = new PacedTapRun(config);
      expect(run.windowClosesAtMs).toBe(LAST_BEAT + 1000);
      expect(run.phaseAt(LAST_BEAT + 999)).toBe('running');
      expect(run.phaseAt(LAST_BEAT + 1000)).toBe('finished');
    });

    it('has no result until the window has closed', () => {
      const run = runWithTapsAt([...BEATS.map((b) => b.atMs)]);
      expect(run.result(LAST_BEAT)).toBeNull();
      expect(run.result(LAST_BEAT + 999)).toBeNull();
      expect(run.result(AFTER_CLOSE)).not.toBeNull();
    });
  });

  describe('accepting and rejecting taps', () => {
    it('accepts an early response to the first beat', () => {
      const run = runWithTapsAt([START - 200]);
      expect(run.taps[0]).toMatchObject({ accepted: true, rejection: null });
    });

    it('rejects a tap before the window opens, with the reason', () => {
      const run = runWithTapsAt([START - 351]);
      expect(run.taps[0]).toMatchObject({ accepted: false, rejection: 'before-window' });
    });

    it('rejects a tap after the window closes, with the reason', () => {
      const run = runWithTapsAt([LAST_BEAT + 1000]);
      expect(run.taps[0]).toMatchObject({ accepted: false, rejection: 'after-window' });
    });

    it('accepts a late response to the last beat, inside the grace period', () => {
      const run = runWithTapsAt([LAST_BEAT + 300]);
      expect(run.taps[0]?.accepted).toBe(true);
    });

    it('debounces a second touch on the same pad inside the debounce interval', () => {
      const run = runWithTapsAt([START, START + 99, START + 100]);
      expect(run.taps.map((t) => t.rejection)).toEqual([null, 'debounce', null]);
    });

    it('measures debounce from the last accepted tap, not the last touch', () => {
      // 0, 60 (rejected), 120: 120 is 120 from the last *accepted*, so it counts.
      const run = runWithTapsAt([START, START + 60, START + 120]);
      expect(run.taps.map((t) => t.accepted)).toEqual([true, false, true]);
    });

    it('debounces per pad, so fast left–right alternation is never collapsed', () => {
      const run = new PacedTapRun(config);
      run.tap(START, 'left');
      run.tap(START + 30, 'right');
      run.tap(START + 60, 'left');
      expect(run.taps.map((t) => [t.side, t.accepted])).toEqual([
        ['left', true],
        ['right', true],
        ['left', false],
      ]);
    });

    it('keeps every rejected tap in the record', () => {
      const run = runWithTapsAt([START - 1000, START, START + 10, AFTER_CLOSE + 5]);
      const result = run.result(AFTER_CLOSE + 10)!;
      expect(result.taps).toHaveLength(4);
      expect(result.acceptedCount).toBe(1);
      expect(result.rejectedCount).toBe(3);
    });
  });

  describe('result', () => {
    it('matches a perfect trial with zero asynchrony everywhere', () => {
      const run = runWithTapsAt(BEATS.map((b) => b.atMs));
      const result = run.result(AFTER_CLOSE)!;

      expect(result.matches).toHaveLength(8);
      expect(result.asynchroniesMs).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
      expect(result.meanAsynchronyMs).toBe(0);
      expect(result.sdAsynchronyMs).toBe(0);
      expect(result.missedBeatIndices).toEqual([]);
      expect(result.extraTapIndices).toEqual([]);
    });

    it('reports asynchrony as tap minus beat', () => {
      const run = runWithTapsAt(BEATS.map((b) => b.atMs - 30));
      const result = run.result(AFTER_CLOSE)!;

      expect(result.asynchroniesMs.every((a) => a === -30)).toBe(true);
      expect(result.meanAsynchronyMs).toBe(-30);
    });

    it('refers to taps by their position in the full record, not the accepted subset', () => {
      // Tap 0 is rejected (before window). Tap 1 matches beat 0. The match
      // must say tapIndex 1, not 0.
      const run = runWithTapsAt([START - 2000, START + 20]);
      const result = run.result(AFTER_CLOSE)!;

      expect(result.matches).toEqual([{ beatIndex: 0, tapIndex: 1, asynchronyMs: 20 }]);
    });

    it('translates extra-tap positions the same way', () => {
      // Tap 0 rejected; taps 1 and 2 both aim at beat 0; the nearer (1) wins,
      // so tap 2 is extra — reported as position 2.
      const run = runWithTapsAt([START - 2000, START + 10, START + 200]);
      const result = run.result(AFTER_CLOSE)!;

      expect(result.extraTapIndices).toEqual([2]);
    });

    it('lists missed beats when the participant stops', () => {
      const run = runWithTapsAt(BEATS.slice(0, 4).map((b) => b.atMs));
      const result = run.result(AFTER_CLOSE)!;

      expect(result.missedBeatIndices).toEqual([4, 5, 6, 7]);
      expect(result.asynchroniesMs).toHaveLength(4);
    });

    it('reports null statistics when nothing matched', () => {
      const result = runWithTapsAt([]).result(AFTER_CLOSE)!;
      expect(result.meanAsynchronyMs).toBeNull();
      expect(result.sdAsynchronyMs).toBeNull();
      expect(result.missedBeatIndices).toHaveLength(8);
    });

    it('carries the schedule through unchanged', () => {
      const result = runWithTapsAt([]).result(AFTER_CLOSE)!;
      expect(result.beats).toBe(BEATS);
    });
  });

  describe('configuration', () => {
    it('takes the protocol values by default, with the window as a fraction of the tempo', () => {
      const cfg = defaultPacedTapConfig(BEATS, IOI);
      expect(cfg.debounceMs).toBe(PROTOCOL.cleaning.debounceMs);
      expect(cfg.matchWindowMs).toBe(PROTOCOL.matching.windowFraction * IOI);
      expect(cfg.graceMs).toBe(PROTOCOL.session.trialGraceMs);
    });

    it('is satisfiable by the protocol at the slowest tempo', () => {
      // The grace must not be shorter than the window, or a late response to
      // the last beat would be cut off. Check the protocol at its widest window.
      expect(() => new PacedTapRun(defaultPacedTapConfig(BEATS, PROTOCOL.tempo.maxMs))).not.toThrow();
    });

    it('refuses an empty schedule', () => {
      expect(() => new PacedTapRun({ ...config, beats: [] })).toThrow(RangeError);
    });

    it('refuses a grace shorter than the matching window', () => {
      expect(() => new PacedTapRun({ ...config, graceMs: 349 })).toThrow(RangeError);
    });

    it('refuses a negative debounce or a bad window', () => {
      expect(() => new PacedTapRun({ ...config, debounceMs: -1 })).toThrow(RangeError);
      expect(() => new PacedTapRun({ ...config, matchWindowMs: -1 })).toThrow(RangeError);
      expect(() => new PacedTapRun({ ...config, matchWindowMs: Number.NaN })).toThrow(RangeError);
    });
  });
});
