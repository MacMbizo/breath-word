// FR-107 — Kind habits, reminders & ESV cache (desktop).
//
// Mirrors the mobile `HabitsScreen`. The habit loop is deliberately gentle: no punitive streak-flame
// and no red "you lost your streak" screen — a quiet count of recent days, a forgiving resume line
// when the user returns after a gap, and a simple "I read or prayed today" tap. The reminder
// schedule is device-local. The lower panel manages the ephemeral ESV cache (Crossway caps); the ESV
// key itself lives in OS secure storage and is managed by the ESV passage client. Everything here
// reads through `HabitsRepository` / `EsvCacheRepository`; no SQL is written in this view
// (AGENTS.md rule 1).
import { useCallback, useEffect, useState } from 'react';

import { ESV_CACHE_MAX_VERSES, type HabitSummary, type ReminderSchedule } from '@breath-and-word/core';

import { useCoreRuntime } from './CoreRuntime';

/** The user's local calendar day as `YYYY-MM-DD` (FR-107 day keys). */
function localDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const SECTION_LABEL = 'font-ui text-uiXs text-ink-secondary';
const PRIMARY =
  'self-start rounded-pill bg-accent px-xl py-sm font-ui text-uiSm font-medium text-canvas transition hover:opacity-90';
const OUTLINE =
  'rounded-pill border border-hairline px-lg py-sm font-ui text-uiSm text-ink-secondary transition hover:text-ink-primary';
const CARD = 'flex flex-col gap-md rounded-lg border border-hairline bg-surface p-xl';

export function HabitsView() {
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
      setSchedule(await runtime.repositories.habits.setReminderSchedule({ enabled }));
    },
    [runtime],
  );

  const stepTime = useCallback(
    async (field: 'hour' | 'minute', delta: number) => {
      if (schedule === null) return;
      const value = field === 'hour' ? schedule.hour + delta : schedule.minute + delta;
      const wrapped = field === 'hour' ? (value + 24) % 24 : (value + 60) % 60;
      setSchedule(await runtime.repositories.habits.setReminderSchedule({ [field]: wrapped }));
    },
    [runtime, schedule],
  );

  const markToday = useCallback(async () => {
    setSummary(await runtime.repositories.habits.recordActiveDay(localDayKey()));
  }, [runtime]);

  const pruneCache = useCallback(async () => {
    const removed = await runtime.repositories.esv.pruneExpired();
    setNotice(
      removed === 0
        ? 'No expired entries to clear.'
        : `Cleared ${removed} expired ${removed === 1 ? 'entry' : 'entries'}.`,
    );
    await refresh();
  }, [runtime, refresh]);

  const clearCache = useCallback(async () => {
    await runtime.repositories.esv.clear();
    setNotice('ESV cache cleared.');
    await refresh();
  }, [runtime, refresh]);

  const time =
    schedule === null
      ? '—:—'
      : `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`;

  return (
    <section className="flex h-full flex-col gap-lg overflow-y-auto">
      <h2 className="font-ui text-uiLg text-ink-primary">Habits &amp; Offline</h2>

      <div className={CARD}>
        <span className={SECTION_LABEL}>Daily reminder</span>
        <div className="flex items-center gap-lg">
          <label className="flex items-center gap-sm">
            <input
              type="checkbox"
              checked={schedule?.enabled ?? false}
              onChange={(e) => void toggleReminder(e.target.checked)}
            />
            <span className="font-ui text-uiSm text-ink-primary">
              {schedule?.enabled === true ? 'On' : 'Off'}
            </span>
          </label>
          <span aria-live="polite" className="font-ui text-uiLg text-ink-primary">
            {time}
          </span>
        </div>
        <div className="flex gap-xl">
          <Stepper label="Hour" onMinus={() => void stepTime('hour', -1)} onPlus={() => void stepTime('hour', 1)} />
          <Stepper label="Minute" onMinus={() => void stepTime('minute', -5)} onPlus={() => void stepTime('minute', 5)} />
        </div>
      </div>

      <div className={CARD}>
        <span className={SECTION_LABEL}>Your rhythm</span>
        <p className="font-ui text-uiMd text-ink-primary">
          {summary === null
            ? '—'
            : summary.currentStreakDays === 0
              ? 'No days logged yet — no pressure, start when you like.'
              : `${summary.currentStreakDays} ${summary.currentStreakDays === 1 ? 'day' : 'days'} recently`}
        </p>
        {summary?.resumeMessage !== null && summary?.resumeMessage !== undefined && (
          <p className="font-scripture text-uiMd text-ink-secondary" style={{ lineHeight: 1.72 }}>
            {summary.resumeMessage}
          </p>
        )}
        <button type="button" onClick={() => void markToday()} className={PRIMARY}>
          I read or prayed today
        </button>
      </div>

      <div className={CARD}>
        <span className={SECTION_LABEL}>Offline ESV cache</span>
        <p className="font-ui text-uiSm text-ink-secondary">
          {cachedVerses === null
            ? 'Checking cache…'
            : `${cachedVerses} of ${ESV_CACHE_MAX_VERSES} cached verses. ESV passages are held only briefly and evicted oldest-first.`}
        </p>
        {notice !== null && <p className="font-ui text-uiSm text-accent">{notice}</p>}
        <div className="flex gap-sm">
          <button type="button" onClick={() => void pruneCache()} className={OUTLINE}>
            Clear expired
          </button>
          <button type="button" onClick={() => void clearCache()} className={OUTLINE}>
            Clear all
          </button>
        </div>
      </div>
    </section>
  );
}

interface StepperProps {
  readonly label: string;
  readonly onMinus: () => void;
  readonly onPlus: () => void;
}

function Stepper({ label, onMinus, onPlus }: StepperProps) {
  return (
    <div className="flex flex-col gap-sm">
      <span className={SECTION_LABEL}>{label}</span>
      <div className="flex gap-sm">
        <button type="button" onClick={onMinus} aria-label={`Decrease ${label}`} className={OUTLINE}>
          −
        </button>
        <button type="button" onClick={onPlus} aria-label={`Increase ${label}`} className={OUTLINE}>
          +
        </button>
      </div>
    </div>
  );
}
