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

import { PROTOCOL, fitClockMap, type ClockMap } from '@kopitiam/core';

import NativeAudioEngine, { type AudioReadout } from '../specs/NativeAudioEngine';
import { BigButton, Row, Screen, textStyles } from '../ui/controls';
import { layout } from '../ui/theme';

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'playing' }
  | { readonly kind: 'done'; readonly readout: AudioReadout; readonly map: ClockMap | null }
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

  return (
    <Screen>
      <Text style={textStyles.headline}>Sound check</Text>
      <Text style={textStyles.bodyMuted}>
        Plays one click ({PROTOCOL.cue.clickHz} Hz, {PROTOCOL.cue.clickMs} ms) and reports what
        the audio system granted.
      </Text>

      {state.kind === 'done' ? <ReadoutTable readout={state.readout} map={state.map} /> : null}
      {state.kind === 'failed' ? (
        <Text style={textStyles.body}>Failed: {state.message}</Text>
      ) : null}

      <BigButton
        label={state.kind === 'playing' ? 'Playing…' : 'Play click'}
        onPress={state.kind === 'playing' ? undefined : () => void play()}
      />
      {onExit ? <BigButton label="Menu" onPress={onExit} /> : null}
    </Screen>
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
});
