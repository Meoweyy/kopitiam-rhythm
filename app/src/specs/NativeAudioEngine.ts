/**
 * Contract for the native audio engine (Kotlin, `AudioEngineModule.kt`).
 *
 * React Native's codegen reads this file and generates the Kotlin base class
 * the module must implement, so the two sides cannot drift: a method added
 * here without a Kotlin implementation is a compile error on the Android side.
 *
 * S1 exposes one call, enough to answer the tablet-qualification question:
 * open an output stream, play one click, and report what the audio system
 * actually granted. The trial-length click track (S2) and the clock map (S3)
 * extend this contract; they do not replace it.
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** One `AudioTrack.getTimestamp()` read: which frame was at the output, and when. */
export interface AudioTimestampSample {
  /** Frames since the track started playing. */
  readonly framePosition: number;
  /** `System.nanoTime()` at which that frame was presented — CLOCK_MONOTONIC, the touch clock's base. */
  readonly nanoTime: number;
}

export interface AudioReadout {
  // What the device advertises, before opening anything.
  readonly nativeSampleRate: number;
  readonly nativeFramesPerBuffer: number;
  readonly featureLowLatency: boolean;
  readonly featurePro: boolean;

  // What the opened track actually got.
  readonly sampleRate: number;
  readonly bufferSizeInFrames: number;
  readonly performanceMode: string;
  readonly framesWritten: number;
  readonly routedDevice: string;
  readonly underrunCount: number;

  // Timestamp availability: how many of the polls succeeded, and the samples.
  readonly timestampPolls: number;
  readonly timestampReads: number;
  readonly timestamps: readonly AudioTimestampSample[];

  /** `SystemClock.uptimeMillis() − System.nanoTime()/1e6` at play(). Should be ~0: same clock. */
  readonly uptimeMinusNanoMs: number;
  /** `System.nanoTime()/1e6` when `play()` was called. */
  readonly playCalledAtMs: number;
}

/** What to render for one trial. All values come from the protocol on the JS side. */
export interface ClickTrackSpec {
  readonly ioiMs: number;
  /** Beats on the grid, cued and phantom together. */
  readonly beatCount: number;
  /**
   * How many beats, from the first, get a click. The rest are phantom:
   * on the grid, silent. Omit to click every beat.
   */
  readonly cuedBeats?: number;
  /**
   * Clicks played after the last beat on the grid — the power coming back
   * on. Without them a recording's alignment would have to extrapolate
   * across the very window being measured. Omit for none.
   */
  readonly trailingClicks?: number;
  /** Silence before the first click. */
  readonly leadInMs: number;
  /** Silence after the last click, so the track outlives the response window. */
  readonly tailMs: number;
  readonly clickHz: number;
  readonly clickMs: number;
}

/**
 * Returned as soon as the track is playing and a few timestamps have landed —
 * about 150 ms after `play()`, well inside the lead-in. Enough to fit a clock
 * map and place every beat on the tap clock before the first click sounds.
 */
export interface ClickTrackStart {
  readonly sampleRate: number;
  readonly totalFrames: number;
  /**
   * Frame index of each beat's onset, cued or phantom, in order. This is the
   * ground truth: beat k is at `clickFrames[k]`, placed by
   * `round((leadIn + k × ioi) × rate)` — one multiplication from the anchor,
   * never a running sum. A phantom beat has a frame and no click.
   */
  readonly clickFrames: readonly number[];
  /** Frame index of each trailing click, on the same grid after the last beat. */
  readonly trailingClickFrames: readonly number[];
  readonly performanceMode: string;
  readonly playCalledAtMs: number;
  /** The first valid timestamp reads. */
  readonly anchors: readonly AudioTimestampSample[];
}

/** Returned when playback has run to the end (or was stopped). */
export interface ClickTrackEnd {
  /** Every timestamp read across the whole track, including those in `ClickTrackStart`. */
  readonly anchors: readonly AudioTimestampSample[];
  readonly underrunCount: number;
  /** True if `stopClickTrack` cut it short. */
  readonly stopped: boolean;
}

export interface Spec extends TurboModule {
  /**
   * Renders one second of silence with a click at 200 ms, opens a low-latency
   * output track, plays it, polls timestamps while it plays, and reports.
   *
   * `clickHz` and `clickMs` come from the caller so the stimulus definition
   * stays in the protocol on the JS side, not duplicated in Kotlin.
   */
  playClick(clickHz: number, clickMs: number): Promise<AudioReadout>;

  /**
   * Renders a whole trial's clicks into one buffer and starts playing it.
   * One `play()` per trial: there is no per-click scheduling to jitter.
   * Rejects if a track is already playing.
   */
  startClickTrack(spec: ClickTrackSpec): Promise<ClickTrackStart>;

  /** Resolves when the current track finishes. Rejects if none was started. */
  finishClickTrack(): Promise<ClickTrackEnd>;

  /** Stops the current track early, if any. `finishClickTrack` then resolves with `stopped: true`. */
  stopClickTrack(): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AudioEngine');
