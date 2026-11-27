// FR-201 — ≤2-tap tap-to-capture verse pooling (desktop).
//
// Mirrors the mobile `CaptureSheet`. Opens from the reader's Capture action. The passage defaults to
// the whole open chapter, so the minimum path is Capture → Save (two clicks) with full context
// expansion; a verse-range selector refines the start/end verse when the user wants a narrower
// range. The write goes through the headless prayer store (AGENTS.md rule 1) — no repository is
// constructed and no SQL here.
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Chapter, PrayerPoolView } from '@breath-and-word/core';

import { useCoreRuntime } from './CoreRuntime';
import { useCoreStore } from './useCoreStore';

const SECTION_LABEL = 'font-ui text-uiXs text-ink-secondary';
const PRIMARY =
  'rounded-pill bg-accent px-xl py-sm font-ui text-uiSm font-medium text-canvas transition hover:opacity-90 disabled:opacity-40';
const OUTLINE =
  'rounded-pill border border-hairline px-lg py-sm font-ui text-uiSm text-ink-secondary transition hover:text-ink-primary';

export interface CapturePanelProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** The chapter currently open in the reader (FR-101). */
  readonly chapter: Chapter | null;
  /** Human reference, e.g. "Romans 8". */
  readonly reference: string;
}

export function CapturePanel({ visible, onClose, chapter, reference }: CapturePanelProps) {
  const runtime = useCoreRuntime();
  const { pools, poolsStatus } = useCoreStore(runtime.stores.prayer);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [capturing, setCapturing] = useState(false);

  const verses = useMemo(() => chapter?.verses ?? [], [chapter]);
  const firstVerse = verses[0]?.verse ?? null;
  const lastVerse = verses[verses.length - 1]?.verse ?? null;

  // Resolve the writing identity once and load the pool list when the panel is first shown.
  useEffect(() => {
    void runtime.repositories.identity.getOrCreateCurrentUserId().then(setUserId);
  }, [runtime]);

  useEffect(() => {
    if (!visible || userId === null) return;
    void runtime.stores.prayer.getState().loadPools(userId);
  }, [visible, userId, runtime]);

  // Reset the transient selection each time the panel opens.
  useEffect(() => {
    if (visible) {
      setRange(null);
      setCapturing(false);
    }
  }, [visible]);

  // Preselect the first pool once the list resolves (so Save stays a single click).
  useEffect(() => {
    if (selectedPoolId === null && pools.length > 0) {
      setSelectedPoolId(pools[0]!.id);
    }
  }, [pools, selectedPoolId]);

  const effectiveRange = useMemo(() => {
    if (range !== null) return range;
    if (firstVerse === null || lastVerse === null) return null;
    return { start: firstVerse, end: lastVerse };
  }, [range, firstVerse, lastVerse]);

  // Click-to-anchor, then click-to-extend: a single-verse selection expands to the clicked range; a
  // completed range starts a fresh single-verse selection on the next click.
  const tapVerse = useCallback((verse: number) => {
    setRange((current) => {
      if (current === null || current.start !== current.end) {
        return { start: verse, end: verse };
      }
      return { start: Math.min(current.start, verse), end: Math.max(current.end, verse) };
    });
  }, []);

  const capturedVerses = useMemo(() => {
    if (effectiveRange === null) return [];
    return verses.filter(
      (verse) => verse.verse >= effectiveRange.start && verse.verse <= effectiveRange.end,
    );
  }, [verses, effectiveRange]);

  const capturedText = useMemo(
    () => capturedVerses.map((verse) => verse.plainText).join(' '),
    [capturedVerses],
  );

  const canSave =
    userId !== null && selectedPoolId !== null && capturedVerses.length > 0 && chapter !== null && !capturing;

  const save = useCallback(async () => {
    if (!canSave || userId === null || selectedPoolId === null || chapter === null) return;
    const first = capturedVerses[0]!;
    const last = capturedVerses[capturedVerses.length - 1]!;
    setCapturing(true);
    await runtime.stores.prayer.getState().capture(userId, {
      poolId: selectedPoolId,
      createdByUserId: userId,
      startVerseId: first.canonicalVerseId,
      endVerseId: last.canonicalVerseId,
      translationCode: chapter.translationCode,
      capturedText,
    });
    setCapturing(false);
    onClose();
  }, [canSave, userId, selectedPoolId, chapter, capturedVerses, capturedText, runtime, onClose]);

  if (!visible) return null;

  const rangeLabel =
    effectiveRange === null
      ? 'No verses available'
      : effectiveRange.start === effectiveRange.end
        ? `v${effectiveRange.start}`
        : `v${effectiveRange.start}–${effectiveRange.end}`;

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-elevated"
      role="dialog"
      aria-modal="true"
      aria-label={`Capture ${reference}`}
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-md overflow-y-auto rounded-lg border border-hairline bg-surface p-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-ui text-uiLg text-ink-primary">{`Capture ${reference}`}</h3>
          <button type="button" onClick={onClose} className={OUTLINE}>
            Cancel
          </button>
        </div>

        <span className={SECTION_LABEL}>{`Passage · ${rangeLabel}`}</span>
        <div className="flex flex-wrap gap-sm">
          {verses.map((verse) => {
            const inRange =
              effectiveRange !== null &&
              verse.verse >= effectiveRange.start &&
              verse.verse <= effectiveRange.end;
            return (
              <button
                key={verse.canonicalVerseId}
                type="button"
                onClick={() => tapVerse(verse.verse)}
                aria-label={`Verse ${verse.verse}`}
                className={`min-w-11 rounded-pill border px-sm py-xs font-ui text-uiSm transition ${
                  inRange
                    ? 'border-transparent bg-accent text-canvas'
                    : 'border-hairline text-ink-primary'
                }`}
              >
                {verse.verse}
              </button>
            );
          })}
        </div>

        {capturedText.length > 0 && (
          <p className="line-clamp-3 font-scripture text-uiMd text-ink-secondary">{capturedText}</p>
        )}

        <span className={SECTION_LABEL}>Pool</span>
        {poolsStatus === 'loading' && (
          <p className="font-ui text-uiSm text-ink-secondary">Loading pools…</p>
        )}
        {poolsStatus === 'ready' && pools.length === 0 && (
          <p className="font-ui text-uiSm text-ink-secondary">
            Create a pool first, then capture passages into it.
          </p>
        )}
        <div className="flex flex-wrap gap-sm">
          {pools.map((pool) => (
            <PoolChip
              key={pool.id}
              pool={pool}
              active={pool.id === selectedPoolId}
              onPress={() => setSelectedPoolId(pool.id)}
            />
          ))}
        </div>

        <button type="button" onClick={() => void save()} disabled={!canSave} className={PRIMARY}>
          {capturing ? 'Saving…' : 'Capture'}
        </button>
      </div>
    </div>
  );
}

function PoolChip({
  pool,
  active,
  onPress,
}: {
  pool: PrayerPoolView;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={`rounded-pill border px-lg py-sm font-ui text-uiSm transition ${
        active ? 'border-transparent bg-accent text-canvas' : 'border-hairline text-ink-primary'
      }`}
    >
      {pool.title}
    </button>
  );
}
