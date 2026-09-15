/**
 * The kopitiam table — a lazy susan seen from above, turning at the tempo.
 *
 * Cups sit evenly around the rim. Each beat, the next cup arrives at the
 * kettle. The approach of a cup is the pacing cue: the participant can see the
 * beat coming, the way one sees a conductor's arm.
 *
 * ## Why the angle comes from the clock, not from an animation
 *
 * The obvious implementation — `Animated.timing` rotating the table over N
 * seconds, looped — runs on its own timer. Animation timers drift under load,
 * are paused and resumed by the framework, and know nothing about when the
 * beats actually fall. Over a trial the picture would slide away from the
 * beats, and the participant would be pacing to the wrong thing.
 *
 * Instead the angle is a pure function of "now" as read from the same clock
 * the taps are stamped with: every frame asks `beatPositionAt(...)` how far
 * along the grid the clock is, and sets the rotation from that. If a frame is
 * dropped the table jumps to where it should be, rather than falling behind.
 *
 * The clock is injected rather than imported so the table can be driven by a
 * fake in tests — and so that when M8 replaces the provisional clock adapter,
 * this file does not change.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { beatPositionAt, type Hand } from '@kopitiam/core';

import { colours } from './theme';

export interface TurningTableProps {
  /** When beat zero falls, in the clock's base. */
  readonly startAtMs: number;
  readonly ioiMs: number;
  /**
   * How many beats the trial has. The table stops when the last cup arrives,
   * so no cup ever reaches the kettle without a scheduled beat behind it —
   * a cue with no beat would invite a tap the trial cannot score.
   */
  readonly beatCount: number;
  /** Which side the kettle sits on; cups arrive there. */
  readonly side: Hand;
  /** Reads "now" in the same base as `startAtMs`. */
  readonly clock: () => number;
  /** Keeps the table turning while true; freezes it in place otherwise. */
  readonly turning: boolean;
  /** Cups around the rim. One arrives per beat, so a full turn is this many beats. */
  readonly cupCount: number;
  /** How long the kettle stays lit after a cup arrives, fading linearly. */
  readonly flashMs: number;
  /** Diameter, in dp. */
  readonly size?: number;
}

/** Angles are clockwise from twelve o'clock, in degrees. */
const KETTLE_ANGLE: Record<Hand, number> = { left: 270, right: 90 };

export function TurningTable({
  startAtMs,
  ioiMs,
  beatCount,
  side,
  clock,
  turning,
  cupCount,
  flashMs,
  size = 320,
}: TurningTableProps): React.JSX.Element {
  const stepDeg = 360 / cupCount;
  const rotationDeg = useRef(new Animated.Value(0)).current;
  const kettleGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!turning) return undefined;

    let frame = 0;
    const tick = (): void => {
      const position = beatPositionAt(startAtMs, ioiMs, clock());

      // The table turns until the last cup is at the kettle, then holds.
      rotationDeg.setValue(Math.min(position, beatCount - 1) * stepDeg);

      // The kettle lights on each scheduled beat and fades over flashMs. Both
      // the timing and the fade are read from the clock, so a dropped frame
      // shortens the flash rather than delaying it.
      //
      // Known limit of a visual cue: the flash is drawn on the first frame
      // after the beat, up to one display refresh (~17 ms at 60 Hz) late. The
      // scheduled time is what taps are scored against; the audible cue at M9
      // is the precise one.
      const beatIndex = Math.floor(position);
      const sinceBeatMs = (position - beatIndex) * ioiMs;
      const onScheduledBeat = beatIndex >= 0 && beatIndex < beatCount;
      kettleGlow.setValue(onScheduledBeat ? Math.max(0, 1 - sinceBeatMs / flashMs) : 0);

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [turning, startAtMs, ioiMs, beatCount, clock, stepDeg, flashMs, rotationDeg, kettleGlow]);

  const geometry = useMemo(() => tableGeometry(size), [size]);
  const kettleAngle = KETTLE_ANGLE[side];

  // Cup k starts k steps anticlockwise of the kettle, so that after the table
  // has turned k steps clockwise it is exactly at the kettle: the k-th beat.
  // Cups live inside the rotating layer, so their coordinates are in its space
  // (centre at size / 2); the kettle is in the frame's space, outside it.
  const cups = useMemo(
    () =>
      Array.from({ length: cupCount }, (_, k) =>
        pointOnRing(size / 2, geometry.cupRingRadius, kettleAngle - k * stepDeg),
      ),
    [cupCount, size, geometry, kettleAngle, stepDeg],
  );
  const kettle = pointOnRing(geometry.centre, geometry.kettleRingRadius, kettleAngle);

  const rotate = rotationDeg.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={{ width: geometry.frame, height: geometry.frame }}>
      <Animated.View
        style={[
          styles.table,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            left: geometry.centre - size / 2,
            top: geometry.centre - size / 2,
            transform: [{ rotate }],
          },
        ]}
      >
        {cups.map((cup, k) => (
          <View
            key={k}
            style={[
              styles.cup,
              {
                width: geometry.cupDiameter,
                height: geometry.cupDiameter,
                borderRadius: geometry.cupDiameter / 2,
                left: cup.x - geometry.cupDiameter / 2,
                top: cup.y - geometry.cupDiameter / 2,
              },
            ]}
          />
        ))}
        <View
          style={[
            styles.hub,
            {
              width: geometry.hubDiameter,
              height: geometry.hubDiameter,
              borderRadius: geometry.hubDiameter / 2,
              left: size / 2 - geometry.hubDiameter / 2,
              top: size / 2 - geometry.hubDiameter / 2,
            },
          ]}
        />
      </Animated.View>

      {/* The kettle does not turn with the table. Its glow is a bright layer
          whose opacity follows the clock-driven fade. */}
      <View
        style={[
          styles.kettle,
          {
            width: geometry.kettleSize,
            height: geometry.kettleSize,
            borderRadius: geometry.kettleSize / 4,
            left: kettle.x - geometry.kettleSize / 2,
            top: kettle.y - geometry.kettleSize / 2,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.kettleGlow,
            { borderRadius: geometry.kettleSize / 4, opacity: kettleGlow },
          ]}
        />
      </View>
    </View>
  );
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** A point at `angleDeg` clockwise from twelve o'clock, `radius` from `centre`. */
function pointOnRing(centre: number, radius: number, angleDeg: number): Point {
  const radians = (angleDeg * Math.PI) / 180;
  return { x: centre + radius * Math.sin(radians), y: centre - radius * Math.cos(radians) };
}

function tableGeometry(size: number) {
  const cupDiameter = size * 0.14;
  const kettleSize = size * 0.2;
  // The frame is wider than the table so the kettle can sit just off the rim.
  const frame = size + kettleSize;
  return {
    frame,
    centre: frame / 2,
    cupDiameter,
    cupRingRadius: size / 2 - cupDiameter * 0.75,
    hubDiameter: size * 0.12,
    kettleSize,
    kettleRingRadius: size / 2 + kettleSize * 0.15,
  };
}

const styles = StyleSheet.create({
  table: {
    position: 'absolute',
    backgroundColor: colours.amberSoft,
    borderWidth: 4,
    borderColor: colours.amber,
  },
  cup: {
    position: 'absolute',
    backgroundColor: colours.ground,
    borderWidth: 3,
    borderColor: colours.ink,
  },
  hub: {
    position: 'absolute',
    backgroundColor: colours.amber,
  },
  kettle: {
    position: 'absolute',
    backgroundColor: colours.ink,
    overflow: 'hidden',
  },
  kettleGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colours.amberBright,
  },
});
