// FR-107 — Kind habits, reminders & ESV cache (mobile).
//
// The habit loop is deliberately gentle: there is no punitive streak-flame and no red "you lost
// your streak" screen. It shows a quiet count of recent days, a forgiving resume line when the
// user returns after a gap, and a simple "I read or prayed today" tap. The reminder schedule is
// device-local. The lower panel manages the ephemeral ESV cache (Crossway caps) — the ESV key
// itself lives in OS secure storage and is managed by the ESV passage client. Everything here
// reads through `HabitsRepository` / `EsvCacheRepository`; no SQL is written in this screen
// (AGENTS.md rule 1).

import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ESV_CACHE_MAX_VERSES, type HabitSummary, type ReminderSchedule } from '@breath-and-word/core';
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

const THEME = COLORS.daylight;

/** The user's local calendar day as `YYYY-MM-DD` (FR-107 day keys). */
function localDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function HabitsScreen() {
  const runtime = useCoreRuntime();
  const [schedule, setSchedule] = useState<ReminderSchedule | null>(null);
  const [summary, setSummary] = useState<HabitSummary | null>(null);
  const [cachedVerses, setCachedVerses] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { habits, esv } = runtime.repositories;
    const [nextSchedule, nextSummary, verses] = await Promise.all([
      habits.getReminderSchedule(),
      habits.getHabitSummary(localDayKey()),
      esv.totalVerseCount(),
    ]);
    setSchedule(nextSchedule);
    setSummary(nextSummary);
    setCachedVerses(verses);
  }, [runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleReminder = useCallback(
    async (enabled: boolean) => {
      const next = await runtime.repositories.habits.setReminderSchedule({ enabled });
      setSchedule(next);
    },
    [runtime],
  );

  const stepTime = useCallback(
    async (field: 'hour' | 'minute', delta: number) => {
      if (schedule === null) return;
      const value = field === 'hour' ? schedule.hour + delta : schedule.minute + delta;
      const wrapped = field === 'hour' ? (value + 24) % 24 : (value + 60) % 60;
      const next = await runtime.repositories.habits.setReminderSchedule({ [field]: wrapped });
      setSchedule(next);
    },
    [runtime, schedule],
  );

  const markToday = useCallback(async () => {
    setSummary(await runtime.repositories.habits.recordActiveDay(localDayKey()));
  }, [runtime]);

  const pruneCache = useCallback(async () => {
    const removed = await runtime.repositories.esv.pruneExpired();
    setNotice(
      removed === 0 ? 'No expired entries to clear.' : `Cleared ${removed} expired ${removed === 1 ? 'entry' : 'entries'}.`,
    );
    await refresh();
  }, [runtime, refresh]);

  const clearCache = useCallback(async () => {
    await runtime.repositories.esv.clear();
    setNotice('ESV cache cleared.');
    await refresh();
  }, [runtime, refresh]);

  const time = schedule === null ? '—:—' : `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Habits & Offline</Text>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Daily reminder</Text>
        <View style={styles.reminderRow}>
          <Switch
            value={schedule?.enabled ?? false}
            onValueChange={(value) => void toggleReminder(value)}
            trackColor={{ true: THEME.accent.primary, false: THEME.border.subtle }}
            thumbColor={THEME.bg.surface}
          />
          <Text accessibilityLiveRegion="polite" style={styles.time}>
            {time}
          </Text>
        </View>
        <View style={styles.stepperRow}>
          <Stepper label="Hour" onMinus={() => void stepTime('hour', -1)} onPlus={() => void stepTime('hour', 1)} />
          <Stepper label="Minute" onMinus={() => void stepTime('minute', -5)} onPlus={() => void stepTime('minute', 5)} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Your rhythm</Text>
        <Text style={styles.streak}>
          {summary === null
            ? '—'
            : summary.currentStreakDays === 0
              ? 'No days logged yet — no pressure, start when you like.'
              : `${summary.currentStreakDays} ${summary.currentStreakDays === 1 ? 'day' : 'days'} recently`}
        </Text>
        {summary?.resumeMessage !== null && summary?.resumeMessage !== undefined && (
          <Text style={styles.resume}>{summary.resumeMessage}</Text>
        )}
        <Pressable onPress={() => void markToday()} accessibilityRole="button" style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>I read or prayed today</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Offline ESV cache</Text>
        <Text style={styles.muted}>
          {cachedVerses === null
            ? 'Checking cache…'
            : `${cachedVerses} of ${ESV_CACHE_MAX_VERSES} cached verses. ESV passages are held only briefly and evicted oldest-first.`}
        </Text>
        {notice !== null && <Text style={styles.notice}>{notice}</Text>}
        <View style={styles.actions}>
          <Pressable onPress={() => void pruneCache()} accessibilityRole="button" style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Clear expired</Text>
          </Pressable>
          <Pressable onPress={() => void clearCache()} accessibilityRole="button" style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Clear all</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

interface StepperProps {
  readonly label: string;
  readonly onMinus: () => void;
  readonly onPlus: () => void;
}

function Stepper({ label, onMinus, onPlus }: StepperProps) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperButtons}>
        <Pressable onPress={onMinus} accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} style={styles.stepButton}>
          <Text style={styles.stepButtonText}>−</Text>
        </Pressable>
        <Pressable onPress={onPlus} accessibilityRole="button" accessibilityLabel={`Increase ${label}`} style={styles.stepButton}>
          <Text style={styles.stepButtonText}>+</Text>
        </Pressable>
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
  card: {
    gap: SPACING.md,
    padding: SPACING.xl,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
  },
  sectionLabel: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  time: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  stepperRow: { flexDirection: 'row', gap: SPACING.xl },
  stepper: { gap: SPACING.sm },
  stepperLabel: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  stepperButtons: { flexDirection: 'row', gap: SPACING.sm },
  stepButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  stepButtonText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiMd,
    color: THEME.text.primary,
  },
  streak: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiMd,
    lineHeight: FONT_SIZES.uiMd * LINE_HEIGHTS.ui,
    color: THEME.text.primary,
  },
  resume: {
    fontFamily: FONT_FAMILIES.scriptureSerif,
    fontSize: FONT_SIZES.uiMd,
    lineHeight: FONT_SIZES.uiMd * LINE_HEIGHTS.scripture,
    color: THEME.text.secondary,
  },
  muted: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    lineHeight: FONT_SIZES.uiSm * LINE_HEIGHTS.ui,
    color: THEME.text.secondary,
  },
  notice: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.accent.primary,
  },
  actions: { flexDirection: 'row', gap: SPACING.sm },
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
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  secondaryButtonText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
});
