// C2 §4.3 — Internal Typed Event Contracts (`packages/core/src/events/types.ts`).
//
// This is the single typed seam every Phase-2 subsystem publishes through:
// sync status, dead-lettered mutations, vault lifecycle, content packs, audio, pools.

export type CoreEvent =
  | { type: 'SYNC_STATUS_CHANGED'; connected: boolean; uploading: boolean; downloading: boolean; lastSyncedAt?: string }
  | { type: 'SYNC_MUTATION_REJECTED'; table: string; rowId: string; errorCode: string }
  | { type: 'VAULT_LOCKED'; reason: 'MANUAL' | 'TIMEOUT' | 'SIGN_OUT' }
  | { type: 'VAULT_UNLOCKED'; indexedNoteCount: number }
  | { type: 'PACK_DOWNLOAD_PROGRESS'; packId: string; bytesReceived: number; totalBytes: number }
  | { type: 'PACK_INSTALLED'; packId: string; contentVersion: string }
  | { type: 'PACK_INSTALL_FAILED'; packId: string; errorCode: string }
  | { type: 'AUDIO_VERSE_CHANGED'; canonicalVerseId: number; editionId: string }
  | { type: 'POOL_SHARED_JOINED'; poolId: string; title: string };

export type CoreEventType = CoreEvent['type'];

/** Narrow a union member by its discriminant, e.g. `CoreEventOf<'VAULT_LOCKED'>`. */
export type CoreEventOf<T extends CoreEventType> = Extract<CoreEvent, { type: T }>;
