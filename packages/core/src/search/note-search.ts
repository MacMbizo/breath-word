// ADR-004 / B3 §4.1 `search/` — volatile in-memory search over decrypted private notes.
//
// Private fields (`user_notes_payload`, `testimony_payload`, `journal_payload`) are stored as
// `e2ee:v1` envelopes, so they cannot be indexed by SQLite FTS5 without leaking plaintext to disk
// (AGENTS.md rule 5). Instead, while the vault is unlocked, decrypted notes are indexed in a purely
// in-memory `MiniSearch` instance — no SQLite, no files, no logs. `purge()` is called on vault lock
// / sign-out (B6 §4.2.4) and drops the whole index so no plaintext survives once the DEK is gone.

import MiniSearch from 'minisearch';

/** Which private column a document was decrypted from. */
export type NoteSearchSource = 'note' | 'testimony' | 'journal';

/** One decrypted note handed to the volatile index by the UI layer. */
export interface NoteSearchDocument {
  /** Row id of the owning `prayer_item_user_states` / `prayer_session_logs` row. */
  readonly id: string;
  readonly source: NoteSearchSource;
  /** Decrypted plaintext; held only in RAM, never persisted and never logged. */
  readonly text: string;
  /** Owning pool, when the note belongs to one (context for the UI). */
  readonly poolId?: string;
}

/** A ranked match returned by {@link NoteSearchIndex.search}. */
export interface NoteSearchHit {
  readonly id: string;
  readonly source: NoteSearchSource;
  readonly poolId?: string;
  readonly score: number;
  /** Document terms that matched (MiniSearch `terms`). */
  readonly terms: readonly string[];
}

// A type alias (not an interface) so it carries an implicit index signature and stays assignable
// to MiniSearch's stored-field shape.
type IndexedDocument = {
  id: string;
  source: NoteSearchSource;
  text: string;
  poolId: string;
};

/**
 * A single volatile `MiniSearch` index. Created empty, populated from decrypted notes via
 * {@link rebuild}/{@link add}, and destroyed by {@link purge}. There is deliberately no load/save:
 * the index exists only while the vault is unlocked.
 */
export class NoteSearchIndex {
  private index: MiniSearch<IndexedDocument> | null = null;

  /** True while an index exists in RAM (i.e. the vault is unlocked and notes are indexed). */
  get active(): boolean {
    return this.index !== null;
  }

  /** Number of indexed notes; `0` while purged. */
  get size(): number {
    return this.index?.documentCount ?? 0;
  }

  /** Replace the index with a fresh one built from `documents` (the usual post-unlock load). */
  rebuild(documents: readonly NoteSearchDocument[]): void {
    const index = createIndex();
    index.addAll(documents.map(toIndexed));
    this.index = index;
  }

  /** Add or replace a single note (e.g. after the user edits it). No-op while purged. */
  add(document: NoteSearchDocument): void {
    const index = this.index;
    if (index === null) {
      return;
    }
    const doc = toIndexed(document);
    if (index.has(document.id)) {
      index.replace(doc);
    } else {
      index.add(doc);
    }
  }

  /** Drop a single note (e.g. after it is cleared). No-op while purged. */
  remove(id: string): void {
    if (this.index?.has(id) === true) {
      this.index.discard(id);
    }
  }

  /** Ranked matches for `query`; always empty while purged (vault locked). */
  search(query: string): readonly NoteSearchHit[] {
    const index = this.index;
    if (index === null) {
      return [];
    }
    return index.search(query).map((result) => ({
      id: String(result.id),
      source: result.source as NoteSearchSource,
      ...(result.poolId === '' ? {} : { poolId: result.poolId as string }),
      score: result.score,
      terms: result.terms,
    }));
  }

  /** B6 §4.2.4 — destroy the volatile index; called when the vault locks or the user signs out. */
  purge(): void {
    this.index = null;
  }
}

function createIndex(): MiniSearch<IndexedDocument> {
  return new MiniSearch<IndexedDocument>({
    idField: 'id',
    fields: ['text'],
    storeFields: ['source', 'poolId'],
    searchOptions: { prefix: true },
  });
}

function toIndexed(document: NoteSearchDocument): IndexedDocument {
  return {
    id: document.id,
    source: document.source,
    text: document.text,
    poolId: document.poolId ?? '',
  };
}
