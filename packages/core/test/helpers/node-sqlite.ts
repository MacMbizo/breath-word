// Vite 5 does not classify `node:sqlite` as a builtin (its builtin list predates the
// module), so a static `import 'node:sqlite'` fails under vitest. Loading it through
// Node's own `createRequire` sidesteps Vite's import analysis while keeping full types.

import { createRequire } from 'node:module';
import type * as SqliteModule from 'node:sqlite';

const require = createRequire(import.meta.url);

export const { DatabaseSync } = require('node:sqlite') as typeof SqliteModule;

/** Instance type of the `DatabaseSync` class (usable as a type annotation). */
export type DatabaseSyncInstance = InstanceType<typeof DatabaseSync>;
