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
 *  S4. the click track drives the schedule
 *
 * ## Where the beat times come from (S4)
 *
 * Pressing Start begins the audio. About 120 ms later — inside the 1.5 s
 * lead-in — the engine returns the frame index of every click and the first
 * few timestamps. A clock map with the slope fixed at the sample rate
 * (`fitClockOffset`) converts click 0's frame to the touch clock, and that is
 * the schedule's start time. Table, flash and scoring all hang off it.
 *
 * Consequence worth noticing: the scoring path no longer touches the
 * provisional JS clock. Taps are stamped by the kernel and beats by the audio
 * system, both in `uptimeMillis`. `nativeNow()` — the single-sample estimate
 * M8 replaces — now drives only the visuals and the end-of-trial check.
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
import { Animated, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import {
  PROTOCOL,
  PacedTapRun,
  buildBeatSchedule,
  defaultPacedTapConfig,
  fitClockMap,
  fitClockOffset,
  matchTapsToBeats,
  standardDeviation,
  uptimeMsOfFrame,
  type Hand,
  type PacedTapRejection,
  type PacedTapResult,
} from '@kopitiam/core';

import NativeAudioEngine, { type ClickTrackEnd } from '../specs/NativeAudioEngine';
import { BigButton, Row, Screen, textStyles } from '../ui/controls';
import { colours, layout } from '../ui/theme';
import { TurningTable } from '../ui/TurningTable';
import { nativeNow, readTouchTimestamps } from '../timing/touch-clock';

/** STAND-IN until C2 exists. Not a protocol value. See the note at the top. */
const PLACEHOLDER_TEMPO_MS = 700;
/** STAND-IN. How many beats a trial has is decided when R1's trial shape is designed. */
const PLACEHOLDER_BEAT_COUNT = 16;
/** R1 is single-handed. Which hand is a session-level decision that does not exist yet. */
const PLACEHOLDER_SIDE: Hand = 'right';

/** `starting` is the ~120 ms between pressing Start and the audio reporting where click 0 falls. */
type Phase = 'intro' | 'starting' | 'running' | 'done';

/** How long the bloom takes to fade. Feedback, not measurement, so an animation timer is fine. */
const BLOOM_FADE_MS = 250;

interface CompletedTrial {
  readonly result: PacedTapResult;
  /** Spread of the touch-to-JS delay. Diagnostic only; see SpeedTapScreen for why spread, not size. */
  readonly deliveryJitterMs: number | null;
  /** The audio engine's end-of-track report, once it arrives. */
  readonly audio: ClickTrackEnd | null;
  /** Implied sample rate from every anchor of the track — the watchdog. */
  readonly impliedSampleRate: number | null;
}

export function PacedTapScreen({ onExit }: { onExit?: () => void }): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('intro');
  const [completed, setCompleted] = useState<CompletedTrial | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runRef = useRef<PacedTapRun | null>(null);
  /** Touch-to-JS delay per tap, for the diagnostic on the results view. */
  const delaysRef = useRef<number[]>([]);
  /** Resolves with the audio engine's end-of-track report. */
  const audioEndRef = useRef<Promise<ClickTrackEnd> | null>(null);
  const bloom = useRef(new Animated.Value(0)).current;
  const [startAtMs, setStartAtMs] = useState(0);

  const beginRun = useCallback((event: GestureResponderEvent) => {
    // The button's own touch teaches the clock adapter the offset between the
    // platform touch clock and the JS clock. Since S4 that offset drives only
    // the visuals; the beat times below come from the audio.
    readTouchTimestamps(event.nativeEvent.timestamp);

    setError(null);
    setCompleted(null);
    setPhase('starting');

    void (async () => {
      try {
        const start = await NativeAudioEngine.startClickTrack({
          ioiMs: PLACEHOLDER_TEMPO_MS,
          beatCount: PLACEHOLDER_BEAT_COUNT,
          // A whole number of beats, so the first cup starts on the grid and
          // its approach is the tempo.
          leadInMs: PROTOCOL.session.leadInBeats * PLACEHOLDER_TEMPO_MS,
          tailMs: PROTOCOL.session.trialGraceMs,
          clickHz: PROTOCOL.cue.clickHz,
          clickMs: PROTOCOL.cue.clickMs,
        });

        // Frozen for the trial: slope fixed at the sample rate, offset from
        // the warm-up anchors. Click 0's frame, on the touch clock, is the
        // schedule's start.
        const map = fitClockOffset(start.anchors, start.sampleRate);
        if (map === null) throw new Error('audio engine returned no timestamps');
        const firstBeatAtMs = uptimeMsOfFrame(map, start.clickFrames[0]!);

        const beats = buildBeatSchedule({
          startAtMs: firstBeatAtMs,
          ioiMs: PLACEHOLDER_TEMPO_MS,
          beatCount: PLACEHOLDER_BEAT_COUNT,
          side: PLACEHOLDER_SIDE,
        });
        runRef.current = new PacedTapRun(defaultPacedTapConfig(beats, PLACEHOLDER_TEMPO_MS));
        delaysRef.current = [];
        audioEndRef.current = NativeAudioEngine.finishClickTrack();

        setStartAtMs(firstBeatAtMs);
        setPhase('running');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setPhase('intro');
      }
    })();
  }, []);

  // Leaving mid-trial must silence the track.
  useEffect(
    () => () => {
      void NativeAudioEngine.stopClickTrack();
    },
    [],
  );

  const handlePadTouch = useCallback(
    (event: GestureResponderEvent) => {
      const run = runRef.current;
      if (run === null) return;

      const stamps = readTouchTimestamps(event.nativeEvent.timestamp);
      const recorded = run.tap(stamps.nativeMs, PLACEHOLDER_SIDE);
      delaysRef.current.push(stamps.deliveryDelayMs);

      // Feedback is one-directional: a tap near a beat blooms, anything else
      // produces nothing at all. "Near" is decided by the same matcher that
      // scores the trial, so the bloom can never disagree with the data.
      if (!recorded.accepted) return;
      const near = matchTapsToBeats(
        run.config.beats.map((b) => b.atMs),
        [recorded.atMs],
        run.config.matchWindowMs,
      );
      if (near.matches.length === 0) return;

      bloom.setValue(1);
      Animated.timing(bloom, {
        toValue: 0,
        duration: BLOOM_FADE_MS,
        useNativeDriver: true,
      }).start();
    },
    [bloom],
  );

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
        const trial: CompletedTrial = {
          result: finished,
          deliveryJitterMs: standardDeviation(delaysRef.current),
          audio: null,
          impliedSampleRate: null,
        };
        setCompleted(trial);
        setPhase('done');

        // The audio report lands a moment later; fill it in when it does.
        void audioEndRef.current?.then((audio) => {
          setCompleted((current) =>
            current === trial
              ? { ...trial, audio, impliedSampleRate: fitClockMap(audio.anchors)?.impliedSampleRate ?? null }
              : current,
          );
        });
      }
    }, 50);

    return () => clearInterval(id);
  }, [phase]);

  if (phase === 'intro' || phase === 'starting') {
    return (
      <Screen>
        <Text style={textStyles.headline}>The kettle</Text>
        <Text style={textStyles.body}>
          Watch the table turn. Each time a cup reaches the kettle, tap.
        </Text>
        {error ? <Text style={textStyles.bodyMuted}>Sound failed: {error}</Text> : null}
        <BigButton
          label={phase === 'starting' ? 'Starting…' : 'Start'}
          onTouch={phase === 'starting' ? undefined : beginRun}
        />
        {onExit && phase === 'intro' ? <BigButton label="Menu" onPress={onExit} /> : null}
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
            beatCount={PLACEHOLDER_BEAT_COUNT}
            side={PLACEHOLDER_SIDE}
            clock={nativeNow}
            turning
            cupCount={PROTOCOL.cue.cupsOnTable}
            flashMs={PROTOCOL.cue.visualFlashMs}
            size={280}
          />
        </View>
        <View style={styles.padArea}>
          <View
            style={[
              styles.pad,
              PLACEHOLDER_SIDE === 'left' ? styles.padLeft : styles.padRight,
            ]}
            onStartShouldSetResponder={() => true}
            onResponderGrant={handlePadTouch}
          >
            <Animated.View style={[styles.bloom, { opacity: bloom }]} pointerEvents="none" />
          </View>
        </View>
      </View>
    );
  }

  return (
    <Screen>
      <Text style={textStyles.headline}>Done</Text>
      {completed ? <ResultTable trial={completed} /> : null}
      <BigButton label="Again" onPress={() => setPhase('intro')} />
      {onExit ? <BigButton label="Menu" onPress={onExit} /> : null}
    </Screen>
  );
}

/** "3 (2 double-touch, 1 before start)" — every rejection, with its reason. */
function describeRejections(result: PacedTapResult): string {
  const labels: Record<PacedTapRejection, string> = {
    debounce: 'double-touch',
    'before-window': 'before start',
    'after-window': 'after end',
  };
  const counts = new Map<PacedTapRejection, number>();
  for (const tap of result.taps) {
    if (tap.rejection !== null) counts.set(tap.rejection, (counts.get(tap.rejection) ?? 0) + 1);
  }
  const parts = [...counts].map(([reason, n]) => `${n} ${labels[reason]}`);
  return `${result.rejectedCount} (${parts.join(', ')})`;
}

/**
 * Developer view of a trial. Participants never see numbers — the plan's rule
 * is that no score, percentage or streak is ever shown — so this table exists
 * for development and, later, for the researcher's screen only.
 */
function ResultTable({ trial }: { trial: CompletedTrial }): React.JSX.Element {
  const { result } = trial;
  const signed = (ms: number): string => `${ms > 0 ? '+' : ''}${ms.toFixed(0)} ms`;

  return (
    <View style={styles.table}>
      <Row label="Beats" value={String(result.beats.length)} />
      <Row label="Hit" value={String(result.matches.length)} />
      <Row label="Missed" value={String(result.missedBeatIndices.length)} />
      <Row label="Extra taps" value={String(result.extraTapIndices.length)} />
      <Row
        label="Average timing"
        value={
          result.meanAsynchronyMs === null
            ? '—'
            : `${signed(result.meanAsynchronyMs)} (${result.meanAsynchronyMs < 0 ? 'early' : 'late'})`
        }
      />
      <Row
        label="Wobble (SD)"
        value={result.sdAsynchronyMs === null ? '—' : `${result.sdAsynchronyMs.toFixed(1)} ms`}
      />
      <Row
        label="Per beat"
        value={result.asynchroniesMs.map((a) => (a > 0 ? `+${a.toFixed(0)}` : a.toFixed(0))).join(' ')}
        muted
      />
      {result.rejectedCount > 0 ? (
        <Row label="Rejected" value={describeRejections(result)} muted />
      ) : null}
      <Row
        label="Delivery jitter"
        value={
          trial.deliveryJitterMs === null
            ? '—'
            : `${trial.deliveryJitterMs.toFixed(1)} ms (diagnostic)`
        }
        muted
      />
      <Row
        label="Audio"
        value={
          trial.audio === null
            ? '…'
            : `${trial.audio.underrunCount} underruns, ${trial.audio.anchors.length} anchors${
                trial.audio.stopped ? ', stopped early' : ''
              }`
        }
        muted
      />
      <Row
        label="Audio clock"
        value={
          trial.impliedSampleRate === null ? '…' : `${trial.impliedSampleRate.toFixed(1)} Hz`
        }
        muted
      />
    </View>
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
    height: 180,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  pad: {
    flex: 1,
    borderRadius: layout.radius,
    backgroundColor: colours.amberSoft,
    borderWidth: 4,
    borderColor: colours.amber,
    overflow: 'hidden',
  },
  // The pad sits under the kettle's side, so the participant is not reaching
  // across the tablet.
  padLeft: { marginRight: '50%' },
  padRight: { marginLeft: '50%' },
  bloom: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colours.amberBright,
  },

  table: { alignSelf: 'stretch', paddingHorizontal: layout.gutter * 4, gap: 4 },
});
