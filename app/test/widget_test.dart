// Smoke test for the M0 shell.
//
// Note what this file is NOT allowed to grow into. Widget tests may exercise
// layout and instructions, but a tap driven through the Flutter gesture system
// must never produce a scored row: scored taps come from the native touch hook,
// because Flutter's event-loop latency is load-dependent and would inflate the
// measured variability that is this study's primary outcome. A test asserting
// that invariant lands alongside the data layer at M6.

import 'package:flutter_test/flutter_test.dart';
import 'package:kopitiam_rhythm/main.dart';

void main() {
  testWidgets('app boots and renders the placeholder', (tester) async {
    await tester.pumpWidget(const KopitiamRhythmApp());

    expect(find.text('Kopitiam Rhythm'), findsOneWidget);
  });
}
