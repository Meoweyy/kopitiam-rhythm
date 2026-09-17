/**
 * Block C2 — the natural tempo, on screen.
 *
 * The same run as the speed tap — armed by the button, started by the first
 * tap, ten seconds — with a different instruction and a different number
 * taken from it: the median gap, clamped, which becomes the tempo every paced
 * block runs at. The estimate lives in `@kopitiam/core`; this screen shows it
 * and hands it up to the app when the participant confirms.
 *
 * The running view duplicates the speed tap's. Deliberately: two concrete
 * screens exist now, and the shared "tap pad run" is extracted at M5 from
 * both, not guessed from one.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import {
  PROTOCOL,
  SpeedTapRun,
  defaultNaturalTempoConfig,
  estimateNaturalTempo,
  type Hand,
  type NaturalTempoEstimate,
  type SpeedTapResult,
} from '@kopitiam/core';

import { BigButton, Row, Screen, textStyles } from '../ui/controls';
import { colours, layout, type } from '../ui/theme';
import { nativeNow, readTouchTimestamps } from '../timing/touch-clock';

/** Which hand is a session-level decision that does not exist yet. */
const PLACEHOLDER_HAND: Hand = 'right';

type Phase = 'intro' | 'running' | 'result';

export function NaturalTempoScreen({
  onLocked,
  onExit,
}: {
  /** Called with the tempo to lock, once the participant confirms it. */
  onLocked?: (tempoMs: number) => void;
  onExit?: () => void;
}): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('intro');
  const [tapCount, setTapCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number>(PROTOCOL.naturalTempo.durationMs);
  const [outcome, setOutcome] = useState<{
    result: SpeedTapResult;
    estimate: NaturalTempoEstimate;
  } | null>(null);

  const runRef = useRef<SpeedTapRun | null>(null);

  const beginRun = useCallback((event: GestureResponderEvent) => {
    const stamps = readTouchTimestamps(event.nativeEvent.timestamp);
    const run = new SpeedTapRun(defaultNaturalTempoConfig(PLACEHOLDER_HAND));
    run.arm(stamps.nativeMs);
    runRef.current = run;
    setTapCount(0);
    setHasStarted(false);
    setRemainingMs(run.config.durationMs);
    setOutcome(null);
    setPhase('running');
  }, []);

  const handlePadTouch = useCallback((event: GestureResponderEvent) => {
    const run = runRef.current;
    if (run === null) return;
    const stamps = readTouchTimestamps(event.nativeEvent.timestamp);
    const recorded = run.tap(stamps.nativeMs);
    if (recorded.accepted) {
      setTapCount((n) => n + 1);
      if (run.windowStartedAtMs === recorded.atMs) setHasStarted(true);
    }
  }, []);

  useEffect(() => {
    if (phase !== 'running') return undefined;
    const id = setInterval(() => {
      const run = runRef.current;
      if (run === null) return;
      const now = nativeNow();
      setRemainingMs(run.remainingMsAt(now));
      const result = run.result(now);
      if (result !== null) {
        clearInterval(id);
        setOutcome({ result, estimate: estimateNaturalTempo(result) });
        setPhase('result');
      }
    }, 50);
    return () => clearInterval(id);
  }, [phase]);

  if (phase === 'intro') {
    return (
      <Screen>
        <Text style={textStyles.headline}>Your own pace</Text>
        <Text style={textStyles.body}>
          Tap the square at a steady pace that feels comfortable to you. Not fast, not slow —
          whatever feels natural.
        </Text>
        <Text style={textStyles.bodyMuted}>
          It lasts {PROTOCOL.naturalTempo.durationMs / 1000} seconds, from your first tap.
        </Text>
        <BigButton label="I'm ready" onTouch={beginRun} />
        {onExit ? <BigButton label="Menu" onPress={onExit} /> : null}
      </Screen>
    );
  }

  if (phase === 'running') {
    return (
      <View style={styles.screen}>
        <View style={styles.runHeader}>
          <Text style={styles.countdown}>
            {hasStarted ? `${(remainingMs / 1000).toFixed(1)}s` : 'Ready'}
          </Text>
          <Text style={styles.tapCount}>{tapCount}</Text>
        </View>
        <View
          style={[styles.pad, PLACEHOLDER_HAND === 'left' ? styles.padLeft : styles.padRight]}
          onStartShouldSetResponder={() => true}
          onResponderGrant={handlePadTouch}
        >
          <Text style={styles.padLabel}>
            {hasStarted ? 'Keep going, steady' : 'Tap here to begin'}
          </Text>
        </View>
      </View>
    );
  }

  const estimate = outcome?.estimate;
  return (
    <Screen>
      <Text style={textStyles.headline}>Your pace</Text>
      {outcome && estimate ? (
        <View style={styles.table}>
          <Row label="Taps" value={String(outcome.result.acceptedCount)} />
          <Row
            label="Typical gap"
            value={
              estimate.medianIntervalMs === null ? '—' : `${estimate.medianIntervalMs.toFixed(0)} ms`
            }
          />
          <Row
            label="Tempo to lock"
            value={estimate.tempoMs === null ? 'not enough taps' : `${estimate.tempoMs.toFixed(0)} ms per beat`}
          />
          {estimate.clamp === 'raised-to-min' ? (
            <Row label="Note" value={`faster than ${PROTOCOL.tempo.minMs} ms — raised to the minimum`} muted />
          ) : null}
          {estimate.clamp === 'lowered-to-max' ? (
            <Row label="Note" value={`slower than ${PROTOCOL.tempo.maxMs} ms — lowered to the maximum`} muted />
          ) : null}
          {estimate.tempoMs === null ? (
            <Row
              label="Note"
              value={`needs at least ${PROTOCOL.tempo.minIntervalsForEstimate + 1} taps; got ${outcome.result.acceptedCount}`}
              muted
            />
          ) : null}
        </View>
      ) : null}
      {estimate?.tempoMs != null && onLocked ? (
        <BigButton label="Use this tempo" onPress={() => onLocked(estimate.tempoMs!)} />
      ) : null}
      <BigButton label="Try again" onPress={() => setPhase('intro')} />
      {onExit ? <BigButton label="Menu" onPress={onExit} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colours.ground,
    padding: layout.gutter,
    justifyContent: 'center',
    alignItems: 'center',
    gap: layout.gutter,
  },
  runHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    alignItems: 'baseline',
    paddingHorizontal: layout.gutter,
  },
  countdown: { fontSize: type.title, color: colours.inkMuted, fontVariant: ['tabular-nums'] },
  tapCount: {
    fontSize: type.headline,
    fontWeight: '700',
    color: colours.amber,
    fontVariant: ['tabular-nums'],
  },
  pad: {
    flex: 1,
    alignSelf: 'stretch',
    marginTop: layout.gutter,
    borderRadius: layout.radius,
    backgroundColor: colours.amberSoft,
    borderWidth: 4,
    borderColor: colours.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padLeft: { marginRight: '25%' },
  padRight: { marginLeft: '25%' },
  padLabel: { fontSize: type.body, color: colours.inkMuted },
  table: { alignSelf: 'stretch', paddingHorizontal: layout.gutter * 3, gap: 8 },
});
