import { describe, expect, it } from 'vitest';

import { fitClockMap, nanoTimeOfFrame, type ClockAnchor } from '../../src/analysis/clock-map';

/** A 48 kHz clock: 20833.33 ns per frame, starting at a realistic nanoTime. */
const NS_PER_FRAME = 1e9 / 48_000;
const T0 = 123_456_789_000_000; // ~1.4 days of uptime, in ns

function exactAnchors(frames: readonly number[]): ClockAnchor[] {
  return frames.map((f) => ({ framePosition: f, nanoTime: T0 + f * NS_PER_FRAME }));
}

describe('fitClockMap', () => {
  it('recovers an exact 48 kHz clock from a few anchors', () => {
    const map = fitClockMap(exactAnchors([960, 1920, 4800, 9600, 24_000]))!;

    expect(map.impliedSampleRate).toBeCloseTo(48_000, 6);
    expect(map.nsPerFrame).toBeCloseTo(NS_PER_FRAME, 6);
    expect(map.nanoTimeAtFrameZero).toBeCloseTo(T0, 0);
    expect(map.residualSdMs).toBeCloseTo(0, 6);
    expect(map.anchorCount).toBe(5);
  });

  it('exposes a device that opened at 44.1 kHz when 48 kHz was requested', () => {
    // The game would play 8.8% slow and sound fine. The implied rate says so.
    const nsPerFrame441 = 1e9 / 44_100;
    const anchors = [1000, 5000, 20_000].map((f) => ({
      framePosition: f,
      nanoTime: T0 + f * nsPerFrame441,
    }));

    expect(fitClockMap(anchors)!.impliedSampleRate).toBeCloseTo(44_100, 3);
  });

  it('reports the spread of noisy anchors as a residual SD in milliseconds', () => {
    // Anchors one second apart, as a trial would collect them, with ±0.5 ms of
    // alternating jitter around the true line.
    const anchors = exactAnchors([1, 2, 3, 4, 5, 6].map((s) => s * 48_000)).map((a, i) => ({
      ...a,
      nanoTime: a.nanoTime + (i % 2 === 0 ? 500_000 : -500_000),
    }));
    const map = fitClockMap(anchors)!;

    expect(map.residualSdMs).toBeGreaterThan(0.4);
    expect(map.residualSdMs).toBeLessThan(0.7);
    // The slope survives symmetric noise: within 10 Hz over a 5 s span.
    expect(Math.abs(map.impliedSampleRate - 48_000)).toBeLessThan(10);
  });

  it('the rate estimate tightens as the anchor span grows', () => {
    // Same ±0.5 ms noise; 100 ms of anchors versus 5 s of anchors. This is
    // why the trial collects anchors across its whole length, not just at
    // the start.
    const jitter = (i: number): number => (i % 2 === 0 ? 500_000 : -500_000);
    const short = exactAnchors([1000, 2000, 3000, 4000, 5000, 6000]).map((a, i) => ({
      ...a,
      nanoTime: a.nanoTime + jitter(i),
    }));
    const long = exactAnchors([1, 2, 3, 4, 5, 6].map((s) => s * 48_000)).map((a, i) => ({
      ...a,
      nanoTime: a.nanoTime + jitter(i),
    }));

    const shortError = Math.abs(fitClockMap(short)!.impliedSampleRate - 48_000);
    const longError = Math.abs(fitClockMap(long)!.impliedSampleRate - 48_000);
    expect(longError).toBeLessThan(shortError / 10);
  });

  it('fits two anchors exactly and reports no residual', () => {
    const map = fitClockMap(exactAnchors([1000, 2000]))!;
    expect(map.impliedSampleRate).toBeCloseTo(48_000, 3);
    expect(map.residualSdMs).toBeNull();
  });

  it('returns null with fewer than two anchors', () => {
    expect(fitClockMap([])).toBeNull();
    expect(fitClockMap(exactAnchors([1000]))).toBeNull();
  });

  it('returns null when every anchor is at the same frame', () => {
    expect(
      fitClockMap([
        { framePosition: 500, nanoTime: T0 },
        { framePosition: 500, nanoTime: T0 + 1 },
      ]),
    ).toBeNull();
  });

  it('is precise despite nanoTime being ~1e14', () => {
    // The centred fit must not lose the slope to floating-point cancellation.
    const map = fitClockMap(exactAnchors([100_000, 100_480, 100_960]))!;
    expect(map.impliedSampleRate).toBeCloseTo(48_000, 3);
  });
});

describe('nanoTimeOfFrame', () => {
  it('places a beat frame on the fitted clock', () => {
    const map = fitClockMap(exactAnchors([1000, 5000, 9000]))!;
    // Beat 3 at 700 ms: frame 3 × 0.7 × 48000 = 100 800.
    const frame = 3 * 0.7 * 48_000;
    expect(nanoTimeOfFrame(map, frame)).toBeCloseTo(T0 + frame * NS_PER_FRAME, 0);
  });
});
