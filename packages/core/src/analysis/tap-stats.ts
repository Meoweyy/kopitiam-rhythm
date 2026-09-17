/**
 * Descriptive statistics over a series of tap times.
 *
 * ## Scope, deliberately narrow
 *
 * These are plain arithmetic helpers. They are NOT the analysis pipeline: there
 * is no latency correction, no artefact rejection, no outlier policy and no
 * sufficiency gate here. That pipeline arrives at M13 and applies its rules in
 * a fixed order *before* anything like this is computed.
 *
 * Keeping the two apart matters. The cleaning rules are the part a supervisor
 * will make you revise after draft 1; if they were tangled into the arithmetic,
 * revising them would mean rewriting the maths too.
 *
 * Every function returns `null` rather than `NaN` when there is not enough data.
 * `NaN` propagates silently through later arithmetic and surfaces as a blank
 * cell in a spreadsheet months later; `null` forces the caller to decide.
 */

/**
 * Gaps between consecutive taps.
 *
 * `n` taps yield `n - 1` intervals — the quantity that actually carries timing
 * information. A single tap tells you nothing about rhythm.
 */
export function interTapIntervals(tapTimesMs: readonly number[]): number[] {
  const intervals: number[] = [];
  for (let i = 1; i < tapTimesMs.length; i++) {
    intervals.push(tapTimesMs[i]! - tapTimesMs[i - 1]!);
  }
  return intervals;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Sample standard deviation, dividing by `n - 1`.
 *
 * The `n - 1` divisor (Bessel's correction) is the convention in the tapping
 * literature this study is anchored to. Using `n` would make these numbers
 * quietly non-comparable to published values — a difference of about 2% at
 * n = 25, which is small enough to go unnoticed and large enough to matter.
 */
export function standardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const average = mean(values)!;
  let sumSquares = 0;
  for (const value of values) sumSquares += (value - average) ** 2;
  return Math.sqrt(sumSquares / (values.length - 1));
}

/**
 * Slope of `ys` against `xs` by ordinary least squares, in y-units per x-unit.
 *
 * Returns `null` with fewer than two points or when every x is the same.
 * Used for drift: asynchrony against beat index, where a positive slope means
 * the taps are sliding later beat by beat.
 */
export function slope(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const meanX = mean(xs.slice(0, n))!;
  const meanY = mean(ys.slice(0, n))!;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    sxx += dx * dx;
    sxy += dx * (ys[i]! - meanY);
  }
  return sxx === 0 ? null : sxy / sxx;
}

/**
 * Coefficient of variation: SD divided by the mean.
 *
 * Scale-free, which is why it is the study's consistency measure rather than
 * raw SD. A person tapping at 500 ms and one at 900 ms cannot be compared on
 * SD — slower tapping is more variable in absolute terms almost by definition —
 * but they can be compared on CV.
 *
 * Returns `null` for a non-positive mean, where the ratio is meaningless.
 */
export function coefficientOfVariation(values: readonly number[]): number | null {
  const average = mean(values);
  const sd = standardDeviation(values);
  if (average === null || sd === null || average <= 0) return null;
  return sd / average;
}
