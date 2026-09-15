/**
 * The pure measurement core of the Kopitiam Rhythm instrument.
 *
 * Everything reachable from this module is headless, deterministic and free of
 * platform behaviour. That is what makes the timing analysis testable against
 * data with known ground truth, and what lets a synthetic 15-session
 * participant run in well under a second.
 *
 * The app package supplies adapters for the ports declared here — a real clock,
 * a real tap source, a real beat scheduler — plus a fake set that lets the whole
 * game run with no tablet attached.
 *
 * See `test/architecture/purity.test.ts` for what may never enter this package,
 * and why. The short version: no React, no Node, no DOM, no database.
 *
 * Exports are listed explicitly as each milestone lands, rather than via
 * wildcard re-exports, so the public surface of the core stays readable at a
 * glance and an accidental export of an internal type is visible in review.
 */

// M1 — deterministic randomness.
export { Pcg32 } from './core/rng/pcg32';
export {
  blockSeed,
  fnv1a64,
  sessionSeed,
  splitmix64,
  studySeedFrom,
  trialSeed,
} from './core/rng/seeds';

// M1 — the study's constants, versioned and frozen.
export { PROTOCOL, PROTOCOL_VERSION, protocolToJson } from './domain/protocol/protocol';
export type { ProtocolConstants } from './domain/protocol/protocol';

// M3 — block C1, the speed tap, plus the descriptive statistics it reports.
export { SpeedTapRun, defaultSpeedTapConfig } from './domain/blocks/speed-tap';
export type {
  Hand,
  RecordedTap,
  SpeedTapConfig,
  SpeedTapPhase,
  SpeedTapResult,
  TapRejection,
} from './domain/blocks/speed-tap';
export {
  coefficientOfVariation,
  interTapIntervals,
  mean,
  median,
  standardDeviation,
} from './analysis/tap-stats';

// R1, piece 1 — the beat grid every paced block is scored against.
export { beatTimeAt, buildBeatSchedule } from './domain/beats/beat-schedule';
export type { Beat, BeatScheduleConfig } from './domain/beats/beat-schedule';

// R1, piece 2 — matching taps to beats (shared by the game and the analysis),
// and the trial that collects taps against a schedule.
export { matchTapsToBeats } from './analysis/matching';
export type { BeatTapMatch, MatchResult } from './analysis/matching';
export { PacedTapRun, defaultPacedTapConfig } from './domain/blocks/paced-tap';
export type {
  PacedTap,
  PacedTapConfig,
  PacedTapPhase,
  PacedTapRejection,
  PacedTapResult,
} from './domain/blocks/paced-tap';
