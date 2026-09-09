// Architectural guard for the measurement core.
//
// The primary outcome of this study is timing *variability*. Anything that can
// introduce load-dependent latency, non-determinism, or platform behaviour into
// the domain is a threat to it. So this package is kept pure:
//
//   * no Flutter          — no event loop, no frame scheduling, no widgets
//   * no dart:io          — no filesystem, no clock-by-side-effect
//   * no database         — persistence is an adapter's job, not the domain's
//
// The package's own pubspec already makes most of this a compile error, since
// none of those are dependencies. This test guards the remaining gap: someone
// adding a dependency later "just to get something working".
//
// If this test fails, the fix is never to relax the rule. It is to move the
// offending code into the app package as an adapter behind a port.

import 'dart:io';

import 'package:test/test.dart';

/// Import prefixes that must never appear under `lib/`.
///
/// Each is paired with the reason, so a failure explains itself rather than
/// just naming a rule.
const _forbiddenImports = <String, String>{
  'package:flutter': 'Flutter drags in the event loop and frame scheduling; '
      'the domain must be runnable headless in a plain Dart VM.',
  'package:flutter_test': 'Test infrastructure for widgets has no business in '
      'the measurement core.',
  'dart:io': 'Filesystem and process access belong in adapters. Keeping it out '
      'is also what lets these tests run identically everywhere.',
  'dart:ui': 'Rendering primitives are not domain concepts.',
  'dart:html': 'Web platform APIs are adapter territory.',
  'dart:js': 'Web platform APIs are adapter territory.',
  'dart:js_interop': 'Web platform APIs are adapter territory.',
  'package:sqflite': 'Persistence is an adapter. The domain never knows how '
      'data is stored.',
  'package:path_provider': 'Filesystem location is an adapter concern.',
  'package:shared_preferences': 'Persistence is an adapter concern.',
};

/// Packages that must never appear in this package's `dependencies:` block.
const _forbiddenDependencies = <String>[
  'flutter',
  'flutter_test',
  'sqflite',
  'sqflite_common_ffi',
  'path_provider',
  'shared_preferences',
];

/// Matches a Dart `import`/`export` directive and captures the URI.
final _directive = RegExp(
  r'''^\s*(?:import|export)\s+['"]([^'"]+)['"]''',
  multiLine: true,
);

/// Resolves the package root regardless of the directory the runner starts in.
Directory _packageRoot() {
  var dir = Directory.current;
  for (var i = 0; i < 6; i++) {
    if (File('${dir.path}${Platform.pathSeparator}pubspec.yaml').existsSync()) {
      return dir;
    }
    final parent = dir.parent;
    if (parent.path == dir.path) break;
    dir = parent;
  }
  throw StateError('Could not locate pubspec.yaml from ${Directory.current}');
}

void main() {
  final root = _packageRoot();

  group('kopitiam_core stays pure', () {
    test('no forbidden imports anywhere under lib/', () {
      final lib = Directory('${root.path}${Platform.pathSeparator}lib');
      if (!lib.existsSync()) {
        // Nothing to guard yet; the rule starts biting as soon as code lands.
        return;
      }

      final violations = <String>[];

      for (final entity in lib.listSync(recursive: true)) {
        if (entity is! File || !entity.path.endsWith('.dart')) continue;

        final relative = entity.path.substring(root.path.length + 1);
        final source = entity.readAsStringSync();

        for (final match in _directive.allMatches(source)) {
          final uri = match.group(1)!;
          for (final entry in _forbiddenImports.entries) {
            if (uri == entry.key || uri.startsWith('${entry.key}/')) {
              violations.add('  $relative\n'
                  '    imports "$uri"\n'
                  '    ${entry.value}');
            }
          }
        }
      }

      expect(
        violations,
        isEmpty,
        reason: 'The measurement core must stay headless and deterministic.\n'
            'Move this code into app/ as an adapter behind a port in '
            'lib/src/domain/ports/.\n\n${violations.join('\n\n')}',
      );
    });

    test('pubspec declares no forbidden dependencies', () {
      final pubspec =
          File('${root.path}${Platform.pathSeparator}pubspec.yaml').readAsStringSync();

      // Take only the `dependencies:` block — dev_dependencies may legitimately
      // contain test tooling, and the description prose mentions these names.
      final start = pubspec.indexOf(RegExp(r'^dependencies:', multiLine: true));
      if (start == -1) return; // no dependencies block at all: trivially pure

      final rest = pubspec.substring(start + 'dependencies:'.length);
      final end = rest.indexOf(RegExp(r'^\S', multiLine: true));
      final block = end == -1 ? rest : rest.substring(0, end);

      final declared = RegExp(r'^\s{2}([a-z_0-9]+)\s*:', multiLine: true)
          .allMatches(block)
          .map((m) => m.group(1)!)
          .toList();

      final offenders =
          declared.where(_forbiddenDependencies.contains).toList();

      expect(
        offenders,
        isEmpty,
        reason: 'Adding ${offenders.join(', ')} to kopitiam_core would make the '
            'domain reachable from a UI framework or a filesystem, which is '
            'exactly what this package exists to prevent.',
      );
    });
  });
}
