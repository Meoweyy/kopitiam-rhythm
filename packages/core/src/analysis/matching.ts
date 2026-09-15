/**
 * Matching — which beat was each tap aiming at?
 *
 * ## Why this is one function used in two places
 *
 * The game needs to know, live, whether a tap landed near a beat (to bloom a
 * ring) and the analysis needs to know, later, which tap belongs to which beat
 * (to compute asynchrony). If those were two implementations they would
 * eventually disagree, and the participant would be shown feedback for a tap
 * that the analysis then scores differently. So there is one matcher, here, and
 * both call it. It takes plain arrays of times so the analysis pipeline can
 * hand it latency-corrected times without this function knowing or caring.
 *
 * ## The rule
 *
 * A tap matches a beat when they are within `windowMs` of each other, and
 * each beat takes at most one tap, each tap at most one beat. When several
 * pairings are possible, the closest pair wins, then the next closest, and so
 * on — a beat with two nearby taps keeps the nearer one and the other becomes
 * an *extra* tap. A beat with no tap in range is *missed*.
 *
 * Ties are broken in favour of the earlier beat, so a tap exactly halfway
 * between two beats reads as a late response to the one that has already
 * happened rather than an anticipation of the one that has not. Responses lag
 * stimuli; that is the more plausible reading. Either choice would be
 * defensible — what matters is that it is fixed, stated, and the same in the
 * game and in the analysis.
 *
 * ## Sign convention, used everywhere downstream
 *
 * `asynchrony = tap − beat`. Negative is early, positive is late. This is the
 * convention of the sensorimotor synchronisation literature, in which the
 * well-known finding is a *negative* mean asynchrony: people tend to tap
 * slightly ahead of the beat.
 *
 * ## What it does not do
 *
 * No debounce, no window filtering, no outlier rejection: it assumes it is
 * handed the taps that survived those steps. The order of cleaning is the
 * pipeline's responsibility (M13), and it must be applied *before* matching
 * or an artefact tap could steal a beat from a genuine one.
 */

export interface BeatTapMatch {
  /** Position in the `beatTimesMs` array passed in. */
  readonly beatIndex: number;
  /** Position in the `tapTimesMs` array passed in. */
  readonly tapIndex: number;
  /** `tap − beat`, in milliseconds. Negative is early, positive is late. */
  readonly asynchronyMs: number;
}

export interface MatchResult {
  /** One per matched beat, in beat order. */
  readonly matches: readonly BeatTapMatch[];
  /** Beats that no tap came close enough to. In beat order. */
  readonly missedBeatIndices: readonly number[];
  /** Taps that were not the winning tap for any beat. In tap order. */
  readonly extraTapIndices: readonly number[];
}

/**
 * Pairs taps with beats. Both inputs may be in any order; indices in the
 * result refer to positions in the arrays as given.
 *
 * `windowMs` is inclusive: a tap exactly `windowMs` from a beat is in range.
 */
export function matchTapsToBeats(
  beatTimesMs: readonly number[],
  tapTimesMs: readonly number[],
  windowMs: number,
): MatchResult {
  if (!(windowMs >= 0) || !Number.isFinite(windowMs)) {
    throw new RangeError(`windowMs must be a non-negative finite number, got ${windowMs}`);
  }

  // Every pairing that is in range, closest first. Ties by earlier beat, then
  // earlier tap, so the outcome never depends on input order or sort stability.
  const candidates: BeatTapMatch[] = [];
  for (let b = 0; b < beatTimesMs.length; b += 1) {
    for (let t = 0; t < tapTimesMs.length; t += 1) {
      const asynchronyMs = tapTimesMs[t]! - beatTimesMs[b]!;
      if (Math.abs(asynchronyMs) <= windowMs) {
        candidates.push({ beatIndex: b, tapIndex: t, asynchronyMs });
      }
    }
  }
  candidates.sort(
    (x, y) =>
      Math.abs(x.asynchronyMs) - Math.abs(y.asynchronyMs) ||
      x.beatIndex - y.beatIndex ||
      x.tapIndex - y.tapIndex,
  );

  const beatTaken = new Array<boolean>(beatTimesMs.length).fill(false);
  const tapTaken = new Array<boolean>(tapTimesMs.length).fill(false);
  const matches: BeatTapMatch[] = [];
  for (const candidate of candidates) {
    if (beatTaken[candidate.beatIndex] || tapTaken[candidate.tapIndex]) continue;
    beatTaken[candidate.beatIndex] = true;
    tapTaken[candidate.tapIndex] = true;
    matches.push(candidate);
  }
  matches.sort((x, y) => x.beatIndex - y.beatIndex);

  const missedBeatIndices: number[] = [];
  for (let b = 0; b < beatTaken.length; b += 1) if (!beatTaken[b]) missedBeatIndices.push(b);
  const extraTapIndices: number[] = [];
  for (let t = 0; t < tapTaken.length; t += 1) if (!tapTaken[t]) extraTapIndices.push(t);

  return { matches, missedBeatIndices, extraTapIndices };
}
