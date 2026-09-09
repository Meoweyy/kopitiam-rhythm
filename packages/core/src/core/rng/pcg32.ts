/**
 * PCG32 — a small, seedable random number generator.
 *
 * ## Why not `Math.random()`
 *
 * `Math.random()` cannot be seeded. That is fatal here: a participant's
 * stimulus sequence has to be *regenerable*, so that "what did P017 see in
 * session 9, block R4, trial 3?" has an answer months later — for a supervisor,
 * an examiner, or for reproducing a bug report from the field.
 *
 * ## Why not a library
 *
 * A dependency can change its algorithm in a patch release. If that happened
 * mid-trial, the same seed would produce different patterns before and after,
 * and the pilot data would no longer be comparable to the final data. So the
 * algorithm lives here, in about forty lines, locked by a golden-vector test.
 *
 * ## The algorithm
 *
 * PCG32 (O'Neill 2014), the `XSH RR 64/32` variant: a 64-bit linear
 * congruential state whose output is an xorshift followed by a random rotate.
 * Chosen over a plain LCG because an LCG's low bits are notoriously
 * non-random — and the low bit is exactly what "left or right?" would use.
 *
 * Every method consumes a predictable number of draws, which is what makes a
 * stream position reproducible when replaying a session.
 */

const MASK_64 = 0xffff_ffff_ffff_ffffn;
const MULTIPLIER = 6364136223846793005n;
const TWO_POW_32 = 0x1_0000_0000;

/** The reference implementation's default stream selector. */
const DEFAULT_STREAM = 1442695040888963407n;

export class Pcg32 {
  #state: bigint;
  #inc: bigint;

  /**
   * @param seed    Starting value. The same seed always yields the same
   *                sequence, which is the entire point of this class.
   * @param stream  Selects one of 2^63 independent sequences. Two generators
   *                with the same seed but different streams do not correlate,
   *                which is how per-trial substreams stay independent.
   */
  constructor(seed: bigint, stream: bigint = DEFAULT_STREAM) {
    // The increment must be odd for the LCG to have full period.
    this.#inc = ((stream << 1n) | 1n) & MASK_64;
    this.#state = 0n;
    this.#step();
    this.#state = (this.#state + (seed & MASK_64)) & MASK_64;
    this.#step();
  }

  /** Advances the state and returns the value it had *before* advancing. */
  #step(): bigint {
    const previous = this.#state;
    this.#state = (previous * MULTIPLIER + this.#inc) & MASK_64;
    return previous;
  }

  /** One draw. Uniform over 0 .. 2^32 - 1. */
  nextUint32(): number {
    const previous = this.#step();
    const xorshifted = Number((((previous >> 18n) ^ previous) >> 27n) & 0xffff_ffffn);
    const rotation = Number(previous >> 59n);

    // Rotate right by `rotation`. When rotation is 0, `(-0) & 31` is also 0, so
    // this degenerates correctly rather than shifting by 32 (which JavaScript
    // would silently treat as a shift by 0).
    return ((xorshifted >>> rotation) | (xorshifted << ((-rotation) & 31))) >>> 0;
  }

  /**
   * One draw, scaled to `[0, 1)` with 32-bit resolution.
   *
   * Deliberately one draw rather than the 53-bit two-draw construction: one
   * value per draw keeps the stream position easy to reason about when
   * replaying a session, and 2^32 steps is far finer than anything this study
   * asks of it.
   */
  nextFloat(): number {
    return this.nextUint32() / TWO_POW_32;
  }

  /**
   * A uniform integer in `[minInclusive, maxExclusive)`.
   *
   * ## Why this is not `next() % range`
   *
   * Modulo reduction is biased: unless the range divides 2^32 exactly, the
   * lower values come up slightly more often. For most software that bias is
   * irrelevant. Here it is not — the mirror-mode block (R3) measures the cost
   * of reversing a left/right rule, and that measurement assumes left and right
   * were equally likely to begin with. A generator that favoured one side would
   * be a genuine confound in the primary novel measure of this study.
   *
   * So the first `2^32 mod range` draws are rejected, leaving a span that
   * divides exactly. The expected number of retries is below one; the loop is
   * guaranteed to terminate with probability 1.
   */
  nextInt(minInclusive: number, maxExclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive)) {
      throw new RangeError(
        `nextInt bounds must be integers, got [${minInclusive}, ${maxExclusive})`,
      );
    }

    const range = maxExclusive - minInclusive;
    if (range <= 0) {
      throw new RangeError(
        `nextInt requires maxExclusive > minInclusive, got [${minInclusive}, ${maxExclusive})`,
      );
    }
    if (range > TWO_POW_32) {
      throw new RangeError(`nextInt range ${range} exceeds the generator's 32-bit output`);
    }

    const rejectBelow = TWO_POW_32 % range;
    let draw = this.nextUint32();
    while (draw < rejectBelow) {
      draw = this.nextUint32();
    }
    return minInclusive + (draw % range);
  }

  /** A fair coin. Consumes exactly one draw. */
  nextBool(): boolean {
    return this.nextInt(0, 2) === 1;
  }

  /** Uniformly picks one element. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('pick requires a non-empty list');
    }
    return items[this.nextInt(0, items.length)]!;
  }

  /**
   * A uniformly random permutation, as a new array. The input is not modified.
   *
   * Fisher–Yates, iterating downwards. The common "sort by random comparator"
   * shortcut does not produce a uniform permutation, which would quietly skew
   * which patterns a participant meets.
   */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      const atI = out[i]!;
      out[i] = out[j]!;
      out[j] = atI;
    }
    return out;
  }

  /**
   * An independent copy at the current position.
   *
   * Useful for looking ahead — for example, generating a candidate pattern and
   * rejecting it — without disturbing the caller's stream position.
   */
  clone(): Pcg32 {
    const copy = new Pcg32(0n);
    copy.#state = this.#state;
    copy.#inc = this.#inc;
    return copy;
  }
}
