import { describe, expect, it } from 'vitest';

import {
  blockSeed,
  fnv1a64,
  sessionSeed,
  splitmix64,
  studySeedFrom,
  trialSeed,
} from '../../../src/core/rng/seeds';

/** Number of 1 bits — used to measure how far a one-bit input change propagates. */
function popcount64(value: bigint): number {
  let bits = 0;
  let remaining = value;
  while (remaining > 0n) {
    if (remaining & 1n) bits++;
    remaining >>= 1n;
  }
  return bits;
}

const STUDY = studySeedFrom('KOPITIAM-2026');

describe('splitmix64', () => {
  // Locked so the derivation cannot change underneath a running study. Unlike
  // the PCG32 vector, these are our own recorded outputs rather than published
  // reference values — they still serve the purpose, which is to fail loudly if
  // the mixing function is ever edited.
  it('produces stable, locked output', () => {
    expect(splitmix64(0n)).toBe(16294208416658607535n);
    expect(splitmix64(1n)).toBe(10451216379200822465n);
  });

  it('stays inside 64 bits', () => {
    for (let i = 0n; i < 200n; i++) {
      const mixed = splitmix64(i * 7919n);
      expect(mixed).toBeGreaterThanOrEqual(0n);
      expect(mixed).toBeLessThan(1n << 64n);
    }
  });

  /**
   * The property the whole derivation scheme rests on.
   *
   * Session 8 and session 9 of the same participant differ by one in the input.
   * If that produced *similar* seeds, consecutive sessions would draw similar
   * patterns and the anti-memorisation design would quietly fail. A good
   * finaliser flips about half the output bits for a one-bit input change.
   */
  it('avalanches: a one-bit input change flips about half the output bits', () => {
    let totalFlipped = 0;
    const samples = 1000;

    for (let i = 0n; i < BigInt(samples); i++) {
      const a = splitmix64(i);
      const b = splitmix64(i ^ 1n);
      totalFlipped += popcount64(a ^ b);
    }

    const meanFlipped = totalFlipped / samples;
    expect(meanFlipped).toBeGreaterThan(28);
    expect(meanFlipped).toBeLessThan(36);
  });
});

describe('fnv1a64', () => {
  it('produces stable, locked output', () => {
    expect(fnv1a64('P017')).toBe(6576152614553647723n);
  });

  it('is deterministic', () => {
    expect(fnv1a64('P017')).toBe(fnv1a64('P017'));
  });

  it('separates similar identifiers', () => {
    const ids = ['P001', 'P002', 'P010', 'P100', 'p001', ''];
    const hashes = new Set(ids.map(fnv1a64));
    expect(hashes.size).toBe(ids.length);
  });
});

describe('seed derivation', () => {
  it('produces stable, locked values along the whole chain', () => {
    const session = sessionSeed(STUDY, 'P017', 9);
    const block = blockSeed(session, 'R4', 5);
    const trial = trialSeed(block, 3);

    expect(STUDY).toBe(6822659482976350240n);
    expect(session).toBe(9366643074006604638n);
    expect(block).toBe(9046470439852118782n);
    expect(trial).toBe(3117792869825516944n);
  });

  /**
   * The practical promise of the whole scheme: you can regenerate exactly what
   * P017 saw in session 9, block R4, trial 3 without replaying anything that
   * came before it.
   */
  it('lets one trial be regenerated in isolation', () => {
    const viaChain = trialSeed(blockSeed(sessionSeed(STUDY, 'P017', 9), 'R4', 5), 3);
    const rebuiltLater = trialSeed(blockSeed(sessionSeed(STUDY, 'P017', 9), 'R4', 5), 3);

    expect(rebuiltLater).toBe(viaChain);
  });

  it('separates consecutive sessions of the same participant', () => {
    const eight = sessionSeed(STUDY, 'P017', 8);
    const nine = sessionSeed(STUDY, 'P017', 9);

    expect(eight).not.toBe(nine);
    // Not merely different — unrelated. Similar seeds would mean similar
    // pattern sequences week to week.
    expect(popcount64(eight ^ nine)).toBeGreaterThan(16);
  });

  it('separates participants, blocks, block order and trials', () => {
    const base = sessionSeed(STUDY, 'P017', 9);

    expect(sessionSeed(STUDY, 'P018', 9)).not.toBe(base);
    expect(blockSeed(base, 'R4', 5)).not.toBe(blockSeed(base, 'R2', 5));
    // R1 runs twice in a session, once per hand; the two runs must not repeat
    // the same patterns.
    expect(blockSeed(base, 'R1', 3)).not.toBe(blockSeed(base, 'R1', 4));

    const block = blockSeed(base, 'R4', 5);
    expect(trialSeed(block, 3)).not.toBe(trialSeed(block, 4));
  });

  it('separates studies', () => {
    const other = studySeedFrom('KOPITIAM-2027');
    expect(sessionSeed(other, 'P017', 9)).not.toBe(sessionSeed(STUDY, 'P017', 9));
  });

  /**
   * No two trials anywhere in the planned study share a stream.
   *
   * Sized to the real design: 60 participants, 15 sessions, 7 blocks, 40 trials
   * per block. A collision would mean two trials drawing identical patterns,
   * which is precisely the memorisation the design is built to prevent.
   */
  it('produces no collisions across the whole planned study', () => {
    const seen = new Set<bigint>();
    let generated = 0;

    for (let participant = 1; participant <= 60; participant++) {
      const id = `P${String(participant).padStart(3, '0')}`;
      for (let session = 1; session <= 15; session++) {
        const sSeed = sessionSeed(STUDY, id, session);
        for (const [order, block] of ['C1', 'C2', 'R1', 'R2', 'R3', 'R4', 'V1'].entries()) {
          const bSeed = blockSeed(sSeed, block, order);
          for (let trial = 0; trial < 40; trial++) {
            seen.add(trialSeed(bSeed, trial));
            generated++;
          }
        }
      }
    }

    expect(generated).toBe(60 * 15 * 7 * 40);
    expect(seen.size).toBe(generated);
  });
});
