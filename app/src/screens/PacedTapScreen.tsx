/**
 * Block R1 — tap along with the kettle, on screen.
 *
 * As with C1, this screen owns presentation and the platform clock only. The
 * beat grid, what counts as a tap, and which beat a tap belongs to all live in
 * `@kopitiam/core` and are tested without a device.
 *
 * ## Built in pieces
 *
 * The screen is being assembled one piece at a time, each visible on the
 * tablet before the next begins:
 *
 *   4. the turning table            (this file's first version)
 *   5. the kettle flash on the beat
 *   6. the pad, wired to the run
 *   7. a results view
 *   8. a menu to reach it
 *
 * ## Placeholders, and why they are loud
 *
 * The tempo below is a stand-in. The study's tempo is per participant, set
 * once by block C2 and locked; C2 is on hold, so until it exists every run
 * here uses one fixed value. It is a named constant with this comment rather
 * than a protocol entry, because it is not a rule of the study — it is the
 * absence of one, and must not be mistaken for a decision.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import {
  PROTOCOL,
  PacedTapRun,
  buildBeatSchedule,
  defaultPacedTapConfig,
  type Hand,
  type PacedTapResult,
} from '@kopitiam/core';

import { BigButton, Screen, textStyles } from '../ui/controls';
import { colours, layout } from '../ui/theme';
import { TurningTable } from '../ui/TurningTable';
import { nativeNow, readTouchTimestamps } from '../timing/touch-clock';

/** STAND-IN until C2 exists. Not a protocol value. See the note at the top. */
const PLACEHOLDER_TEMPO_MS = 700;
/** STAND-IN. How many beats a trial has is decided when R1's trial shape is designed. */
const PLACEHOLDER_BEAT_COUNT = 16;
/** R1 is single-handed. Which hand is a session-level decision that does not exist yet. */
const PLACEHOLDER_SIDE: Hand = 'right';

type Phase = 'intro' | 'running' | 'done';

export function PacedTapScreen({ onExit }: { onExit?: () => void }): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('intro');
  const [, setResult] = useState<PacedTapResult | null>(null);

  const runRef = useRef<PacedTapRun | null>(null);
  const [startAtMs, setStartAtMs] = useState(0);

  const beginRun = useCallback((event: GestureResponderEvent) => {
    // The button's own touch teaches the clock adapter the offset between the
    // platform touch clock and the JS clock, so the table's very first frame
    // is already on the right grid.
    const stamps = readTouchTimestamps(event.nativeEvent.timestamp);
    const firstBeatAtMs = stamps.nativeMs + PROTOCOL.session.leadInMs;

    const beats = buildBeatSchedule({
      startAtMs: firstBeatAtMs,
      ioiMs: PLACEHOLDER_TEMPO_MS,
      beatCount: PLACEHOLDER_BEAT_COUNT,
      side: PLACEHOLDER_SIDE,
    });
    runRef.current = new PacedTapRun(defaultPacedTapConfig(beats, PLACEHOLDER_TEMPO_MS));

    setStartAtMs(firstBeatAtMs);
    setResult(null);
    setPhase('running');
  }, []);

  // Watches for the end of the trial. 50 ms is a display cadence; the trial
  // boundary itself is decided by comparing timestamps inside the core.
  useEffect(() => {
    if (phase !== 'running') return undefined;

    const id = setInterval(() => {
      const run = runRef.current;
      if (run === null) return;

      const finished = run.result(nativeNow());
      if (finished !== null) {
        clearInterval(id);
        setResult(finished);
        setPhase('done');
      }
    }, 50);

    return () => clearInterval(id);
  }, [phase]);

  if (phase === 'intro') {
    return (
      <Screen>
        <Text style={textStyles.headline}>The kettle</Text>
        <Text style={textStyles.body}>
          Watch the table turn. Each time a cup reaches the kettle, tap.
        </Text>
        <BigButton label="Start" onTouch={beginRun} />
        {onExit ? <BigButton label="Menu" onPress={onExit} /> : null}
      </Screen>
    );
  }

  if (phase === 'running') {
    return (
      <View style={styles.play}>
        <View style={styles.tableArea}>
          <TurningTable
            startAtMs={startAtMs}
            ioiMs={PLACEHOLDER_TEMPO_MS}
            side={PLACEHOLDER_SIDE}
            clock={nativeNow}
            turning
            size={280}
          />
        </View>
        <View style={styles.padArea}>
          <Text style={textStyles.bodyMuted}>(pad arrives in piece 6)</Text>
        </View>
      </View>
    );
  }

  return (
    <Screen>
      <Text style={textStyles.headline}>Done</Text>
      <BigButton label="Again" onPress={() => setPhase('intro')} />
      {onExit ? <BigButton label="Menu" onPress={onExit} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  play: {
    flex: 1,
    backgroundColor: colours.ground,
    padding: layout.gutter,
  },
  tableArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padArea: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
