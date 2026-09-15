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

import { PacedTapScreen } from './src/screens/PacedTapScreen';
import { SpeedTapScreen } from './src/screens/SpeedTapScreen';
import { BigButton, Screen, textStyles } from './src/ui/controls';
import { colours } from './src/ui/theme';

type Choice = 'menu' | 'speed-tap' | 'paced-tap';

function App(): React.JSX.Element {
  const [choice, setChoice] = useState<Choice>('menu');

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
              <Text style={textStyles.bodyMuted}>Developer menu</Text>
              <BigButton label="Speed tap (C1)" onPress={() => setChoice('speed-tap')} />
              <BigButton label="The kettle (R1)" onPress={() => setChoice('paced-tap')} />
            </Screen>
          ) : choice === 'speed-tap' ? (
            <SpeedTapScreen onExit={() => setChoice('menu')} />
          ) : (
            <PacedTapScreen onExit={() => setChoice('menu')} />
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colours.ground },
});

export default App;
