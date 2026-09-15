import { describe, expect, it } from 'vitest';

import { matchTapsToBeats } from '../../src/analysis/matching';

/** Eight beats at 700 ms, as R1 at a typical tempo would lay them out. */
const IOI = 700;
const BEATS = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => 10_000 + k * IOI);
const WINDOW = IOI / 2;

describe('matchTapsToBeats', () => {
  it('matches a perfect trial one-to-one with zero asynchrony', () => {
    const result = matchTapsToBeats(BEATS, BEATS, WINDOW);

    expect(result.matches).toHaveLength(8);
    expect(result.matches.map((m) => m.asynchronyMs)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(result.missedBeatIndices).toEqual([]);
    expect(result.extraTapIndices).toEqual([]);
  });

  it('reports asynchrony as tap minus beat: negative early, positive late', () => {
    const taps = [BEATS[0]! - 40, BEATS[1]! + 25];
    const result = matchTapsToBeats(BEATS.slice(0, 2), taps, WINDOW);

    expect(result.matches).toEqual([
      { beatIndex: 0, tapIndex: 0, asynchronyMs: -40 },
      { beatIndex: 1, tapIndex: 1, asynchronyMs: 25 },
    ]);
  });

  it('reports a beat with no tap in range as missed', () => {
    const taps = BEATS.filter((_, k) => k !== 3);
    const result = matchTapsToBeats(BEATS, taps, WINDOW);

    expect(result.matches).toHaveLength(7);
    expect(result.missedBeatIndices).toEqual([3]);
    expect(result.extraTapIndices).toEqual([]);
  });

  it('reports a tap that wins no beat as extra', () => {
    // A stray tap between beats 2 and 3, further than the window from both.
    const stray = BEATS[2]! + WINDOW + 1;
    const taps = [...BEATS.slice(0, 3), stray, ...BEATS.slice(3)];
    const result = matchTapsToBeats(BEATS, taps, WINDOW);

    expect(result.matches).toHaveLength(8);
    expect(result.missedBeatIndices).toEqual([]);
    expect(result.extraTapIndices).toEqual([3]);
  });

  it('gives a beat the nearer of two competing taps; the other becomes extra', () => {
    const taps = [BEATS[0]! + 60, BEATS[0]! - 20];
    const result = matchTapsToBeats(BEATS.slice(0, 1), taps, WINDOW);

    expect(result.matches).toEqual([{ beatIndex: 0, tapIndex: 1, asynchronyMs: -20 }]);
    expect(result.extraTapIndices).toEqual([0]);
  });

  describe('the window boundary', () => {
    it('is inclusive', () => {
      const result = matchTapsToBeats([1000], [1000 + WINDOW], WINDOW);
      expect(result.matches).toHaveLength(1);
    });

    it('excludes a tap one millisecond beyond it', () => {
      const result = matchTapsToBeats([1000], [1000 + WINDOW + 1], WINDOW);
      expect(result.matches).toHaveLength(0);
      expect(result.missedBeatIndices).toEqual([0]);
      expect(result.extraTapIndices).toEqual([0]);
    });

    it('assigns a tap exactly halfway between two beats to the earlier one', () => {
      const halfway = BEATS[0]! + IOI / 2;
      const result = matchTapsToBeats(BEATS.slice(0, 2), [halfway], WINDOW);

      expect(result.matches).toEqual([{ beatIndex: 0, tapIndex: 0, asynchronyMs: IOI / 2 }]);
      expect(result.missedBeatIndices).toEqual([1]);
    });
  });

  it('prefers the globally closest pairing when taps could claim either neighbour', () => {
    // With a window wider than half the tempo, tap A is in range of beats 0
    // and 1, tap B only of beat 1. Greedy-by-beat would give A to beat 0 and B
    // to beat 1 — but A is nearer beat 1, and B is far from it. Closest-first
    // gives A to beat 1 and leaves beat 0 missed, B extra — the honest reading.
    const wide = IOI * 0.6;
    const tapA = BEATS[1]! - 100;
    const tapB = BEATS[1]! + 400;
    const result = matchTapsToBeats(BEATS.slice(0, 2), [tapA, tapB], wide);

    expect(result.matches).toEqual([{ beatIndex: 1, tapIndex: 0, asynchronyMs: -100 }]);
    expect(result.missedBeatIndices).toEqual([0]);
    expect(result.extraTapIndices).toEqual([1]);
  });

  it('does not depend on the order of the inputs', () => {
    const taps = BEATS.map((b, k) => b + (k % 2 === 0 ? -30 : 30));
    const shuffledTaps = [taps[5]!, taps[0]!, taps[7]!, taps[2]!, taps[4]!, taps[1]!, taps[6]!, taps[3]!];
    const ordered = matchTapsToBeats(BEATS, taps, WINDOW);
    const shuffled = matchTapsToBeats(BEATS, shuffledTaps, WINDOW);

    // Same asynchrony per beat; only the tap indices differ.
    expect(shuffled.matches.map((m) => [m.beatIndex, m.asynchronyMs])).toEqual(
      ordered.matches.map((m) => [m.beatIndex, m.asynchronyMs]),
    );
  });

  it('handles no taps and no beats without complaint', () => {
    expect(matchTapsToBeats(BEATS, [], WINDOW)).toEqual({
      matches: [],
      missedBeatIndices: [0, 1, 2, 3, 4, 5, 6, 7],
      extraTapIndices: [],
    });
    expect(matchTapsToBeats([], [1, 2, 3], WINDOW)).toEqual({
      matches: [],
      missedBeatIndices: [],
      extraTapIndices: [0, 1, 2],
    });
  });

  it('rejects a negative or non-finite window', () => {
    expect(() => matchTapsToBeats(BEATS, BEATS, -1)).toThrow(RangeError);
    expect(() => matchTapsToBeats(BEATS, BEATS, Number.NaN)).toThrow(RangeError);
    expect(() => matchTapsToBeats(BEATS, BEATS, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
