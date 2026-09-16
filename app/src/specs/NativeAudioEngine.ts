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

export interface Spec extends TurboModule {
  /**
   * Renders one second of silence with a click at 200 ms, opens a low-latency
   * output track, plays it, polls timestamps while it plays, and reports.
   *
   * `clickHz` and `clickMs` come from the caller so the stimulus definition
   * stays in the protocol on the JS side, not duplicated in Kotlin.
   */
  playClick(clickHz: number, clickMs: number): Promise<AudioReadout>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AudioEngine');
