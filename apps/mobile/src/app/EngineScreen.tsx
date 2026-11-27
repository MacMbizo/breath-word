// FR-205 guided prayer engines (mobile) + FR-204 offline prompt generator.
//
// Four engines — Lectio Divina, Three Rs, ACTS and Breath — all run over the same stage flow. The
// prompt for each stage is produced by the deterministic, offline `generatePrayerPrompt` (FR-204),
// so the experience works with airplane mode on and is a backend swap away from the P4 AI gateway.
// The Breath engine additionally embeds the 120Hz `BreathRing`. Finishing logs a
// `prayer_session_logs` row via `PrayerEngineRepository`; the optional journal is E2EE-encrypted by
// the vault. No SQL and no repository construction happen in this screen (AGENTS.md rule 1).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  generatePrayerPrompt,
  type PrayerCategory,
  type PrayerPrompt,
  type PromptFramework,
} from '@breath-and-word/core';
import {
  COLORS,
  FONT_FAMILIES,
  FONT_SIZES,
  LINE_HEIGHTS,
  MIN_TOUCH_TARGET,
  RADII,
  SPACING,
} from '@breath-and-word/tokens';

import { BreathRing } from './BreathRing';
import { useCoreRuntime } from './CoreRuntime';

const THEME = COLORS.daylight;

const FRAMEWORKS: readonly { key: PromptFramework; label: string }[] = [
  { key: 'LECTIO_DIVINA', label: 'Lectio Divina' },
  { key: 'THREE_RS', label: 'Three Rs' },
  { key: 'ACTS', label: 'ACTS' },
  { key: 'BREATH', label: 'Breath' },
];

const CATEGORIES: readonly { key: PrayerCategory; label: string }[] = [
  { key: 'ANXIETY', label: 'Anxiety' },
  { key: 'GUIDANCE', label: 'Guidance' },
  { key: 'THANKSGIVING', label: 'Thanksgiving' },
  { key: 'FAMILY', label: 'Family' },
  { key: 'FINANCE', label: 'Finance' },
  { key: 'HEALING', label: 'Healing' },
  { key: 'CUSTOM', label: 'Other' },
];

export function EngineScreen() {
  const runtime = useCoreRuntime();
  const [userId, setUserId] = useState<string | null>(null);
  const [framework, setFramework] = useState<PromptFramework>('LECTIO_DIVINA');
  const [category, setCategory] = useState<PrayerCategory>('ANXIETY');
  const [reference, setReference] = useState('Philippians 4:6-7');
  const [passageText, setPassageText] = useState(
    'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.',
  );
  const [stageIndex, setStageIndex] = useState(0);
  const [journal, setJournal] = useState('');
  const [finished, setFinished] = useState(false);
  /** Wall-clock seconds spent in the current run, captured on finish. */
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    void runtime.repositories.identity.getOrCreateCurrentUserId().then(setUserId);
  }, [runtime]);

  const prompt: PrayerPrompt = useMemo(
    () =>
      generatePrayerPrompt({
        framework,
        category,
        passageReference: reference.trim() === '' ? 'this passage' : reference.trim(),
        passageText,
        // Privacy guardrail (B6 / C1 §4.1): personal notes are never included unless opted in.
        includeUserNotes: false,
      }),
    [framework, category, reference, passageText],
  );

  const sections = prompt.sections;
  const atLastStage = stageIndex >= sections.length;

  const begin = useCallback((next: PromptFramework) => {
    setFramework(next);
    setStageIndex(0);
    setFinished(false);
    setJournal('');
    startedAt.current = Date.now();
  }, []);

  const restart = useCallback(() => {
    setStageIndex(0);
    setFinished(false);
    setJournal('');
    startedAt.current = Date.now();
  }, []);

  const finish = useCallback(async () => {
    if (userId === null) return;
    const elapsed =
      startedAt.current === null ? 0 : Math.max(0, Math.round((Date.now() - startedAt.current) / 1000));
    const note = journal.trim();
    await runtime.repositories.prayerEngine.logSession({
      userId,
      framework,
      durationSeconds: elapsed,
      ...(note === '' ? {} : { journal: note }),
    });
    setFinished(true);
  }, [userId, framework, journal, runtime]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Guided Prayer</Text>

      <ChipRow
        label="Engine"
        options={FRAMEWORKS.map((entry) => ({ key: entry.key, label: entry.label }))}
        active={framework}
        onSelect={begin}
      />
      <ChipRow
        label="Focus"
        options={CATEGORIES.map((entry) => ({ key: entry.key, label: entry.label }))}
        active={category}
        onSelect={setCategory}
      />

      <View style={styles.field}>
        <Text style={styles.sectionLabel}>Passage reference</Text>
        <TextInput
          value={reference}
          onChangeText={setReference}
          placeholder="e.g. Romans 8:28"
          placeholderTextColor={THEME.text.verseNum}
          style={styles.input}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.sectionLabel}>Passage text</Text>
        <TextInput
          value={passageText}
          onChangeText={setPassageText}
          multiline
          placeholder="Paste the verses you are praying through"
          placeholderTextColor={THEME.text.verseNum}
          style={[styles.input, styles.multiline]}
        />
      </View>

      {framework === 'BREATH' && (
        <View style={styles.breathWrap}>
          <BreathRing />
        </View>
      )}

      {!finished && !atLastStage && (
        <View style={styles.stageCard}>
          <Text style={styles.stageLabel}>{sections[stageIndex]?.stage ?? ''}</Text>
          <Text style={styles.stagePrompt}>{sections[stageIndex]?.prompt ?? ''}</Text>
          <Text style={styles.progress}>
            {`Step ${stageIndex + 1} of ${sections.length}`}
          </Text>
        </View>
      )}

      {!finished && (
        <View style={styles.actions}>
          <Pressable
            onPress={() => setStageIndex((value) => Math.max(0, value - 1))}
            disabled={stageIndex === 0}
            accessibilityRole="button"
            style={[styles.secondaryButton, stageIndex === 0 && styles.disabled]}
          >
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
          {!atLastStage ? (
            <Pressable
              onPress={() => setStageIndex((value) => value + 1)}
              accessibilityRole="button"
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </Pressable>
          ) : (
            <View style={styles.finishBlock}>
              <Text style={styles.sectionLabel}>Journal (optional, encrypted)</Text>
              <TextInput
                value={journal}
                onChangeText={setJournal}
                multiline
                placeholder="What did you notice or pray?"
                placeholderTextColor={THEME.text.verseNum}
                style={[styles.input, styles.multiline]}
              />
              <Pressable
                onPress={() => void finish()}
                accessibilityRole="button"
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Finish session</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {finished && (
        <View style={styles.stageCard}>
          <Text style={styles.stageLabel}>Session recorded</Text>
          <Text style={styles.muted}>
            Your session has been logged. There is no streak to lose here — simply return whenever
            you are ready.
          </Text>
          <Pressable onPress={restart} accessibilityRole="button" style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Pray again</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.offlineNote}>
        Prompts are generated offline from your device — nothing is sent anywhere.
      </Text>
    </ScrollView>
  );
}

interface ChipRowProps<T extends string> {
  readonly label: string;
  readonly options: readonly { key: T; label: string }[];
  readonly active: T;
  readonly onSelect: (key: T) => void;
}

function ChipRow<T extends string>({ label, options, active, onSelect }: ChipRowProps<T>) {
  return (
    <View style={styles.field}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((option) => {
          const selected = option.key === active;
          return (
            <Pressable
              key={option.key}
              onPress={() => onSelect(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.chip, selected && styles.chipActive]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: SPACING.lg,
    padding: SPACING.xl,
    paddingBottom: SPACING.xxxl,
    backgroundColor: THEME.bg.canvas,
  },
  title: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  field: { gap: SPACING.sm },
  sectionLabel: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiXs,
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
  input: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.primary,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  breathWrap: { height: 340 },
  stageCard: {
    gap: SPACING.md,
    padding: SPACING.xl,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
  },
  stageLabel: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiMd,
    color: THEME.accent.primary,
  },
  stagePrompt: {
    fontFamily: FONT_FAMILIES.scriptureSerif,
    fontSize: FONT_SIZES.scriptureDefault,
    lineHeight: FONT_SIZES.scriptureDefault * LINE_HEIGHTS.scripture,
    color: THEME.text.primary,
  },
  progress: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.verseNum,
  },
  actions: { gap: SPACING.lg },
  finishBlock: { gap: SPACING.md },
  muted: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    lineHeight: FONT_SIZES.uiSm * LINE_HEIGHTS.ui,
    color: THEME.text.secondary,
  },
  offlineNote: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.verseNum,
  },
  primaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.pill,
    backgroundColor: THEME.accent.primary,
  },
  primaryButtonText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.bg.canvas,
  },
  secondaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  secondaryButtonText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  disabled: { opacity: 0.4 },
});
