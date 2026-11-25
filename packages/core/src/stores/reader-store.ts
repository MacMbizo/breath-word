// B3 §4.1 / §4.2 rule 2 — headless reader store (FR-101..103).
//
// A framework-free `zustand/vanilla` store that UI screens subscribe to (React via
// `useStore(store, selector)`); `packages/core` stays 100% pure TypeScript because nothing
// here touches React or the DOM. All reads go through `ReaderRepository` — the store never
// writes SQL (AGENTS.md rule 1) and never throws (failures land in `error` state as a
// canonical `AppError`, AGENTS.md rule 7).

import { createStore, type StoreApi } from 'zustand/vanilla';

import type { Verse } from '../domain/types';
import { asAppError, type AppError, type AppErrorFallback } from '../errors/AppError';
import type {
  Chapter,
  ReaderRepository,
  SearchHit,
  SearchQuery,
  TranslationRef,
} from '../repositories/reader-repository';

import type { AsyncStatus } from './types';

const READER_FAILURE: AppErrorFallback = {
  code: 'DB_OPERATION_FAILED',
  domain: 'DB',
  retryPolicy: 'NONE',
  userMessage: 'This passage could not be loaded. Please try again.',
};

/** The chapter currently open in the reader (FR-101). */
export interface ReaderLocation {
  readonly packId: string;
  readonly translationCode: string;
  readonly bookNumber: number;
  readonly chapter: number;
}

export interface ReaderStoreState {
  /** Chapter, status and error for the primary column. */
  readonly location: ReaderLocation | null;
  readonly chapter: Chapter | null;
  readonly status: AsyncStatus;
  readonly error: AppError | null;
  /** FR-102 — the last `compareVerses` result, one entry per resolved translation. */
  readonly comparison: readonly Verse[];
  readonly comparisonStatus: AsyncStatus;
  /** FR-103 — the last search's query, hits and status. */
  readonly searchQuery: string;
  readonly searchResults: readonly SearchHit[];
  readonly searchStatus: AsyncStatus;
  readonly searchError: AppError | null;
}

export interface ReaderStoreActions {
  /** FR-101 — load a chapter into the store. */
  openChapter(location: ReaderLocation): Promise<void>;
  /** FR-102 — load one canonical verse across several translations. */
  compareVerses(refs: readonly TranslationRef[], canonicalVerseId: number): Promise<readonly Verse[]>;
  /** FR-103 — run a local FTS5 search. */
  search(query: SearchQuery): Promise<readonly SearchHit[]>;
  /** Clear the search panel back to its empty state. */
  clearSearch(): void;
}

export type ReaderStore = StoreApi<ReaderStoreState & ReaderStoreActions>;

const INITIAL_STATE: ReaderStoreState = {
  location: null,
  chapter: null,
  status: 'idle',
  error: null,
  comparison: [],
  comparisonStatus: 'idle',
  searchQuery: '',
  searchResults: [],
  searchStatus: 'idle',
  searchError: null,
};

export function createReaderStore(reader: ReaderRepository): ReaderStore {
  return createStore<ReaderStoreState & ReaderStoreActions>()((set) => ({
    ...INITIAL_STATE,

    async openChapter(location) {
      set({ location, status: 'loading', error: null });
      try {
        const chapter = await reader.getChapter(
          location.packId,
          location.translationCode,
          location.bookNumber,
          location.chapter,
        );
        set({ chapter, status: 'ready' });
      } catch (error) {
        set({ chapter: null, status: 'error', error: asAppError(error, READER_FAILURE) });
      }
    },

    async compareVerses(refs, canonicalVerseId) {
      set({ comparisonStatus: 'loading' });
      try {
        const comparison = await reader.compareVerses(refs, canonicalVerseId);
        set({ comparison, comparisonStatus: 'ready' });
        return comparison;
      } catch {
        set({ comparison: [], comparisonStatus: 'error' });
        return [];
      }
    },

    async search(query) {
      set({ searchQuery: query.text, searchStatus: 'loading', searchError: null });
      try {
        const searchResults = await reader.search(query);
        set({ searchResults, searchStatus: 'ready' });
        return searchResults;
      } catch (error) {
        set({ searchResults: [], searchStatus: 'error', searchError: asAppError(error, READER_FAILURE) });
        return [];
      }
    },

    clearSearch() {
      set({ searchQuery: '', searchResults: [], searchStatus: 'idle', searchError: null });
    },
  }));
}
