/**
 * A provisional clock adapter for M3.
 *
 * ## What this is, and what it is not
 *
 * React Native touch events carry `nativeEvent.timestamp`, which on Android is
 * `MotionEvent.getEventTime()` — stamped by the kernel input layer when the
 * digitiser sampled the touch. That is a genuinely good timestamp, and much
 * better than reading a clock inside the JavaScript handler, which would add
 * the event-loop delay to every tap.
 *
 * But it lives in Android's `SystemClock.uptimeMillis()` base, and JavaScript
 * has no way to read that clock directly. So to know "how long is left in the
 * window" in the same units as the taps, this module estimates the constant
 * offset between the two clocks from the first touch it sees, then adds it.
 *
 * ## Why this is temporary
 *
 * This is a single-sample offset estimate, not a fitted one, and it trusts
 * React Native's event pipeline to pass the platform timestamp through
 * unmodified. Both assumptions are reasonable and neither is verified.
 *
 * M8 replaces this with a native module that hooks `dispatchTouchEvent`
 * directly and reads the same clock on both sides, and with a validation step
 * that measures the disagreement between the two paths over 500 taps. Until
 * then, treat numbers produced here as good enough to develop against and not
 * good enough to report.
 */

/**
 * Reached through `globalThis` rather than the bare identifier because React
 * Native's TypeScript config excludes the DOM library — `performance` exists at
 * runtime under Hermes but is not declared.
 */
const runtimePerformance = (globalThis as { performance?: { now?: () => number } })
  .performance;

/** Monotonic milliseconds in the JavaScript runtime's own base. */
export function jsNow(): number {
  // `performance.now()` is monotonic and unaffected by wall-clock changes.
  // `Date.now()` is a fallback only: it can step backwards when the system
  // clock syncs, which would produce a negative interval in the middle of a
  // trial and be nearly impossible to diagnose after the fact.
  return typeof runtimePerformance?.now === 'function'
    ? runtimePerformance.now()
    : Date.now();
}

let offsetToNative: number | null = null;

/**
 * Learns the offset between the platform's touch clock and the JS clock.
 *
 * Called with the first touch timestamp seen. Later calls are ignored, so the
 * mapping stays fixed for the life of the app rather than drifting between
 * trials.
 */
export function syncNativeClock(nativeTimestampMs: number): void {
  if (offsetToNative === null && Number.isFinite(nativeTimestampMs) && nativeTimestampMs > 0) {
    offsetToNative = nativeTimestampMs - jsNow();
  }
}

/** True once a touch has been seen and the offset is known. */
export function isNativeClockSynced(): boolean {
  return offsetToNative !== null;
}

/**
 * "Now", expressed in the same base as touch timestamps, so that a tap time and
 * a window deadline can be compared without mixing clocks.
 */
export function nativeNow(): number {
  return jsNow() + (offsetToNative ?? 0);
}

export interface TouchTimestamps {
  /** From the platform, stamped when the digitiser sampled the touch. */
  readonly nativeMs: number;
  /** Read inside the JS handler. Includes the event-loop delay. */
  readonly jsMs: number;
  /**
   * How long the touch took to reach JavaScript, in milliseconds.
   *
   * This is exactly the latency that M8 exists to eliminate. Watching its
   * distribution on a real device is the cheapest possible evidence for whether
   * the native hook is worth building — and its *variability*, not its size,
   * is what would corrupt the study's primary outcome.
   */
  readonly deliveryDelayMs: number;
}

/**
 * Extracts both timestamps from a React Native touch event.
 *
 * Falls back to the JS clock when the platform timestamp is missing or
 * implausible, and reports a zero delay in that case so the diagnostic cannot
 * be mistaken for a real measurement.
 */
export function readTouchTimestamps(nativeTimestamp: number | undefined): TouchTimestamps {
  const jsMs = jsNow();

  if (typeof nativeTimestamp !== 'number' || !Number.isFinite(nativeTimestamp) || nativeTimestamp <= 0) {
    return { nativeMs: nativeNow(), jsMs, deliveryDelayMs: 0 };
  }

  syncNativeClock(nativeTimestamp);
  const jsAsNative = jsMs + (offsetToNative ?? 0);

  return {
    nativeMs: nativeTimestamp,
    jsMs,
    deliveryDelayMs: jsAsNative - nativeTimestamp,
  };
}

/** Resets the learned offset. Test-only; never called by the app. */
export function resetNativeClockForTesting(): void {
  offsetToNative = null;
}
