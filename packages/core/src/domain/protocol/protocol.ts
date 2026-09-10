/**
 * Every numeric constant in the study, in one frozen object.
 *
 * ## Why this file exists
 *
 * Scattering these values through the code creates three problems that only
 * become visible once data collection has already started:
 *
 *  1. A value gets tweaked mid-trial and nobody notices. Half the participants
 *     ran one protocol and half ran another, and the data cannot say which.
 *  2. "What exactly was the step-up rule in session 7?" turns into git
 *     archaeology instead of a lookup.
 *  3. The thesis methods section is typed by hand and drifts from what the code
 *     actually did.
 *
 * So: one object, one version stamp, serialised into every data export as
 * `protocol_v1.json`. Each session row records `protocol_version`, which means
 * the data always carries its own rulebook.
 *
 * ## Changing a value
 *
 * `protocol.test.ts` snapshots this object. Any change fails that test, which
 * is the point — you can still change a number, but only deliberately, and the
 * failure forces you to bump {@link PROTOCOL_VERSION} at the same time. Never
 * change a value once collection has begun without recording it as a protocol
 * deviation.
 *
 * ## Provisional values
 *
 * Entries marked `PILOT` are reasoned starting points to be confirmed against
 * the December senior pilot, not settled science. They are here so that they
 * are visible and versioned rather than buried as literals.
 */

/**
 * Bumped whenever any value below changes. Recorded on every session row so an
 * analysis can tell which rules produced which data.
 *
 * History
 *  - v1.1.0  Added `speedTap.startTimeoutMs`. C1's window now begins on the
 *            first tap rather than on the "ready" press, after a run on a real
 *            tablet showed the hand-positioning gap consuming about a second of
 *            the ten and under-reporting the rate by 8.5%.
 *  - v1.0.0  Initial.
 */
export const PROTOCOL_VERSION = 'v1.1.0';

const protocol = {
  version: PROTOCOL_VERSION,

  /**
   * Tempo is per-participant: measured once by block C2, then locked for the
   * whole study. The clamp keeps everyone inside a range where beat-keeping is
   * a timing task rather than a motor-speed task.
   */
  tempo: {
    minMs: 500,
    maxMs: 900,
    /** Below this many usable intervals, C2 cannot set a tempo. */
    minIntervalsForEstimate: 8,
  },

  /** C1 — fast tapping. A motor covariate, so timing gains are not confused with finger speed. */
  speedTap: {
    durationMs: 10_000,
    handsPerBlock: 2,
    /**
     * How long to wait for the first tap after the participant says they are
     * ready. The window itself starts on that first tap, so the time spent
     * getting a hand into position never enters the measurement — otherwise a
     * participant slow to get poised would read as a slow tapper.
     *
     * PILOT: generous on purpose. Confirm against the December senior pilot.
     */
    startTimeoutMs: 20_000,
  },

  /** C2 — comfortable tapping. Sets the tempo every other block runs at. */
  naturalTempo: {
    durationMs: 10_000,
  },

  /**
   * Patterns are isochronous in time and random in space: every beat lands on
   * the grid, and the pattern is the sequence of sides. Isochrony is required
   * for the Wing–Kristofferson decomposition to be valid and for the
   * coefficient of variation of inter-tap intervals to mean anything.
   */
  patterns: {
    startLength: 3,
    minLength: 3,
    /**
     * All scored comparisons happen here, so participants, sessions and arms
     * are compared on identical material. At length 4 the constraints below
     * leave exactly four legal patterns, which probe trials sample without
     * replacement — difficulty at the scored length is therefore exactly
     * balanced, not merely balanced on average.
     */
    scoredLength: 4,
    /** PILOT: two full cycles of the four legal length-4 patterns. */
    probesPerBlock: 8,
    maxSameSideRun: 2,
    minHammingDistanceFromPrevious: 2,
    /** Patterns used in this participant's previous N sessions are not reused. */
    antiRepeatSessions: 2,
    /** Before relaxing constraints, in order, and recording which was relaxed. */
    maxGenerationAttempts: 200,
  },

  /**
   * Difficulty staircase on pattern length. Two-down / one-up converges on
   * roughly 71% correct, keeping practice near the edge of ability.
   */
  staircase: {
    successesToStepUp: 2,
    failuresToStepDown: 1,
    floorLength: 3,
    /** A trial with more than this many unmatched taps is a failure. */
    maxExtraTapsForSuccess: 1,
    /**
     * Below this fraction of beats receiving any tap, the trial is *invalid*
     * rather than failed — the participant stopped or was distracted. Invalid
     * trials are logged but do not move the staircase.
     */
    minMatchedFractionForValid: 0.5,
    /** Three consecutive invalid trials end the block early. */
    consecutiveInvalidToAbort: 3,
  },

  /** Assigning taps to beats. */
  matching: {
    /** A tap matches a beat within ±(windowFraction × tempo). */
    windowFraction: 0.5,
  },

  /**
   * Cleaning rules, applied in a fixed order before any statistic is computed.
   * Every rejected event is kept with a reason code — if a third of someone's
   * taps are being debounced, that must be discoverable from the data.
   */
  cleaning: {
    /** Per pad, not global, so genuine fast left–right alternation is never eaten. */
    debounceMs: 100,
    /** C1 deliberately provokes rates above 6 Hz, so its window is shorter. */
    speedTapDebounceMs: 70,
    /** A touch held longer than this is a rest, not a tap. */
    longPressRestMs: 800,
    /**
     * Interval outlier bounds, as multiples of the median. These are exactly
     * the "one tap skipped" and "one tap doubled" boundaries.
     */
    itiOutlierLowFactor: 0.5,
    itiOutlierHighFactor: 1.5,
    /**
     * An interval in this band is a skipped tap. It is EXCLUDED, never halved:
     * halving fabricates two observations from one and deflates variance, which
     * has demonstrably ruined published tapping datasets.
     */
    skippedBeatLowFactor: 1.75,
    skippedBeatHighFactor: 2.25,
    madOutlierSigma: 3,
    /** Above this proportion excluded, the trial is flagged. */
    maxExcludedProportion: 0.2,
  },

  /**
   * Minimum sample sizes. Below these, a statistic is reported as null with a
   * reason — never as a number computed from too little data.
   */
  sufficiency: {
    minIntervalsForCv: 10,
    /** The Wing–Kristofferson estimator's own variance is large below ~30. */
    minIntervalsForWingKristofferson: 25,
    minMatchedForAsynchrony: 8,
  },

  /** R3 — mirror mode. The reversed hand rule that yields crossing cost. */
  mirror: {
    /** Runs slower than R2 to keep the reversed rule achievable. */
    tempoInflation: 1.12,
    practiceTrials: 1,
    comprehensionItems: 2,
    comprehensionAttempts: 3,
  },

  /**
   * R4 — the power cut. Cued for the first beats, then audio and visuals stop
   * and the participant continues alone. The primary outcome.
   */
  blackout: {
    /**
     * The first intervals after the cue stops are re-anchoring, not steady
     * continuation, and are excluded. Pre-registered.
     */
    transitionIntervalsExcluded: 2,
    /**
     * Measurement sessions run a fixed protocol, identical in both arms, so the
     * arms are assessed on the same task. Training parameters are arm-specific
     * and never feed the primary analysis.
     */
    measurementCuedBeats: 8,
    /**
     * PILOT: 25 s at a 700 ms tempo gives ~35 intervals, enough for the
     * Wing–Kristofferson split. 15 s would give ~21, which is marginal.
     * Open item for the supervisor.
     */
    measurementContinuationMs: 25_000,
    /**
     * Clicks played after the continuation window closes. Without them the
     * recording-to-beat alignment would have to *extrapolate* across the very
     * window being measured, turning clock drift into a phantom tempo trend.
     */
    trailingClicks: 3,
  },

  /**
   * The cue-fading ladder (Arm A). A published lookup table rather than a
   * continuous control law: a table is auditable, and "level 0–8" is a single
   * reportable number. Cued beats never increase and continuation never
   * decreases as level rises, so the ordering is unambiguous.
   */
  cueLadder: [
    { level: 0, cuedBeats: 16, continuationMs: 10_000 },
    { level: 1, cuedBeats: 12, continuationMs: 10_000 },
    { level: 2, cuedBeats: 10, continuationMs: 12_000 },
    { level: 3, cuedBeats: 8, continuationMs: 12_000 },
    { level: 4, cuedBeats: 6, continuationMs: 14_000 },
    { level: 5, cuedBeats: 6, continuationMs: 16_000 },
    { level: 6, cuedBeats: 4, continuationMs: 16_000 },
    { level: 7, cuedBeats: 4, continuationMs: 18_000 },
    { level: 8, cuedBeats: 3, continuationMs: 20_000 },
  ],

  /**
   * How the ladder moves. Thresholds are personalised from the participant's
   * own baseline and then frozen, so the rule stays deterministic and auditable
   * while still placing everyone at their own edge of ability.
   */
  cueFading: {
    /** Median of the last N valid adaptive trials drives the decision. */
    rollingWindow: 3,
    minValidTrialsForStepUp: 3,
    /** Floors, in case a participant's baseline is unusually tight. */
    cvFloorUp: 0.05,
    cvFloorDown: 0.09,
    /** Thresholds are these multiples of the participant's baseline sync CV. */
    cvUpMultiplier: 1.25,
    cvDownMultiplier: 1.75,
    /** A trial that drifted more than this cannot trigger a step up. */
    driftRatioTolerance: 0.25,
    /** Below this fraction of expected continuation taps, the trial is invalid. */
    minValidContinuationTapFraction: 0.6,

    // Guard rails. Each gets its own rule id in the adaptive_event audit log.
    /** A lucky run must not strand a participant two sessions ahead of ability. */
    maxStepUpsPerSession: 2,
    /** After a step down, require consecutive good trials before stepping up again. */
    hysteresisSuccessesAfterStepDown: 2,
    /** A bad day cannot destroy accumulated progress. */
    maxLevelDropWithinSession: 2,
    /** After this many step downs, freeze for the session so the participant finishes able. */
    freezeAfterStepDownsInSession: 2,
    /** Sessions resume one rung below where they ended, as a warm-up. */
    warmUpLevelDrop: 1,
  },

  /** Session shape. Short, self-paced, and never showing a score. */
  session: {
    maxOnTaskMs: 25 * 60 * 1000,
    /** PILOT: rest offered roughly this often within long blocks. */
    restIntervalMs: 4 * 60 * 1000,
    /** Silence before the first beat of a trial, so the tablet is settled. */
    leadInMs: 1_500,
    /** Grace period after the last scheduled beat before a trial closes. */
    trialGraceMs: 1_000,
  },
} as const;

/** The shape of {@link PROTOCOL}, for consumers that need the type. */
export type ProtocolConstants = typeof protocol;

/**
 * Recursively freezes, so a stray assignment fails loudly in development
 * instead of silently changing the protocol for the rest of a session.
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as unknown as Record<string, unknown>)[key]);
  }
  return value;
}

export const PROTOCOL: ProtocolConstants = deepFreeze(protocol);

/**
 * Serialises the protocol for export. Written to `protocol_v1.json` alongside
 * every set of CSVs, so a dataset is always self-describing.
 */
export function protocolToJson(): string {
  return JSON.stringify(PROTOCOL, null, 2);
}
