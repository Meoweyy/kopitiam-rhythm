import { describe, expect, it } from 'vitest';

import {
  PROTOCOL,
  PROTOCOL_VERSION,
  protocolToJson,
} from '../../../src/domain/protocol/protocol';

describe('protocol constants', () => {
  /**
   * The snapshot is the change detector.
   *
   * Any edit to any value fails this test. That is the point: you can still
   * change a constant, but only deliberately, and the failure is the prompt to
   * bump PROTOCOL_VERSION and record a protocol deviation. What must never
   * happen is a value drifting mid-study without anyone noticing, leaving the
   * data unable to say which rules produced it.
   *
   * The snapshot file is committed, so the diff is visible in review.
   */
  it('matches the locked snapshot', () => {
    expect(protocolToJson()).toMatchSnapshot();
  });

  it('stamps its own version', () => {
    expect(PROTOCOL.version).toBe(PROTOCOL_VERSION);
    expect(PROTOCOL_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  describe('immutability', () => {
    it('cannot be mutated at the top level', () => {
      expect(() => {
        (PROTOCOL as unknown as { version: string }).version = 'tampered';
      }).toThrow(TypeError);
    });

    // Object.freeze is shallow by default, so this is the case that would
    // otherwise slip through and let a nested value be changed at runtime.
    it('cannot be mutated at depth', () => {
      expect(() => {
        (PROTOCOL.tempo as unknown as { minMs: number }).minMs = 1;
      }).toThrow(TypeError);

      expect(() => {
        (PROTOCOL.cueLadder[0] as unknown as { cuedBeats: number }).cuedBeats = 99;
      }).toThrow(TypeError);
    });
  });

  /**
   * Consistency checks.
   *
   * These constants are not independent — several pairs have to agree, and the
   * failure mode is silent. Someone shortening a window or nudging a threshold
   * would not see anything break until the analysis produced nulls, or worse,
   * plausible-looking numbers computed from too little data.
   */
  describe('internal consistency', () => {
    it('has a sane tempo range', () => {
      expect(PROTOCOL.tempo.minMs).toBeLessThan(PROTOCOL.tempo.maxMs);
      expect(PROTOCOL.tempo.minMs).toBeGreaterThan(0);
    });

    it('scores at or above the shortest pattern it can generate', () => {
      expect(PROTOCOL.patterns.scoredLength).toBeGreaterThanOrEqual(
        PROTOCOL.patterns.minLength,
      );
      expect(PROTOCOL.patterns.startLength).toBeGreaterThanOrEqual(
        PROTOCOL.patterns.minLength,
      );
    });

    it('brackets a normal interval with its outlier bounds', () => {
      expect(PROTOCOL.cleaning.itiOutlierLowFactor).toBeLessThan(1);
      expect(PROTOCOL.cleaning.itiOutlierHighFactor).toBeGreaterThan(1);
    });

    it('brackets a doubled interval with its skipped-beat band', () => {
      expect(PROTOCOL.cleaning.skippedBeatLowFactor).toBeLessThan(2);
      expect(PROTOCOL.cleaning.skippedBeatHighFactor).toBeGreaterThan(2);
      // The skipped-beat band must sit clear of the ordinary outlier ceiling,
      // or an interval would be classified both ways.
      expect(PROTOCOL.cleaning.skippedBeatLowFactor).toBeGreaterThan(
        PROTOCOL.cleaning.itiOutlierHighFactor,
      );
    });

    it('flashes for well under a beat at the fastest tempo, so flashes never merge', () => {
      expect(PROTOCOL.cue.visualFlashMs).toBeLessThan(PROTOCOL.tempo.minMs / 2);
    });

    it('gives the audio engine time to warm up inside the lead-in at the fastest tempo', () => {
      // The engine's first usable timestamp lands ~120 ms after play(); the
      // beats are placed from it, so it must arrive well before beat zero.
      expect(PROTOCOL.session.leadInBeats * PROTOCOL.tempo.minMs).toBeGreaterThanOrEqual(500);
    });

    it('keeps the trial grace at least as long as the widest matching window', () => {
      // A late-but-matchable response to the last beat must fall inside the
      // grace period, or it would be rejected as after the window. The widest
      // window is at the slowest tempo.
      expect(PROTOCOL.session.trialGraceMs).toBeGreaterThanOrEqual(
        PROTOCOL.matching.windowFraction * PROTOCOL.tempo.maxMs,
      );
    });

    it('keeps the step-up threshold below the step-down threshold', () => {
      // If these crossed, the controller could qualify to step up and down on
      // the same trial, and the ladder would oscillate.
      expect(PROTOCOL.cueFading.cvFloorUp).toBeLessThan(PROTOCOL.cueFading.cvFloorDown);
      expect(PROTOCOL.cueFading.cvUpMultiplier).toBeLessThan(
        PROTOCOL.cueFading.cvDownMultiplier,
      );
    });
  });

  describe('cue-fading ladder', () => {
    it('is numbered contiguously from zero', () => {
      PROTOCOL.cueLadder.forEach((rung, index) => {
        expect(rung.level).toBe(index);
      });
    });

    /**
     * "Cue-fading level" is reported as a single number in the results, so the
     * rungs have to be genuinely ordered: every step up must withdraw more cue,
     * never less. Without this, level 5 could be easier than level 4 and the
     * number would mean nothing.
     */
    it('gets monotonically harder as the level rises', () => {
      for (let i = 1; i < PROTOCOL.cueLadder.length; i++) {
        const previous = PROTOCOL.cueLadder[i - 1]!;
        const current = PROTOCOL.cueLadder[i]!;

        expect(current.cuedBeats).toBeLessThanOrEqual(previous.cuedBeats);
        expect(current.continuationMs).toBeGreaterThanOrEqual(previous.continuationMs);
      }

      // And strictly harder overall, or the top rung would not differ from the bottom.
      const first = PROTOCOL.cueLadder[0]!;
      const last = PROTOCOL.cueLadder[PROTOCOL.cueLadder.length - 1]!;
      expect(last.cuedBeats).toBeLessThan(first.cuedBeats);
      expect(last.continuationMs).toBeGreaterThan(first.continuationMs);
    });

    it('keeps every rung inside the 10–20 s continuation band', () => {
      for (const rung of PROTOCOL.cueLadder) {
        expect(rung.continuationMs).toBeGreaterThanOrEqual(10_000);
        expect(rung.continuationMs).toBeLessThanOrEqual(20_000);
      }
    });
  });

  /**
   * The coupling most likely to be broken by accident.
   *
   * The Wing–Kristofferson clock/motor split needs a minimum number of
   * continuation intervals. How many a measurement session yields depends on
   * the continuation window AND the participant's tempo — and the worst case is
   * the slowest permitted tempo, where each interval eats the most time.
   *
   * Shortening the window, raising the tempo ceiling, or raising the minimum
   * sample size would each break this independently, and none of them would
   * look like they had anything to do with the others.
   */
  it('yields enough continuation intervals for Wing–Kristofferson at the slowest tempo', () => {
    const slowestTempoMs = PROTOCOL.tempo.maxMs;
    const usableIntervals =
      Math.floor(PROTOCOL.blackout.measurementContinuationMs / slowestTempoMs) -
      PROTOCOL.blackout.transitionIntervalsExcluded;

    expect(usableIntervals).toBeGreaterThanOrEqual(
      PROTOCOL.sufficiency.minIntervalsForWingKristofferson,
    );
  });
});
