import 'package:flutter/material.dart';

/// Placeholder shell for M0.
///
/// The real participant UI arrives at M3 (C1 speed tap) and M12 (the kopitiam
/// presenter). What this file establishes now is only that the toolchain runs
/// end to end, plus the two colour tokens the whole app will be built on.
void main() => runApp(const KopitiamRhythmApp());

/// Warm off-white rather than pure white: it reduces glare for the yellowed
/// lenses and cataracts common in the 60+ population this instrument is for.
const _ground = Color(0xFFFFFBF2);

/// Charcoal rather than black, giving roughly 7:1 contrast on [_ground] —
/// WCAG AAA for body text.
const _ink = Color(0xFF1A1A1A);

class KopitiamRhythmApp extends StatelessWidget {
  const KopitiamRhythmApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Kopitiam Rhythm',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: _ground,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFC77B30), // kopi amber
          surface: _ground,
        ),
      ),
      home: const PlaceholderHome(),
    );
  }
}

/// Temporary landing screen. Replaced by the session host at M3.
class PlaceholderHome extends StatelessWidget {
  const PlaceholderHome({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'Kopitiam Rhythm',
              style: TextStyle(
                fontSize: 40,
                fontWeight: FontWeight.w600,
                color: _ink,
              ),
            ),
            SizedBox(height: 12),
            Text(
              'M0 — toolchain up. Blocks arrive at M3.',
              style: TextStyle(fontSize: 24, color: _ink),
            ),
          ],
        ),
      ),
    );
  }
}
