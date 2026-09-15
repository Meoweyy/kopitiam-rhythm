/**
 * Shared elder-UI controls.
 *
 * Extracted from the speed-tap screen once the kettle screen needed the same
 * pieces. Everything here follows the theme's rules: minimum 72 dp touch
 * targets, 20 sp minimum type, amber on warm ground, no swipes or long-presses.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { colours, layout, type } from './theme';

/** A centred column with the standard gutter — the frame for every non-play view. */
export function Screen({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <View style={styles.screen}>{children}</View>;
}

/**
 * The one button style in the participant flow.
 *
 * `onTouch` fires on the touch itself, with the platform timestamp, for the
 * cases where the press starts something timed. `onPress` is the ordinary
 * release handler for navigation.
 */
export function BigButton({
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

/** A label–value line for results tables. */
export function Row({
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

export const textStyles = StyleSheet.create({
  headline: {
    fontSize: type.headline,
    fontWeight: '600',
    color: colours.ink,
    textAlign: 'center',
  },
  title: { fontSize: type.title, fontWeight: '600', color: colours.ink },
  body: { fontSize: type.body, color: colours.ink, textAlign: 'center' },
  bodyMuted: { fontSize: type.small, color: colours.inkMuted, textAlign: 'center' },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colours.ground,
    padding: layout.gutter,
    justifyContent: 'center',
    alignItems: 'center',
    gap: layout.gutter,
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

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowLabel: { fontSize: type.small, color: colours.ink },
  rowValue: {
    fontSize: type.body,
    fontWeight: '600',
    color: colours.ink,
    fontVariant: ['tabular-nums'],
  },
  mutedText: { color: colours.inkMuted },
});
