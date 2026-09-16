/**
 * The audio clock map — relating "which frame is playing" to "what time it is".
 *
 * ## The problem it solves
 *
 * A click is placed in the audio buffer at frame `k × ioi × sampleRate`. The
 * participant's tap is stamped in `CLOCK_MONOTONIC` milliseconds. To compare
 * the two, the frame index has to be converted into that clock. The audio
 * system helps: `AudioTrack.getTimestamp()` reports pairs of (frame position,
 * nanoTime) saying "frame F was at the output at time T". A handful of those
 * pairs, fitted with a straight line, give `t = α·frame + β` for any frame.
 *
 * ## Why a fit rather than one pair
 *
 * A single pair is a single sample of a noisy quantity. The line averages the
 * noise, and its residuals say how noisy the anchors were — which is itself a
 * qualification number for the device: a residual SD of a few hundred
 * microseconds is a healthy audio clock; several milliseconds is not.
 *
 * The slope also yields the *actual* sample rate. A device that silently
 * opened at 44.1 kHz when asked for 48 kHz makes every interval 8.8% too long
 * and the game still plays fine, slightly slow. The implied rate makes that
 * impossible to miss.
 *
 * ## Frozen at trial start
 *
 * Once a trial begins, its map is fixed. Refitting mid-trial would let a beat
 * time change after a tap had been scored against it.
 */

export interface ClockAnchor {
  /** Frames since the track started. */
  readonly framePosition: number;
  /** `System.nanoTime()` when that frame was presented. */
  readonly nanoTime: number;
}

export interface ClockMap {
  /** Nanoseconds per frame: the slope. */
  readonly nsPerFrame: number;
  /** nanoTime at frame zero: the intercept. */
  readonly nanoTimeAtFrameZero: number;
  /** `1e9 / nsPerFrame`. Compare with the requested rate. */
  readonly impliedSampleRate: number;
  /** Spread of the anchors around the line, in milliseconds. Sample SD. */
  readonly residualSdMs: number | null;
  readonly anchorCount: number;
}

/**
 * Ordinary least squares of nanoTime on framePosition.
 *
 * Returns null with fewer than two anchors, or when every anchor sits at the
 * same frame — there is no line to fit. Two anchors fit exactly and report no
 * residual; three or more report the spread.
 */
export function fitClockMap(anchors: readonly ClockAnchor[]): ClockMap | null {
  const n = anchors.length;
  if (n < 2) return null;

  // Centre both axes before fitting. nanoTime values are ~1e14 and frame
  // positions ~1e5; the raw sums of squares would lose precision.
  let meanFrame = 0;
  let meanTime = 0;
  for (const a of anchors) {
    meanFrame += a.framePosition;
    meanTime += a.nanoTime;
  }
  meanFrame /= n;
  meanTime /= n;

  let sxx = 0;
  let sxy = 0;
  for (const a of anchors) {
    const dx = a.framePosition - meanFrame;
    sxx += dx * dx;
    sxy += dx * (a.nanoTime - meanTime);
  }
  if (sxx === 0) return null;

  const nsPerFrame = sxy / sxx;
  const nanoTimeAtFrameZero = meanTime - nsPerFrame * meanFrame;

  let residualSdMs: number | null = null;
  if (n >= 3) {
    let sumSquares = 0;
    for (const a of anchors) {
      const predicted = nanoTimeAtFrameZero + nsPerFrame * a.framePosition;
      sumSquares += (a.nanoTime - predicted) ** 2;
    }
    // n − 2: two parameters were estimated.
    residualSdMs = Math.sqrt(sumSquares / (n - 2)) / 1e6;
  }

  return {
    nsPerFrame,
    nanoTimeAtFrameZero,
    impliedSampleRate: 1e9 / nsPerFrame,
    residualSdMs,
    anchorCount: n,
  };
}

/** The time, in nanoTime, at which `framePosition` is presented, under `map`. */
export function nanoTimeOfFrame(map: ClockMap, framePosition: number): number {
  return map.nanoTimeAtFrameZero + map.nsPerFrame * framePosition;
}
