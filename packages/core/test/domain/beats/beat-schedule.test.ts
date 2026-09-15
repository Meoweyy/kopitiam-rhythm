import { describe, expect, it } from 'vitest';

import {
  beatTimeAt,
  buildBeatSchedule,
  type BeatScheduleConfig,
} from '../../../src/domain/beats/beat-schedule';

const config: BeatScheduleConfig = {
  startAtMs: 10_000,
  ioiMs: 700,
  beatCount: 8,
  side: 'left',
};

describe('buildBeatSchedule', () => {
  it('lays out exactly beatCount beats, indexed from zero', () => {
    const beats = buildBeatSchedule(config);

    expect(beats).toHaveLength(8);
    expect(beats.map((b) => b.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('puts beat zero at the start time and every later beat one tempo apart', () => {
    const beats = buildBeatSchedule(config);

    expect(beats[0]?.atMs).toBe(10_000);
    expect(beats[1]?.atMs).toBe(10_700);
    expect(beats[7]?.atMs).toBe(10_000 + 7 * 700);

    for (let k = 1; k < beats.length; k += 1) {
      expect(beats[k]!.atMs - beats[k - 1]!.atMs).toBe(700);
    }
  });

  it('gives every beat the configured side', () => {
    expect(buildBeatSchedule(config).every((b) => b.side === 'left')).toBe(true);
    expect(
      buildBeatSchedule({ ...config, side: 'right' }).every((b) => b.side === 'right'),
    ).toBe(true);
  });

  it('is unaffected by the start time being far from zero', () => {
    // Kernel uptime timestamps are large numbers — days of milliseconds — and
    // the grid must be the same shape wherever it is anchored.
    const late = buildBeatSchedule({ ...config, startAtMs: 5 * 24 * 3_600_000 + 123 });
    const early = buildBeatSchedule(config);

    for (let k = 0; k < config.beatCount; k += 1) {
      expect(late[k]!.atMs - late[0]!.atMs).toBe(early[k]!.atMs - early[0]!.atMs);
    }
  });

  describe('non-accumulating placement', () => {
    it('places every beat by the closed form start + k × ioi', () => {
      // A tempo that is not exactly representable in binary.
      const beats = buildBeatSchedule({ ...config, ioiMs: 733.3, beatCount: 200 });

      for (const beat of beats) {
        expect(beat.atMs).toBe(10_000 + beat.index * 733.3);
      }
    });

    it('is the reason: a running sum drifts off the grid, the closed form does not', () => {
      // This test documents the failure mode the design avoids. 0.1 is the
      // textbook case: ten additions of 0.1 do not make 1.
      const ioi = 0.1;
      let accumulated = 0;
      for (let k = 0; k < 10; k += 1) accumulated += ioi;

      expect(accumulated).not.toBe(1);
      expect(beatTimeAt(0, ioi, 10)).toBe(1);
    });
  });

  describe('immutability', () => {
    it('returns a frozen list of frozen beats', () => {
      const beats = buildBeatSchedule(config);

      expect(Object.isFrozen(beats)).toBe(true);
      expect(beats.every((b) => Object.isFrozen(b))).toBe(true);
    });
  });

  describe('validation', () => {
    it('rejects a non-positive or non-finite tempo', () => {
      expect(() => buildBeatSchedule({ ...config, ioiMs: 0 })).toThrow(RangeError);
      expect(() => buildBeatSchedule({ ...config, ioiMs: -700 })).toThrow(RangeError);
      expect(() => buildBeatSchedule({ ...config, ioiMs: Number.NaN })).toThrow(RangeError);
      expect(() => buildBeatSchedule({ ...config, ioiMs: Number.POSITIVE_INFINITY })).toThrow(
        RangeError,
      );
    });

    it('rejects a beat count that is not a positive integer', () => {
      expect(() => buildBeatSchedule({ ...config, beatCount: 0 })).toThrow(RangeError);
      expect(() => buildBeatSchedule({ ...config, beatCount: -1 })).toThrow(RangeError);
      expect(() => buildBeatSchedule({ ...config, beatCount: 2.5 })).toThrow(RangeError);
    });

    it('rejects a non-finite start time', () => {
      expect(() => buildBeatSchedule({ ...config, startAtMs: Number.NaN })).toThrow(RangeError);
    });

    it('allows a single beat', () => {
      expect(buildBeatSchedule({ ...config, beatCount: 1 })).toHaveLength(1);
    });
  });
});

describe('beatTimeAt', () => {
  it('extends the same grid past the end of a schedule', () => {
    const beats = buildBeatSchedule(config);
    const next = beatTimeAt(config.startAtMs, config.ioiMs, config.beatCount);

    expect(next - beats[beats.length - 1]!.atMs).toBe(config.ioiMs);
  });
});
