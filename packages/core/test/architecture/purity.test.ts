// Architectural guard for the measurement core.
//
// The primary outcome of this study is timing *variability*. Anything that can
// introduce load-dependent latency, non-determinism or platform behaviour into
// the domain is a threat to it. So this package is kept pure:
//
//   * no React / React Native — no render loop, no bridge, no components
//   * no Node APIs            — no filesystem, no process, no timers by default
//   * no DOM                  — no window, no document, no fetch
//   * no database             — persistence is an adapter's job
//
// Most of this is already a compile error, because `tsconfig.json` sets
// `"lib": ["ES2022"]` and `"types": []`. This suite guards the ways someone
// could quietly undo that later: adding a dependency, adding an import, or
// relaxing the compiler options themselves.
//
// If a test here fails, the fix is never to relax the rule. It is to move the
// offending code into `app/` as an adapter behind a port.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const srcDir = join(packageRoot, 'src');

/** Import specifiers that must never appear under `src/`, with the reason why. */
const forbiddenImports: ReadonlyArray<readonly [prefix: string, reason: string]> = [
  ['react', 'React drags in the render loop; the domain must run headless.'],
  ['react-native', 'The bridge and native modules are adapter territory.'],
  ['node:', 'Filesystem, process and OS access belong in adapters. Keeping it '
    + 'out is also what lets these tests run identically everywhere.'],
  ['fs', 'Filesystem access belongs in an adapter.'],
  ['path', 'Filesystem access belongs in an adapter.'],
  ['os', 'Platform introspection belongs in an adapter.'],
  ['crypto', 'Randomness in the domain is seeded and deterministic (PCG32), '
    + 'never drawn from a platform source — that is what makes a session '
    + 'reproducible from its seed alone.'],
  ['expo', 'Platform SDKs are adapter territory.'],
  ['@react-native', 'Platform packages are adapter territory.'],
  ['react-native-sqlite', 'Persistence is an adapter. The domain never knows '
    + 'how data is stored.'],
  ['@op-engineering', 'Persistence is an adapter.'],
];

/** Packages that must never appear in this package's `dependencies`. */
const forbiddenDependencies = [
  'react',
  'react-native',
  'expo',
  'react-native-sqlite-storage',
  'react-native-fs',
  '@op-engineering/op-sqlite',
];

/** Matches the specifier of a static `import`/`export ... from`, or a bare import. */
const importSpecifier =
  /(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

function tsFilesUnder(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // nothing to guard yet; the rule bites as soon as code lands
  }

  const found: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...tsFilesUnder(full));
    } else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) {
      found.push(full);
    }
  }
  return found;
}

function isForbidden(specifier: string, prefix: string): boolean {
  // Relative imports are always fine — they stay inside the core.
  if (specifier.startsWith('.')) return false;
  return specifier === prefix || specifier.startsWith(`${prefix}/`);
}

describe('the measurement core stays pure', () => {
  it('has no forbidden imports anywhere under src/', () => {
    const violations: string[] = [];

    for (const file of tsFilesUnder(srcDir)) {
      const source = readFileSync(file, 'utf8');
      const shown = relative(packageRoot, file).split(sep).join('/');

      for (const match of source.matchAll(importSpecifier)) {
        const specifier = match[1] ?? match[2];
        if (specifier === undefined) continue;

        for (const [prefix, reason] of forbiddenImports) {
          if (isForbidden(specifier, prefix)) {
            violations.push(`${shown}\n    imports "${specifier}"\n    ${reason}`);
          }
        }
      }
    }

    expect(
      violations,
      `The measurement core must stay headless and deterministic.\n`
        + `Move this code into app/ as an adapter behind a port in src/domain/ports/.\n\n`
        + violations.join('\n\n'),
    ).toEqual([]);
  });

  it('declares no forbidden runtime dependencies', () => {
    const pkg = JSON.parse(
      readFileSync(join(packageRoot, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };

    const declared = Object.keys(pkg.dependencies ?? {});
    const offenders = declared.filter((name) =>
      forbiddenDependencies.some((bad) => name === bad || name.startsWith(`${bad}/`)),
    );

    expect(
      offenders,
      `Adding ${offenders.join(', ')} would make the domain reachable from a UI `
        + `framework or a platform API, which is exactly what this package exists `
        + `to prevent.`,
    ).toEqual([]);
  });

  // The two settings below are the structural half of the guarantee: without
  // DOM and without ambient @types, `window`, `document`, `process` and
  // `Buffer` simply do not exist while compiling src/. Relaxing either would
  // silently reopen the door, so assert them explicitly.
  describe('tsconfig keeps the compiler-level guarantees', () => {
    const tsconfig = readFileSync(join(packageRoot, 'tsconfig.json'), 'utf8');

    it('does not include the DOM lib', () => {
      const lib = /"lib"\s*:\s*\[([^\]]*)\]/.exec(tsconfig)?.[1] ?? '';
      expect(
        lib.toLowerCase().includes('dom'),
        'Adding "DOM" to lib would make window/document/fetch resolve inside '
          + 'the domain. Browser and platform APIs belong in adapters.',
      ).toBe(false);
    });

    it('declares no ambient types', () => {
      const types = /"types"\s*:\s*\[([^\]]*)\]/.exec(tsconfig)?.[1] ?? 'MISSING';
      expect(
        types.trim(),
        'tsconfig must keep "types": []. Any ambient @types package (node, '
          + 'jest, react-native) makes platform globals resolve inside the '
          + 'domain, defeating the point of this package.',
      ).toBe('');
    });
  });
});
