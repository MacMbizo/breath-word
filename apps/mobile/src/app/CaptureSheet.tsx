// FR-201 — ≤2-tap tap-to-capture verse pooling (mobile).
//
// Opens from the reader's Capture action. The passage defaults to the whole open chapter, so the
// minimum path is Capture → Save (two taps) with full context expansion; a verse-range selector
// refines the start/end verse when the user wants a narrower range. The write goes through the
// headless prayer store (AGENTS.md rule 1) — no repository is constructed and no SQL here.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Chapter, PrayerPoolView } from '@breath-and-word/core';
import {
  COLORS,
  FONT_FAMILIES,
  FONT_SIZES,
  LINE_HEIGHTS,
  MIN_TOUCH_TARGET,
  RADII,
  SPACING,
} from '@breath-and-word/tokens';

import { useCoreRuntime } from './CoreRuntime';
import { useCoreStore } from './useCoreStore';

const THEME = COLORS.daylight;

export interface CaptureSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** The chapter currently open in the reader (FR-101). */
  readonly chapter: Chapter | null;
  /** Human reference, e.g. "Romans 8". */
  readonly reference: string;
}

export function CaptureSheet({ visible, onClose, chapter, reference }: CaptureSheetProps) {
  const runtime = useCoreRuntime();
  const { pools, poolsStatus } = useCoreStore(runtime.stores.prayer);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [capturing, setCapturing] = useState(false);

  const verses = useMemo(() => chapter?.verses ?? [], [chapter]);
  const firstVerse = verses[0]?.verse ?? null;
  const lastVerse = verses[verses.length - 1]?.verse ?? null;

  // Resolve the writing identity once and load the pool list when the sheet is first shown.
  useEffect(() => {
    void runtime.repositories.identity.getOrCreateCurrentUserId().then(setUserId);
  }, [runtime]);

  useEffect(() => {
    if (!visible || userId === null) return;
    void runtime.stores.prayer.getState().loadPools(userId);
  }, [visible, userId, runtime]);

  // Reset the transient selection each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setRange(null);
      setCapturing(false);
    }
  }, [visible]);

  // Preselect the first pool once the list resolves (so Save stays a single tap).
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

  // Tap-to-anchor, then tap-to-extend: a single-verse selection expands to the tapped range; a
  // completed range starts a fresh single-verse selection on the next tap.
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
    return verses.filter((verse) => verse.verse >= effectiveRange.start && verse.verse <= effectiveRange.end);
  }, [verses, effectiveRange]);

  const capturedText = useMemo(
    () => capturedVerses.map((verse) => verse.plainText).join(' '),
    [capturedVerses],
  );

  const canSave =
    userId !== null &&
    selectedPoolId !== null &&
    capturedVerses.length > 0 &&
    chapter !== null &&
    !capturing;

  const save = useCallback(async () => {
    if (!canSave || userDefinitelyNull(userId, selectedPoolId, chapter)) return;
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

  const rangeLabel =
    effectiveRange === null
      ? 'No verses available'
      : effectiveRange.start === effectiveRange.end
        ? `v${effectiveRange.start}`
        : `v${effectiveRange.start}–${effectiveRange.end}`;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{`Capture ${reference}`}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.outlineButton}>
              <Text style={styles.outlineButtonText}>Cancel</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>{`Passage · ${rangeLabel}`}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.verseRow}>
            {verses.map((verse) => {
              const inRange =
                effectiveRange !== null &&
                verse.verse >= effectiveRange.start &&
                verse.verse <= effectiveRange.end;
              return (
                <Pressable
                  key={verse.canonicalVerseId}
                  onPress={() => tapVerse(verse.verse)}
                  accessibilityRole="button"
                  accessibilityLabel={`Verse ${verse.verse}`}
                  style={[styles.verseChip, inRange && styles.verseChipActive]}
                >
                  <Text style={[styles.verseChipText, inRange && styles.verseChipTextActive]}>
                    {verse.verse}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {capturedText.length > 0 && (
            <Text style={styles.preview} numberOfLines={3}>
              {capturedText}
            </Text>
          )}

          <Text style={styles.sectionLabel}>Pool</Text>
          {poolsStatus === 'loading' && <Text style={styles.muted}>Loading pools…</Text>}
          {poolsStatus === 'ready' && pools.length === 0 && (
            <Text style={styles.muted}>Create a pool first, then capture passages into it.</Text>
          )}
          <View style={styles.chipRow}>
            {pools.map((pool) => (
              <PoolChip
                key={pool.id}
                pool={pool}
                active={pool.id === selectedPoolId}
                onPress={() => setSelectedPoolId(pool.id)}
              />
            ))}
          </View>

          <Pressable
            onPress={() => void save()}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel="Save capture"
            style={[styles.primaryButton, !canSave && styles.disabled]}
          >
            <Text style={styles.primaryButtonText}>{capturing ? 'Saving…' : 'Capture'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Capture into ${pool.title}`}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{pool.title}</Text>
    </Pressable>
  );
}

/** Narrowing helper: true unless all three values are non-null. */
function userDefinitelyNull(
  userId: string | null,
  poolId: string | null,
  chapter: Chapter | null,
): boolean {
  return userId === null || poolId === null || chapter === null;
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: THEME.bg.elevated },
  modalSheet: {
    maxHeight: '85%',
    padding: SPACING.xl,
    gap: SPACING.md,
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    backgroundColor: THEME.bg.surface,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: {
    flexShrink: 1,
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  sectionLabel: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  verseRow: { flexDirection: 'row', gap: SPACING.sm, paddingVertical: SPACING.xs },
  verseChip: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  verseChipActive: { backgroundColor: THEME.accent.primary, borderColor: THEME.accent.primary },
  verseChipText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.primary,
  },
  verseChipTextActive: { color: THEME.bg.canvas },
  preview: {
    fontFamily: FONT_FAMILIES.scriptureSerif,
    fontSize: FONT_SIZES.uiMd,
    lineHeight: FONT_SIZES.uiMd * LINE_HEIGHTS.scripture,
    color: THEME.text.secondary,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  chipActive: { backgroundColor: THEME.accent.primary, borderColor: THEME.accent.primary },
  chipText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.primary,
  },
  chipTextActive: { color: THEME.bg.canvas },
  primaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.pill,
    backgroundColor: THEME.accent.primary,
  },
  primaryButtonText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.bg.canvas,
  },
  outlineButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  outlineButtonText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  muted: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  disabled: { opacity: 0.4 },
});
