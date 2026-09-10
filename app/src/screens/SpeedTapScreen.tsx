/**
 * Block C1 — the speed tap, on screen.
 *
 * This screen owns nothing but presentation and the platform clock. The rules
 * of the block — how long the window is, what counts as a tap, what the numbers
 * mean — all live in `@kopitiam/core` and are tested without a device.
 *
 * The one number on the results screen that is not part of the study is
 * "delivery jitter". It is here because it is the evidence for whether M8's
 * native touch hook is worth building.
 *
 * Note what it deliberately does NOT claim. The absolute delay from digitiser
 * to JavaScript cannot be measured without a properly synchronised clock, which
 * is one of the things M8 adds — the offset here is estimated from a single
 * touch, so absolute values are meaningless and can even come out negative.
 * The *spread* survives that flaw untouched, because a constant offset error
 * shifts every reading equally and cancels in the standard deviation.
 *
 * And the spread is the quantity that actually matters. A constant delay moves
 * every tap by the same amount and cancels out of an interval entirely; a
 * varying one inflates measured variability, which is this study's primary
 * outcome.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';

import {
  PROTOCOL,
  SpeedTapRun,
  defaultSpeedTapConfig,
  standardDeviation,
  type Hand,
  type SpeedTapResult,
} from '@kopitiam/core';

import { colours, layout, type } from '../ui/theme';
import { nativeNow, readTouchTimestamps } from '../timing/touch-clock';

type Phase = 'intro' | 'running' | 'result' | 'done';

const HANDS: readonly Hand[] = ['left', 'right'];

interface CompletedRun {
  readonly result: SpeedTapResult;
  /**
   * Spread of the touch-to-JavaScript delay, in milliseconds. Diagnostic only —
   * see the note at the top of this file for why the spread is reported and the
   * absolute delay is not.
   */
  readonly deliveryJitterMs: number | null;
}

export function SpeedTapScreen(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('intro');
  const [handIndex, setHandIndex] = useState(0);
  const [completed, setCompleted] = useState<CompletedRun[]>([]);
  const [tapCount, setTapCount] = useState(0);
  /** False while armed and waiting for the first tap to open the window. */
  const [hasStarted, setHasStarted] = useState(false);
  // Annotated because PROTOCOL is `as const`, so the initial value would
  // otherwise narrow the state's type to the literal 10000.
  const [remainingMs, setRemainingMs] = useState<number>(PROTOCOL.speedTap.durationMs);

  const runRef = useRef<SpeedTapRun | null>(null);
  const delaysRef = useRef<number[]>([]);

  const hand = HANDS[handIndex] ?? 'left';

  const beginRun = useCallback(
    (event: GestureResponderEvent) => {
      // Reading the button's own touch teaches the clock adapter the offset
      // between the platform touch clock and the JS clock, before any tap in
      // the measured window needs it.
      const stamps = readTouchTimestamps(event.nativeEvent.timestamp);

      const run = new SpeedTapRun(defaultSpeedTapConfig(hand));
      // Armed, not started. The ten seconds begin on the first tap, so the time
      // spent moving a hand onto the pad never enters the measurement.
      run.arm(stamps.nativeMs);

      runRef.current = run;
      delaysRef.current = [];
      setTapCount(0);
      setHasStarted(false);
      setRemainingMs(run.config.durationMs);
      setPhase('running');
    },
    [hand],
  );

  const handlePadTouch = useCallback((event: GestureResponderEvent) => {
    const run = runRef.current;
    if (run === null) return;

    const stamps = readTouchTimestamps(event.nativeEvent.timestamp);
    const recorded = run.tap(stamps.nativeMs);
    delaysRef.current.push(stamps.deliveryDelayMs);

    // Only accepted taps move the counter; a debounced double-report should not
    // reward the participant with a number going up.
    if (recorded.accepted) {
      setTapCount((count) => count + 1);
      if (run.windowStartedAtMs === recorded.atMs) setHasStarted(true);
    }
  }, []);

  // Drives the countdown and closes the window. 50 ms is a display cadence, not
  // a measurement one — the window boundary itself is decided by comparing
  // timestamps inside the core, not by when this interval happens to fire.
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
        setCompleted((previous) => [
          ...previous,
          { result, deliveryJitterMs: standardDeviation(delaysRef.current) },
        ]);
        setPhase('result');
      }
    }, 50);

    return () => clearInterval(id);
  }, [phase]);

  const advance = useCallback(() => {
    if (handIndex + 1 < HANDS.length) {
      setHandIndex(handIndex + 1);
      setPhase('intro');
    } else {
      setPhase('done');
    }
  }, [handIndex]);

  const restart = useCallback(() => {
    setHandIndex(0);
    setCompleted([]);
    setPhase('intro');
  }, []);

  if (phase === 'intro') {
    return (
      <Screen>
        <Text style={styles.headline}>
          {hand === 'left' ? 'Left hand' : 'Right hand'}
        </Text>
        <Text style={styles.body}>
          When you are ready, tap the big square as fast as you can.
        </Text>
        <Text style={styles.bodyMuted}>
          It lasts {PROTOCOL.speedTap.durationMs / 1000} seconds.
        </Text>
        <BigButton label="I'm ready" onTouch={beginRun} />
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
          style={[styles.pad, hand === 'left' ? styles.padLeft : styles.padRight]}
          onStartShouldSetResponder={() => true}
          onResponderGrant={handlePadTouch}
        >
          {/* The clock does not start until the first tap lands, so there is no
              hurry here and the instruction says so. */}
          <Text style={styles.padLabel}>
            {hasStarted ? 'Keep tapping' : 'Tap here to begin'}
          </Text>
        </View>
      </View>
    );
  }

  if (phase === 'result') {
    const last = completed[completed.length - 1];
    return (
      <Screen>
        <Text style={styles.headline}>
          {last?.result.hand === 'left' ? 'Left hand' : 'Right hand'}
        </Text>
        {last ? <ResultTable run={last} /> : null}
        <BigButton
          label={handIndex + 1 < HANDS.length ? 'Next hand' : 'Finish'}
          onPress={advance}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.headline}>Both hands done</Text>
      {completed.map((run) => (
        <View key={run.result.hand} style={styles.summaryBlock}>
          <Text style={styles.title}>
            {run.result.hand === 'left' ? 'Left' : 'Right'}
          </Text>
          <ResultTable run={run} />
        </View>
      ))}
      <BigButton label="Run again" onPress={restart} />
    </Screen>
  );
}

function ResultTable({ run }: { run: CompletedRun }): React.JSX.Element {
  const { result } = run;
  return (
    <View style={styles.table}>
      <Row label="Taps" value={String(result.acceptedCount)} />
      <Row label="Rate" value={`${result.tapsPerSecond.toFixed(1)} per second`} />
      <Row
        label="Average gap"
        value={result.meanIntervalMs === null ? '—' : `${result.meanIntervalMs.toFixed(0)} ms`}
      />
      <Row
        label="Wobble (SD)"
        value={result.sdIntervalMs === null ? '—' : `${result.sdIntervalMs.toFixed(1)} ms`}
      />
      <Row
        label="Consistency (CV)"
        value={result.cvInterval === null ? '—' : `${(result.cvInterval * 100).toFixed(1)}%`}
      />
      {result.rejectedCount > 0 ? (
        <Row label="Rejected" value={`${result.rejectedCount} (debounced)`} muted />
      ) : null}
      <Row
        label="Delivery jitter"
        value={
          run.deliveryJitterMs === null
            ? '—'
            : `${run.deliveryJitterMs.toFixed(1)} ms (diagnostic)`
        }
        muted
      />
    </View>
  );
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, muted && styles.mutedText]}>{label}</Text>
      <Text style={[styles.rowValue, muted && styles.mutedText]}>{value}</Text>
    </View>
  );
}

function Screen({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <View style={styles.screen}>{children}</View>;
}

function BigButton({
  label,
  onPress,
  onTouch,
}: {
  label: string;
  onPress?: () => void;
  onTouch?: (event: GestureResponderEvent) => void;
}): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      onPressIn={onTouch}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
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
  headline: {
    fontSize: type.headline,
    fontWeight: '600',
    color: colours.ink,
    textAlign: 'center',
  },
  title: { fontSize: type.title, fontWeight: '600', color: colours.ink },
  body: { fontSize: type.body, color: colours.ink, textAlign: 'center' },
  bodyMuted: { fontSize: type.small, color: colours.inkMuted, textAlign: 'center' },
  mutedText: { color: colours.inkMuted },

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
  // The active pad sits on the side of the hand in use, so the participant is
  // not reaching across the tablet.
  padLeft: { marginRight: '25%' },
  padRight: { marginLeft: '25%' },
  padLabel: { fontSize: type.body, color: colours.inkMuted },

  table: { alignSelf: 'stretch', paddingHorizontal: layout.gutter, gap: 8 },
  summaryBlock: { alignSelf: 'stretch', gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowLabel: { fontSize: type.small, color: colours.ink },
  rowValue: {
    fontSize: type.body,
    fontWeight: '600',
    color: colours.ink,
    fontVariant: ['tabular-nums'],
  },

  button: {
    minHeight: layout.minTouch,
    minWidth: 240,
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: layout.radius,
    backgroundColor: colours.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: colours.amberBright },
  buttonLabel: { fontSize: type.body, fontWeight: '600', color: colours.ground },
});
