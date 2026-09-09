const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration for a monorepo.
 *
 * The measurement core lives at ../packages/core, outside this package's own
 * tree. Metro does not follow that by default, so two things are declared:
 *
 *   watchFolders    — the workspace root, so edits to the core trigger a reload
 *   nodeModulesPaths — both the app's own node_modules and the hoisted root one
 *
 * disableHierarchicalLookup keeps resolution to exactly those two locations.
 * Without it, Metro walks parent directories and can silently resolve a second
 * copy of React, which shows up as baffling hook errors rather than as a
 * dependency problem.
 *
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    disableHierarchicalLookup: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
