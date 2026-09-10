const path = require('path');

/**
 * Jest config for the app workspace.
 *
 * `modulePaths` is the monorepo fix. Files in `packages/core` are transformed by
 * Babel, which injects requires for `@babel/runtime` helpers — but npm installed
 * that under `app/node_modules` rather than hoisting it, and Jest resolves from
 * the requiring file's directory upward, so a core file cannot see it. Adding
 * the app's own node_modules as an absolute search path resolves it from
 * anywhere in the workspace.
 *
 * Note the split in test runners, which is deliberate rather than accidental:
 * the pure measurement core is tested with Vitest under plain Node in about a
 * second, and only this package — which genuinely needs the React Native
 * runtime — pays for Jest and its preset.
 */
module.exports = {
  preset: '@react-native/jest-preset',
  modulePaths: [path.resolve(__dirname, 'node_modules')],
};
