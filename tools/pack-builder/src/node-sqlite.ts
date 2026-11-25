// Node's `node:sqlite` is newer than Vite 5's builtin list, so a static
// `import 'node:sqlite'` fails when the module is transformed by vitest. Loading it
// through Node's own `createRequire` bypasses Vite's import analysis while keeping
// full types. The CLI itself runs under plain `node`, where this is a no-op.

import { createRequire } from 'node:module';
import type * as SqliteModule from 'node:sqlite';

const require = createRequire(import.meta.url);

export const { DatabaseSync } = require('node:sqlite') as typeof SqliteModule;

/** Instance type of the `DatabaseSync` class. */
export type DatabaseSync = InstanceType<typeof DatabaseSync>;
