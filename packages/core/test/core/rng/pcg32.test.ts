import { describe, expect, it } from 'vitest';

import { Pcg32 } from '../../../src/core/rng/pcg32';

/**
 * Chi-square statistic for observed counts against a uniform expectation.
 *
 * Every test here uses a fixed seed, so the generator is deterministic and
 * these tests cannot flake — a failure always means the implementation
 * changed, never that the dice were unkind today.
 */
function chiSquareUniform(counts: readonly number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  const expected = total / counts.length;
  return counts.reduce((acc, observed) => acc + (observed - expected) ** 2 / expected, 0);
}

describe('Pcg32', () => {
  describe('matches the reference implementation', () => {
    // These are the first six outputs of the official PCG32 demo for
    // pcg32_srandom_r(&rng, 42u, 54u). Matching them means this is genuinely
    // PCG32 and not merely a self-consistent generator of our own.
    //
    // This test is the reason reproducibility survives. If anyone ever
    // "optimises" the arithmetic, the same seed would silently start producing
    // different patterns, and pilot data would stop being comparable to the
    // final data. That failure would otherwise be invisible.
    it('reproduces the published vector for seed 42, stream 54', () => {
      const rng = new Pcg32(42n, 54n);
      const actual = Array.from({ length: 6 }, () => rng.nextUint32());

      expect(actual).toEqual([
        0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e,
      ]);
    });

    it('keeps every output inside the unsigned 32-bit range', () => {
      const rng = new Pcg32(1234n);
      for (let i = 0; i < 1000; i++) {
        const value = rng.nextUint32();
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(0xffff_ffff);
      }
    });
  });

  describe('determinism', () => {
    it('gives the same sequence for the same seed', () => {
      const first = new Pcg32(2026n);
      const second = new Pcg32(2026n);
      for (let i = 0; i < 50; i++) {
        expect(first.nextUint32()).toBe(second.nextUint32());
      }
    });

    it('gives different sequences for different seeds', () => {
      const a = new Pcg32(1n);
      const b = new Pcg32(2n);
      const drawsA = Array.from({ length: 20 }, () => a.nextUint32());
      const drawsB = Array.from({ length: 20 }, () => b.nextUint32());
      expect(drawsA).not.toEqual(drawsB);
    });

    // Independent streams are what let each trial have its own generator
    // without trials correlating with one another.
    it('gives different sequences for different streams with the same seed', () => {
      const a = new Pcg32(7n, 1n);
      const b = new Pcg32(7n, 2n);
      const drawsA = Array.from({ length: 20 }, () => a.nextUint32());
      const drawsB = Array.from({ length: 20 }, () => b.nextUint32());
      expect(drawsA).not.toEqual(drawsB);
    });
  });

  describe('nextFloat', () => {
    it('stays within [0, 1)', () => {
      const rng = new Pcg32(5n);
      for (let i = 0; i < 10_000; i++) {
        const value = rng.nextFloat();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('spreads across the unit interval', () => {
      const rng = new Pcg32(11n);
      const buckets = new Array<number>(10).fill(0);
      for (let i = 0; i < 100_000; i++) {
        const bucket = Math.floor(rng.nextFloat() * 10);
        buckets[bucket] = (buckets[bucket] ?? 0) + 1;
      }
      // df = 9; the 0.001 critical value is 27.88.
      expect(chiSquareUniform(buckets)).toBeLessThan(27.88);
    });
  });

  describe('nextInt', () => {
    it('stays within the requested half-open range', () => {
      const rng = new Pcg32(13n);
      for (let i = 0; i < 10_000; i++) {
        const value = rng.nextInt(3, 9);
        expect(value).toBeGreaterThanOrEqual(3);
        expect(value).toBeLessThan(9);
      }
    });

    it('handles a range of one', () => {
      const rng = new Pcg32(13n);
      expect(rng.nextInt(4, 5)).toBe(4);
    });

    it('supports negative bounds', () => {
      const rng = new Pcg32(17n);
      for (let i = 0; i < 1000; i++) {
        const value = rng.nextInt(-5, 5);
        expect(value).toBeGreaterThanOrEqual(-5);
        expect(value).toBeLessThan(5);
      }
    });

    /**
     * The reason `nextInt` uses rejection sampling rather than `next() % n`.
     *
     * Mirror mode (R3) measures the cost of reversing a left/right rule, and
     * that measurement assumes left and right were equally likely to begin
     * with. A generator that favoured one side would be a confound in the
     * primary novel measure of this study, and it would be invisible in the
     * data — the patterns would still look perfectly random.
     */
    it('is unbiased for a two-way choice, which mirror mode depends on', () => {
      const rng = new Pcg32(2026n);
      const counts = [0, 0];
      for (let i = 0; i < 200_000; i++) {
        const side = rng.nextInt(0, 2);
        counts[side] = (counts[side] ?? 0) + 1;
      }
      // df = 1; the 0.001 critical value is 10.83.
      expect(chiSquareUniform(counts)).toBeLessThan(10.83);
    });

    // A range that does not divide 2^32 is where modulo bias would show up.
    it('is unbiased for a range that does not divide 2^32', () => {
      const rng = new Pcg32(4242n);
      const counts = new Array<number>(7).fill(0);
      for (let i = 0; i < 140_000; i++) {
        const value = rng.nextInt(0, 7);
        counts[value] = (counts[value] ?? 0) + 1;
      }
      // df = 6; the 0.001 critical value is 22.46.
      expect(chiSquareUniform(counts)).toBeLessThan(22.46);
    });

    it('rejects a non-positive range', () => {
      const rng = new Pcg32(1n);
      expect(() => rng.nextInt(5, 5)).toThrow(RangeError);
      expect(() => rng.nextInt(5, 4)).toThrow(RangeError);
    });

    it('rejects non-integer bounds', () => {
      const rng = new Pcg32(1n);
      expect(() => rng.nextInt(0, 3.5)).toThrow(RangeError);
    });
  });

  describe('nextBool', () => {
    it('is a fair coin', () => {
      const rng = new Pcg32(31n);
      let heads = 0;
      const trials = 100_000;
      for (let i = 0; i < trials; i++) {
        if (rng.nextBool()) heads++;
      }
      expect(chiSquareUniform([heads, trials - heads])).toBeLessThan(10.83);
    });
  });

  describe('shuffle', () => {
    it('returns a permutation and leaves the input untouched', () => {
      const source = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const rng = new Pcg32(99n);
      const shuffled = rng.shuffle(source);

      expect([...shuffled].sort((a, b) => a - b)).toEqual([...source]);
      expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    /**
     * Fisher–Yates gives every permutation equal probability. The common
     * `array.sort(() => rng() - 0.5)` shortcut does not, and here that would
     * quietly skew which patterns a participant meets across 15 sessions.
     */
    it('produces every permutation about equally often', () => {
      const rng = new Pcg32(7n);
      const seen = new Map<string, number>();
      for (let i = 0; i < 60_000; i++) {
        const key = rng.shuffle(['a', 'b', 'c']).join('');
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }

      expect(seen.size).toBe(6);
      // df = 5; the 0.001 critical value is 20.52.
      expect(chiSquareUniform([...seen.values()])).toBeLessThan(20.52);
    });

    it('handles empty and single-element lists', () => {
      const rng = new Pcg32(1n);
      expect(rng.shuffle([])).toEqual([]);
      expect(rng.shuffle(['only'])).toEqual(['only']);
    });
  });

  describe('pick', () => {
    it('only ever returns an element of the list', () => {
      const rng = new Pcg32(3n);
      const options = ['LLRR', 'LRRL', 'RLLR', 'RRLL'];
      for (let i = 0; i < 1000; i++) {
        expect(options).toContain(rng.pick(options));
      }
    });

    it('throws on an empty list rather than returning undefined', () => {
      const rng = new Pcg32(1n);
      expect(() => rng.pick([])).toThrow(RangeError);
    });
  });

  describe('clone', () => {
    it('continues the same sequence without disturbing the original', () => {
      const original = new Pcg32(123n, 456n);
      original.nextUint32();
      original.nextUint32();

      const copy = original.clone();
      const fromCopy = Array.from({ length: 5 }, () => copy.nextUint32());
      const fromOriginal = Array.from({ length: 5 }, () => original.nextUint32());

      expect(fromCopy).toEqual(fromOriginal);
    });
  });
});
