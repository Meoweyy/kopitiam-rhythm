/**
 * Developer screen — S1 of the audio engine: one click, and what the device
 * actually gave us.
 *
 * This is the go/no-go on the tablet as a study device. The things to read:
 *
 *  - Granted sample rate versus advertised. A mismatch means a resampler in
 *    the path, or worse, a silent tempo error.
 *  - Performance mode. "low-latency" means the fast mixer path was granted.
 *  - Timestamp reads. If `getTimestamp()` never succeeds, the clock map (S3)
 *    cannot be built, and beat times cannot be placed on the tap clock.
 *  - Implied sample rate from the fitted clock. Should match the granted rate
 *    to within a few Hz.
 *  - Residual SD of the fit. Sub-millisecond is a healthy audio clock.
 *  - Uptime − nanoTime. Should be ~0: the touch clock and the audio clock are
 *    the same clock. If not, nothing downstream is valid.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PROTOCOL, fitClockMap, fitClockOffset, uptimeMsOfFrame, type ClockMap } from '@kopitiam/core';

import NativeAudioEngine, {
  type AudioReadout,
  type ClickTrackEnd,
  type ClickTrackStart,
} from '../specs/NativeAudioEngine';
import { BigButton, Row, Screen, textStyles } from '../ui/controls';
import { layout } from '../ui/theme';

/** STAND-IN tempo and length for the dev track, as in PacedTapScreen. */
const TRACK_TEMPO_MS = 700;
const TRACK_BEATS = 16;

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'playing' }
  | { readonly kind: 'done'; readonly readout: AudioReadout; readonly map: ClockMap | null }
  | {
      readonly kind: 'track-done';
      readonly start: ClickTrackStart;
      readonly end: ClickTrackEnd;
      /** Free slope from the warm-up anchors — what S2 did. For comparison. */
      readonly warmupFreeMap: ClockMap | null;
      /** Fixed slope, offset from the warm-up anchors — what a trial freezes (S3). */
      readonly warmupFixedMap: ClockMap | null;
      /** Free slope from every anchor — the watchdog. */
      readonly fullMap: ClockMap | null;
    }
  | { readonly kind: 'failed'; readonly message: string };

export function AudioCheckScreen({ onExit }: { onExit?: () => void }): React.JSX.Element {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const play = useCallback(async () => {
    setState({ kind: 'playing' });
    try {
      const readout = await NativeAudioEngine.playClick(
        PROTOCOL.cue.clickHz,
        PROTOCOL.cue.clickMs,
      );
      setState({ kind: 'done', readout, map: fitClockMap(readout.timestamps) });
    } catch (error) {
      setState({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const playTrack = useCallback(async () => {
    setState({ kind: 'playing' });
    try {
      const start = await NativeAudioEngine.startClickTrack({
        ioiMs: TRACK_TEMPO_MS,
        beatCount: TRACK_BEATS,
        leadInMs: PROTOCOL.session.leadInMs,
        tailMs: PROTOCOL.session.trialGraceMs,
        clickHz: PROTOCOL.cue.clickHz,
        clickMs: PROTOCOL.cue.clickMs,
      });
      const end = await NativeAudioEngine.finishClickTrack();
      setState({
        kind: 'track-done',
        start,
        end,
        warmupFreeMap: fitClockMap(start.anchors),
        warmupFixedMap: fitClockOffset(start.anchors, start.sampleRate),
        fullMap: fitClockMap(end.anchors),
      });
    } catch (error) {
      setState({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const busy = state.kind === 'playing';

  return (
    <Screen>
      <Text style={textStyles.headline}>Sound check</Text>
      <Text style={textStyles.bodyMuted}>
        Click: {PROTOCOL.cue.clickHz} Hz, {PROTOCOL.cue.clickMs} ms. Track: {TRACK_BEATS} clicks at{' '}
        {TRACK_TEMPO_MS} ms.
      </Text>

      {state.kind === 'done' ? <ReadoutTable readout={state.readout} map={state.map} /> : null}
      {state.kind === 'track-done' ? <TrackTable state={state} /> : null}
      {state.kind === 'failed' ? (
        <Text style={textStyles.body}>Failed: {state.message}</Text>
      ) : null}

      <View style={styles.buttons}>
        <BigButton
          label={busy ? 'Playing…' : 'Play click'}
          onPress={busy ? undefined : () => void play()}
        />
        <BigButton
          label={busy ? 'Playing…' : 'Play track'}
          onPress={busy ? undefined : () => void playTrack()}
        />
      </View>
      {onExit ? <BigButton label="Menu" onPress={onExit} /> : null}
    </Screen>
  );
}

/**
 * The track report. Three clock maps are compared on purpose: the two
 * warm-up maps are what a trial has to work from when it places the beats,
 * and the full map is the best available after the fact. How much each
 * warm-up map disagrees with the full one is the cost of freezing early —
 * and the fixed-slope map exists because that cost was 0.33 ms with a free
 * slope on this device (S2).
 */
function TrackTable({
  state,
}: {
  state: Extract<State, { kind: 'track-done' }>;
}): React.JSX.Element {
  const { start, end, warmupFreeMap, warmupFixedMap, fullMap } = state;
  const durationMs = (start.totalFrames / start.sampleRate) * 1000;
  const firstClickMs = (start.clickFrames[0]! / start.sampleRate) * 1000;
  const lastClickMs = (start.clickFrames[start.clickFrames.length - 1]! / start.sampleRate) * 1000;

  // Where each map puts the first click on the tap clock, in ms.
  const firstClickOn = (map: ClockMap | null): number | null =>
    map === null ? null : uptimeMsOfFrame(map, start.clickFrames[0]!);
  const fullFirst = firstClickOn(fullMap);
  const costOf = (map: ClockMap | null): string => {
    const first = firstClickOn(map);
    return first === null || fullFirst === null ? '—' : `${(first - fullFirst).toFixed(3)} ms`;
  };

  return (
    <View style={styles.table}>
      <Row label="Track" value={`${start.clickFrames.length} clicks, ${(durationMs / 1000).toFixed(2)} s`} />
      <Row label="Clicks at" value={`${firstClickMs.toFixed(1)} … ${lastClickMs.toFixed(1)} ms`} />
      <Row label="Performance mode" value={start.performanceMode} />
      <Row label="Underruns" value={String(end.underrunCount)} />
      <Row label="Anchors" value={`${start.anchors.length} at warm-up, ${end.anchors.length} total`} />
      <Row
        label="Implied rate"
        value={fullMap === null ? '—' : `${fullMap.impliedSampleRate.toFixed(2)} Hz`}
      />
      <Row
        label="Clock fit SD"
        value={
          fullMap === null || fullMap.residualSdMs === null
            ? '—'
            : `${fullMap.residualSdMs.toFixed(3)} ms`
        }
      />
      <Row label="Early freeze, free slope" value={`${costOf(warmupFreeMap)} on click 0`} muted />
      <Row label="Early freeze, fixed slope" value={`${costOf(warmupFixedMap)} on click 0`} />
      <Row
        label="Play → first anchor"
        value={
          start.anchors.length === 0
            ? '—'
            : `${(start.anchors[0]!.nanoTime / 1e6 - start.playCalledAtMs).toFixed(0)} ms`
        }
        muted
      />
    </View>
  );
}

function ReadoutTable({
  readout,
  map,
}: {
  readout: AudioReadout;
  map: ClockMap | null;
}): React.JSX.Element {
  const bufferMs = (readout.bufferSizeInFrames / readout.sampleRate) * 1000;
  const nativeBufferMs =
    readout.nativeFramesPerBuffer > 0
      ? (readout.nativeFramesPerBuffer / readout.nativeSampleRate) * 1000
      : null;

  return (
    <View style={styles.table}>
      <Row
        label="Advertised"
        value={`${readout.nativeSampleRate} Hz, ${readout.nativeFramesPerBuffer} frames${
          nativeBufferMs === null ? '' : ` (${nativeBufferMs.toFixed(1)} ms)`
        }`}
      />
      <Row
        label="Low-latency feature"
        value={`${readout.featureLowLatency ? 'yes' : 'no'}${readout.featurePro ? ', pro' : ''}`}
      />
      <Row label="Granted rate" value={`${readout.sampleRate} Hz`} />
      <Row
        label="Track buffer"
        value={`${readout.bufferSizeInFrames} frames (${bufferMs.toFixed(0)} ms)`}
      />
      <Row label="Performance mode" value={readout.performanceMode} />
      <Row label="Output" value={readout.routedDevice} />
      <Row label="Underruns" value={String(readout.underrunCount)} />
      <Row
        label="Timestamp reads"
        value={`${readout.timestampReads} of ${readout.timestampPolls}`}
      />
      <Row
        label="Implied rate"
        value={map === null ? '— (too few reads)' : `${map.impliedSampleRate.toFixed(1)} Hz`}
      />
      <Row
        label="Clock fit SD"
        value={
          map === null || map.residualSdMs === null ? '—' : `${map.residualSdMs.toFixed(3)} ms`
        }
      />
      <Row
        label="Uptime − nanoTime"
        value={`${readout.uptimeMinusNanoMs.toFixed(2)} ms`}
        muted
      />
    </View>
  );
}

const styles = StyleSheet.create({
  table: { alignSelf: 'stretch', paddingHorizontal: layout.gutter * 3, gap: 2 },
  buttons: { flexDirection: 'row', gap: layout.gutter },
});
