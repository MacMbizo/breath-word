// FR-301..305 — Headless Zustand store for Exegesis, Lexicon, Passage Guide, Factbook,
// Inductive Study (highlights + notes + checkup reminders), and Stylus Ink Canvases.
// Never throws into UI callers; canonical AppErrors surface via `status: 'error'` and `error`.

import { createStore, type StoreApi } from 'zustand/vanilla';

import type {
  ApplicationCheckupReminder,
  FactbookDossier,
  HighlightRecord,
  InkCanvasRecord,
  InkStroke,
  InterlinearToken,
  LexiconEntry,
  NoteType,
  PassageGuide,
  StudyNoteRecord,
  SymbolTag,
  WordFrequencySummary,
  WordInspection,
} from '../domain/types';
import { asAppError, type AppError, type AppErrorFallback } from '../errors/AppError';
import type { ExegesisRepository } from '../repositories/exegesis-repository';
import type {
  CreateHighlightInput,
  CreateStudyNoteInput,
  InductiveStudyRepository,
  UpdateStudyNoteInput,
} from '../repositories/inductive-study-repository';
import type { InkCanvasRepository } from '../repositories/ink-canvas-repository';
import type { StudyRefsRepository } from '../repositories/study-refs-repository';

import type { AsyncStatus } from './types';

const STUDY_FAILURE: AppErrorFallback = {
  code: 'DB_OPERATION_FAILED',
  domain: 'DB',
  retryPolicy: 'NONE',
  userMessage: 'This study action could not be completed. Please try again.',
};

function toAppError(err: unknown): AppError {
  return asAppError(err, STUDY_FAILURE);
}

export interface StudyState {
  readonly status: AsyncStatus;
  readonly error: AppError | null;

  // FR-301 / FR-302 Exegesis & Lexicon
  readonly verseTokens: readonly InterlinearToken[];
  readonly inspectedWord: WordInspection | null;
  readonly activeLexicon: LexiconEntry | null;
  readonly wordFrequency: WordFrequencySummary | null;

  // FR-303 Passage Guide & Factbook
  readonly passageGuide: PassageGuide | null;
  readonly activeDossier: FactbookDossier | null;

  // FR-304 Inductive Study
  readonly highlights: readonly HighlightRecord[];
  readonly notes: readonly StudyNoteRecord[];
  readonly checkupReminders: readonly ApplicationCheckupReminder[];

  // FR-305 Stylus Ink
  readonly inkCanvases: readonly InkCanvasRecord[];

  loadVerseInterlinear(canonicalVerseId: number): Promise<void>;
  inspectWord(
    translationPackId: string,
    translationCode: string,
    canonicalVerseId: number,
    target: { readonly spanIndex?: number; readonly charOffset?: number; readonly wordPosition?: number },
  ): Promise<void>;
  clearInspection(): void;
  openLexicon(strongsId: string): Promise<void>;
  loadPassageGuide(startVerseId: number, endVerseId: number, translationPackId?: string): Promise<void>;
  openFactbookEntity(entityId: string): Promise<void>;
  loadRangeStudy(
    userId: string,
    startVerseId: number,
    endVerseId: number,
    translationCode?: string,
  ): Promise<void>;
  addHighlight(input: CreateHighlightInput): Promise<HighlightRecord | null>;
  updateHighlightSymbol(
    highlightId: string,
    userId: string,
    colorHex: string,
    symbolTag?: SymbolTag | null,
  ): Promise<void>;
  removeHighlight(highlightId: string, userId: string): Promise<void>;
  createNote(input: CreateStudyNoteInput): Promise<StudyNoteRecord | null>;
  updateNote(noteId: string, userId: string, patch: UpdateStudyNoteInput): Promise<void>;
  removeNote(noteId: string, userId: string): Promise<void>;
  refreshReminders(): Promise<void>;
  dismissReminder(noteId: string): Promise<void>;
  loadInkForVerse(userId: string, canonicalVerseId: number): Promise<void>;
  saveInkCanvas(input: {
    readonly id?: string;
    readonly userId: string;
    readonly canonicalVerseId: number;
    readonly noteId?: string;
    readonly strokes: readonly InkStroke[];
  }): Promise<InkCanvasRecord | null>;
  removeInkCanvas(canvasId: string, userId: string): Promise<void>;
  filterNotesByType(userId: string, noteType?: NoteType): Promise<void>;
}

export type StudyStore = StoreApi<StudyState>;

export interface CreateStudyStoreOptions {
  readonly exegesis: ExegesisRepository;
  readonly studyRefs: StudyRefsRepository;
  readonly inductive: InductiveStudyRepository;
  readonly ink: InkCanvasRepository;
}

export function createStudyStore(options: CreateStudyStoreOptions): StudyStore {
  const { exegesis, studyRefs, inductive, ink } = options;

  return createStore<StudyState>((set, get) => ({
    status: 'idle',
    error: null,
    verseTokens: [],
    inspectedWord: null,
    activeLexicon: null,
    wordFrequency: null,
    passageGuide: null,
    activeDossier: null,
    highlights: [],
    notes: [],
    checkupReminders: [],
    inkCanvases: [],

    async loadVerseInterlinear(canonicalVerseId) {
      set({ status: 'loading', error: null });
      try {
        const verseTokens = await exegesis.getVerseInterlinear(canonicalVerseId);
        set({ status: 'ready', verseTokens });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async inspectWord(translationPackId, translationCode, canonicalVerseId, target) {
      set({ status: 'loading', error: null });
      try {
        const inspectedWord = await exegesis.inspectAlignedWord(
          translationPackId,
          translationCode,
          canonicalVerseId,
          target,
        );
        set({
          status: 'ready',
          inspectedWord,
          activeLexicon: inspectedWord.lexicon ?? get().activeLexicon,
        });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    clearInspection() {
      set({ inspectedWord: null });
    },

    async openLexicon(strongsId) {
      set({ status: 'loading', error: null });
      try {
        const [activeLexicon, wordFrequency] = await Promise.all([
          exegesis.getLexiconEntry(strongsId),
          exegesis.getWordFrequency(strongsId),
        ]);
        set({ status: 'ready', activeLexicon, wordFrequency });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async loadPassageGuide(startVerseId, endVerseId, translationPackId) {
      set({ status: 'loading', error: null });
      try {
        const passageGuide = await studyRefs.getPassageGuide(
          startVerseId,
          endVerseId,
          translationPackId !== undefined ? { translationPackId } : {},
        );
        set({ status: 'ready', passageGuide });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async openFactbookEntity(entityId) {
      set({ status: 'loading', error: null });
      try {
        const activeDossier = await studyRefs.getFactbookDossier(entityId);
        set({ status: 'ready', activeDossier });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async loadRangeStudy(userId, startVerseId, endVerseId, translationCode) {
      set({ status: 'loading', error: null });
      try {
        const [highlights, notes, checkupReminders] = await Promise.all([
          inductive.listHighlightsForRange(userId, startVerseId, endVerseId, translationCode),
          inductive.listNotesForRange(userId, startVerseId, endVerseId),
          inductive.listCheckupReminders(),
        ]);
        set({ status: 'ready', highlights, notes, checkupReminders });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async addHighlight(input) {
      set({ error: null });
      try {
        const created = await inductive.createHighlight(input);
        set({ highlights: [...get().highlights, created], status: 'ready' });
        return created;
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
        return null;
      }
    },

    async updateHighlightSymbol(highlightId, userId, colorHex, symbolTag) {
      set({ error: null });
      try {
        const updated = await inductive.updateHighlight(highlightId, userId, {
          colorHex,
          ...(symbolTag !== undefined ? { symbolTag } : {}),
        });
        if (updated !== null) {
          set({
            highlights: get().highlights.map((h) => (h.id === highlightId ? updated : h)),
            status: 'ready',
          });
        }
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async removeHighlight(highlightId, userId) {
      set({ error: null });
      try {
        await inductive.deleteHighlight(highlightId, userId);
        set({
          highlights: get().highlights.filter((h) => h.id !== highlightId),
          status: 'ready',
        });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async createNote(input) {
      set({ error: null });
      try {
        const created = await inductive.createNote(input);
        const checkupReminders = await inductive.listCheckupReminders();
        set({
          notes: [created, ...get().notes],
          checkupReminders,
          status: 'ready',
        });
        return created;
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
        return null;
      }
    },

    async updateNote(noteId, userId, patch) {
      set({ error: null });
      try {
        const updated = await inductive.updateNote(noteId, userId, patch);
        const checkupReminders = await inductive.listCheckupReminders();
        if (updated !== null) {
          set({
            notes: get().notes.map((n) => (n.id === noteId ? updated : n)),
            checkupReminders,
            status: 'ready',
          });
        }
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async removeNote(noteId, userId) {
      set({ error: null });
      try {
        await inductive.deleteNote(noteId, userId);
        const checkupReminders = await inductive.listCheckupReminders();
        set({
          notes: get().notes.filter((n) => n.id !== noteId),
          checkupReminders,
          status: 'ready',
        });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async refreshReminders() {
      try {
        const checkupReminders = await inductive.listCheckupReminders();
        set({ checkupReminders });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async dismissReminder(noteId) {
      try {
        await inductive.dismissCheckupReminder(noteId);
        const checkupReminders = await inductive.listCheckupReminders();
        set({ checkupReminders });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async loadInkForVerse(userId, canonicalVerseId) {
      set({ status: 'loading', error: null });
      try {
        const inkCanvases = await ink.listCanvasesForVerse(userId, canonicalVerseId);
        set({ status: 'ready', inkCanvases });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async saveInkCanvas(input) {
      set({ error: null });
      try {
        const saved = await ink.saveCanvas(input);
        const existing = get().inkCanvases;
        const exists = existing.some((c) => c.id === saved.id);
        set({
          inkCanvases: exists
            ? existing.map((c) => (c.id === saved.id ? saved : c))
            : [saved, ...existing],
          status: 'ready',
        });
        return saved;
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
        return null;
      }
    },

    async removeInkCanvas(canvasId, userId) {
      set({ error: null });
      try {
        await ink.deleteCanvas(canvasId, userId);
        set({
          inkCanvases: get().inkCanvases.filter((c) => c.id !== canvasId),
          status: 'ready',
        });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },

    async filterNotesByType(userId, noteType) {
      set({ status: 'loading', error: null });
      try {
        const notes = await inductive.listNotesForUser(userId, noteType);
        set({ status: 'ready', notes });
      } catch (err) {
        set({ status: 'error', error: toAppError(err) });
      }
    },
  }));
}
