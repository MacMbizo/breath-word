// B3 §4.1 — Metro config for the pnpm monorepo.
//
// Metro resolves `@breath-and-word/core` / `@breath-and-word/tokens` (and every hoisted native
// module) through the workspace root, so both the app and the repo root must be watched and
// queried. Hierarchical lookup is disabled because pnpm's isolated `node_modules` layout would
// otherwise resolve a second copy of a dependency from a package-local folder.
const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
