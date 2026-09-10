/**
 * Kopitiam Rhythm — application root.
 *
 * At M3 this mounts a single block, C1. From M5 a session runner sequences the
 * blocks and this becomes a host that renders whatever the runner asks for.
 *
 * The status bar stays dark-on-light regardless of system theme: the whole
 * instrument is designed around one high-contrast warm palette, and a dark
 * mode would change the luminance of the cue — which is a stimulus property,
 * not a preference.
 */

import React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { SpeedTapScreen } from './src/screens/SpeedTapScreen';
import { colours } from './src/ui/theme';

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      {/* Recent React Native drops `backgroundColor` here in favour of
          edge-to-edge; the ground colour comes from the view below instead. */}
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.root}>
        <View style={styles.root}>
          <SpeedTapScreen />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colours.ground },
});

export default App;
