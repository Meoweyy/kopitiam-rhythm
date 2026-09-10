import { describe, expect, it } from 'vitest';

import {
  coefficientOfVariation,
  interTapIntervals,
  mean,
  median,
  standardDeviation,
} from '../../src/analysis/tap-stats';

describe('interTapIntervals', () => {
  it('turns n taps into n-1 gaps', () => {
    expect(interTapIntervals([0, 100, 250, 400])).toEqual([100, 150, 150]);
  });

  // A single tap carries no timing information, and no taps carry none either.
  // Returning an empty list rather than throwing lets the caller's sufficiency
  // check be the single place that decides what "enough data" means.
  it('yields nothing for fewer than two taps', () => {
    expect(interTapIntervals([])).toEqual([]);
    expect(interTapIntervals([42])).toEqual([]);
  });

  it('preserves order and does not sort', () => {
    // Out-of-order input would indicate a bug upstream; this function must not
    // paper over it by silently sorting.
    expect(interTapIntervals([0, 300, 100])).toEqual([300, -200]);
  });
});

describe('mean', () => {
  it('averages', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });

  it('is null for an empty list rather than NaN', () => {
    // NaN would propagate silently into later arithmetic and surface as a blank
    // cell in a spreadsheet months later.
    expect(mean([])).toBeNull();
  });
});

describe('median', () => {
  it('takes the middle of an odd-length list', () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it('averages the two middles of an even-length list', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('does not modify the caller’s array', () => {
    const original = [3, 1, 2];
    median(original);
    expect(original).toEqual([3, 1, 2]);
  });

  it('is null for an empty list', () => {
    expect(median([])).toBeNull();
  });
});

describe('standardDeviation', () => {
  /**
   * The n-1 divisor is not a style preference.
   *
   * For [1,2,3,4,5] the sum of squared deviations is 10. Dividing by n-1 = 4
   * gives sqrt(2.5) = 1.5811; dividing by n = 5 would give sqrt(2) = 1.4142.
   * That is a 12% difference here, and about 2% at n = 25 — small enough to go
   * unnoticed, large enough to make published comparisons wrong.
   */
  it('uses the sample divisor, matching the tapping literature', () => {
    expect(standardDeviation([1, 2, 3, 4, 5])).toBeCloseTo(1.5811388, 6);
  });

  it('is zero for identical values', () => {
    expect(standardDeviation([700, 700, 700])).toBe(0);
  });

  it('needs at least two values', () => {
    expect(standardDeviation([5])).toBeNull();
    expect(standardDeviation([])).toBeNull();
  });
});

describe('coefficientOfVariation', () => {
  it('is SD over mean', () => {
    expect(coefficientOfVariation([1, 2, 3, 4, 5])).toBeCloseTo(1.5811388 / 3, 6);
  });

  /**
   * Why the study reports CV rather than raw SD.
   *
   * Someone tapping at 900 ms is more variable in absolute terms than someone
   * at 500 ms almost by definition, so raw SD would confound consistency with
   * tempo. CV is scale-free: the same proportional wobble gives the same number
   * at any tempo.
   */
  it('is scale-free, so tempos are comparable', () => {
    const slow = [900, 990, 810];
    const fast = slow.map((v) => v / 2);
    expect(coefficientOfVariation(fast)).toBeCloseTo(coefficientOfVariation(slow)!, 12);
  });

  it('is null when the mean is not positive', () => {
    expect(coefficientOfVariation([-1, 1])).toBeNull();
    expect(coefficientOfVariation([5])).toBeNull();
  });
});
