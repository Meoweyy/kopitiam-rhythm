/**
 * Smoke tests for the app shell.
 *
 * Deliberately thin. The rules of the game — window length, what counts as a
 * tap, how consistency is computed — are tested in `packages/core` under plain
 * Node, where a whole ten-second run executes in microseconds because time is
 * passed in rather than waited for. Tests here cover only what genuinely needs
 * the React Native runtime: that the tree mounts, and that the wiring across
 * the workspace boundary holds.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import App from '../App';
import { PROTOCOL, SpeedTapRun, defaultSpeedTapConfig } from '@kopitiam/core';

test('the app mounts without crashing', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

test('the measurement core is reachable from the app package', () => {
  // Guards the monorepo wiring. A broken path mapping or a Metro resolver
  // change would otherwise show up as a blank screen on the tablet rather than
  // as a failing test here.
  expect(PROTOCOL.speedTap.durationMs).toBe(10_000);
  expect(defaultSpeedTapConfig('left').hand).toBe('left');
});

test('a run driven entirely by supplied timestamps produces a result', () => {
  // The same code path the screen uses, exercised with no clock and no device —
  // which is the whole point of the core taking time as an argument.
  const run = new SpeedTapRun(defaultSpeedTapConfig('left'));
  run.arm(0);
  for (const at of [0, 200, 400, 600, 800]) run.tap(at);

  const result = run.result(PROTOCOL.speedTap.durationMs)!;
  expect(result.acceptedCount).toBe(5);
  expect(result.meanIntervalMs).toBe(200);
});
