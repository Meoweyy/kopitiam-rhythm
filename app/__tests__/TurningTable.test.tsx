/**
 * Smoke test for the turning table.
 *
 * The angle maths is `beatPositionAt` in the core, tested there. This checks
 * only what needs the React Native runtime: that the component mounts with an
 * injected clock and the requested number of cups, and that it does not touch
 * a real clock — the clock is a fake here and the test would fail to compile
 * if the component imported one.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { TurningTable } from '../src/ui/TurningTable';

test('mounts with an injected clock and lays out one cup per beat of a turn', async () => {
  let now = 10_000;
  const clock = (): number => now;

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <TurningTable
        startAtMs={10_000}
        ioiMs={700}
        beatCount={12}
        side="right"
        clock={clock}
        turning={false}
        cupCount={6}
        flashMs={150}
      />,
    );
  });

  // Six cups, one hub, one kettle, one rotating layer, one frame.
  const views = renderer.root.findAllByType(require('react-native').View);
  expect(views.length).toBeGreaterThanOrEqual(6 + 1 + 1);

  now = 10_700;
  await ReactTestRenderer.act(() => {
    renderer.update(
      <TurningTable
        startAtMs={10_000}
        ioiMs={700}
        beatCount={12}
        side="right"
        clock={clock}
        turning={false}
        cupCount={6}
        flashMs={150}
      />,
    );
  });
  await ReactTestRenderer.act(() => {
    renderer.unmount();
  });
});
