/**
 * Kopitiam Rhythm — application root.
 *
 * Until the session runner arrives at M5, this is a developer's menu: pick a
 * block, play it, come back. Participants will never see this screen — the
 * runner sequences blocks for them and there is nothing to choose.
 *
 * The status bar stays dark-on-light regardless of system theme: the whole
 * instrument is designed around one high-contrast warm palette, and a dark
 * mode would change the luminance of the cue — which is a stimulus property,
 * not a preference.
 */

import React, { useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AudioCheckScreen } from './src/screens/AudioCheckScreen';
import { NaturalTempoScreen } from './src/screens/NaturalTempoScreen';
import { PacedTapScreen, measurementBlackout } from './src/screens/PacedTapScreen';
import { SpeedTapScreen } from './src/screens/SpeedTapScreen';
import { BigButton, Screen, textStyles } from './src/ui/controls';
import { colours } from './src/ui/theme';

type Choice = 'menu' | 'speed-tap' | 'natural-tempo' | 'paced-tap' | 'blackout' | 'audio-check';

function App(): React.JSX.Element {
  const [choice, setChoice] = useState<Choice>('menu');
  /**
   * The tempo locked by C2, for the paced blocks. Lives here until the
   * session runner (M5) and persistence (M6) give it a proper home; until
   * then it lasts as long as the app does.
   */
  const [lockedTempoMs, setLockedTempoMs] = useState<number | null>(null);

  return (
    <SafeAreaProvider>
      {/* Recent React Native drops `backgroundColor` here in favour of
          edge-to-edge; the ground colour comes from the view below instead. */}
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.root}>
        <View style={styles.root}>
          {choice === 'menu' ? (
            <Screen>
              <Text style={textStyles.headline}>Kopitiam Rhythm</Text>
              <Text style={textStyles.bodyMuted}>
                Developer menu
                {lockedTempoMs === null
                  ? ' — no tempo locked'
                  : ` — tempo ${lockedTempoMs.toFixed(0)} ms`}
              </Text>
              {/* Two columns: a single column of six 72 dp buttons overflows a
                  601 dp screen, and an overflowing screen tripped a native
                  view-mounting bug (see the R4 commit). Keep every screen
                  inside the viewport, or scroll it. */}
              <View style={styles.menuGrid}>
                <BigButton label="Speed tap (C1)" onPress={() => setChoice('speed-tap')} />
                <BigButton label="Your own pace (C2)" onPress={() => setChoice('natural-tempo')} />
                <BigButton label="The kettle (R1)" onPress={() => setChoice('paced-tap')} />
                <BigButton label="The power cut (R4)" onPress={() => setChoice('blackout')} />
                <BigButton label="Sound check" onPress={() => setChoice('audio-check')} />
              </View>
            </Screen>
          ) : choice === 'speed-tap' ? (
            <SpeedTapScreen onExit={() => setChoice('menu')} />
          ) : choice === 'natural-tempo' ? (
            <NaturalTempoScreen
              onLocked={(tempoMs) => {
                setLockedTempoMs(tempoMs);
                setChoice('menu');
              }}
              onExit={() => setChoice('menu')}
            />
          ) : choice === 'paced-tap' ? (
            <PacedTapScreen tempoMs={lockedTempoMs} onExit={() => setChoice('menu')} />
          ) : choice === 'blackout' ? (
            <PacedTapScreen
              tempoMs={lockedTempoMs}
              blackout={measurementBlackout()}
              onExit={() => setChoice('menu')}
            />
          ) : (
            <AudioCheckScreen onExit={() => setChoice('menu')} />
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colours.ground },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 24,
    maxWidth: 640,
  },
});

export default App;
