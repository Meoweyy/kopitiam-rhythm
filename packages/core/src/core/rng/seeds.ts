/**
 * Seed derivation — one study seed becomes an independent stream per trial.
 *
 * ## Why substreams instead of one long sequence
 *
 * With a single stream, reproducing block R4 trial 3 means replaying every draw
 * that came before it: all of C1, C2, R1, R2, R3, and the earlier R4 trials, in
 * exactly the order they originally happened. That is fragile — insert one
 * extra draw anywhere earlier and everything downstream shifts.
 *
 * Deriving a seed from `(study, participant, session, block, trial)` instead
 * means any trial can be regenerated in isolation, and a change to how one
 * block draws its patterns cannot disturb any other.
 *
 * ## Why hash the inputs rather than combine them arithmetically
 *
 * Nearby inputs must give unrelated streams: session 8 and session 9 of the
 * same participant should share nothing. `splitmix64` is a strong 64-bit
 * finaliser, so a one-bit change to the input scatters the output completely.
 *
 * ## A note on the recorded pattern
 *
 * Reproducibility never depends on this file alone — the literal pattern code
 * is also written to every trial row in the database. The seed is what lets you
 * *verify* that record and regenerate stimuli; the record is what protects you
 * if the generator ever changes. Belt and braces, deliberately.
 */

const MASK_64 = 0xffff_ffff_ffff_ffffn;

/**
 * SplitMix64's finalising mix (Steele, Lea & Flood 2014).
 *
 * Avalanches hard: flipping one input bit changes about half the output bits.
 * That is what makes consecutive session numbers produce unrelated streams.
 */
export function splitmix64(seed: bigint): bigint {
  let z = (seed + 0x9e37_79b9_7f4a_7c15n) & MASK_64;
  z = ((z ^ (z >> 30n)) * 0xbf58_476d_1ce4_e5b9n) & MASK_64;
  z = ((z ^ (z >> 27n)) * 0x94d0_49bb_1331_11ebn) & MASK_64;
  return (z ^ (z >> 31n)) & MASK_64;
}

const FNV_OFFSET_BASIS = 0xcbf2_9ce4_8422_2325n;
const FNV_PRIME = 0x0000_0100_0000_01b3n;

/**
 * FNV-1a over a string, as 64 bits.
 *
 * Hashes UTF-16 code units a byte at a time rather than using `TextEncoder`,
 * which does not exist in this package: the core compiles without DOM or Node
 * types precisely so that platform APIs cannot leak into the domain. Doing it
 * by hand also pins the byte order, so the same participant ID hashes
 * identically on every platform and every runtime version.
 *
 * Not a cryptographic hash, and not used as one — this only needs to spread
 * identifiers across the seed space.
 */
export function fnv1a64(text: string): bigint {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    hash = ((hash ^ BigInt(unit & 0xff)) * FNV_PRIME) & MASK_64;
    hash = ((hash ^ BigInt((unit >> 8) & 0xff)) * FNV_PRIME) & MASK_64;
  }
  return hash;
}

/**
 * Turns the human-entered study identifier into the root seed.
 *
 * Entered once by the researcher and stored in `app_config`. Everything a
 * participant ever sees descends from this one value, so it is recorded in the
 * export alongside the data.
 */
export function studySeedFrom(studyId: string): bigint {
  return splitmix64(fnv1a64(studyId));
}

/** The stream for one participant's one session. */
export function sessionSeed(
  studySeed: bigint,
  participantId: string,
  sessionNumber: number,
): bigint {
  return splitmix64(
    (studySeed ^ fnv1a64(participantId) ^ (BigInt(sessionNumber) * 0x9e37_79b9_7f4a_7c15n)) &
      MASK_64,
  );
}

/**
 * The stream for one block within a session.
 *
 * `blockOrder` is mixed in as well as the block name, so that a block appearing
 * twice in one session (as R1 does, once per hand) gets a distinct stream each
 * time rather than repeating its patterns.
 */
export function blockSeed(sessionSeed: bigint, block: string, blockOrder: number): bigint {
  return splitmix64(
    (sessionSeed ^ fnv1a64(block) ^ (BigInt(blockOrder) << 32n)) & MASK_64,
  );
}

/** The stream for a single trial. This is the one a pattern is generated from. */
export function trialSeed(blockSeed: bigint, trialIndex: number): bigint {
  return splitmix64(
    (blockSeed ^ (BigInt(trialIndex) * 0x2545_f491_4f6c_dd1dn)) & MASK_64,
  );
}
