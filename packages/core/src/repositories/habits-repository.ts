// FR-107 — Kind habits & reminders (A2 §4.1, D1 §4.1 "zero neon gamification").
//
// The reading/prayer habit loop must feel like a quiet, forgiving rhythm — never a punitive
// streak-flame or a red "you lost your streak" loss screen. This repository owns the two
// device-local pieces of FR-107 that are not platform notifications:
//   * the user's reminder schedule (a daily time + on/off), and
//   * a non-punitive habit/streak state whose surfaced copy is always gentle.
//
// Both live in `local_device.sqlite` (`workspace_state`, B4 §4.4) — they are device-local and
// NEVER synced, so `local_device` hard deletes apply. Scheduling the actual OS notification is
// a platform concern the app layers on top of `getReminderSchedule()`.
//
// Per AGENTS.md rule 1 this is the ONLY place the habit/reminder `workspace_state` SQL may live.

import type { LocalDeviceAdapter } from '../adapters';

/** `workspace_state` key holding the daily reminder schedule (FR-107). */
export const REMINDER_SCHEDULE_KEY = 'reminder_schedule';

/** `workspace_state` key holding the non-punitive habit/streak state (FR-107). */
export const HABIT_STATE_KEY = 'habit_state';

/** Default reminder: off, set to a gentle morning hour (FR-107). */
export const DEFAULT_REMINDER_SCHEDULE: ReminderSchedule = { enabled: false, hour: 8, minute: 0 };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A day key in `YYYY-MM-DD` form (the app passes its own local calendar day). */
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** FR-107 — the user's local daily reminder notification schedule. */
export interface ReminderSchedule {
  readonly enabled: boolean;
  /** 0..23 (clamped on write). */
  readonly hour: number;
  /** 0..59 (clamped on write). */
  readonly minute: number;
}

/** FR-107 — non-punitive habit state as persisted in `workspace_state`. */
export interface HabitState {
  /** Most recent day the user was active (`YYYY-MM-DD`), or `null` before the first day. */
  readonly lastActiveDay: string | null;
  /** Consecutive active days ending on `lastActiveDay` (never a shaming "lost" value). */
  readonly currentStreakDays: number;
}

/** FR-107 — habit state plus the gentle, non-punitive copy the UI shows on return. */
export interface HabitSummary extends HabitState {
  /** Whole days since the last active day (`null` before the first day); never negative. */
  readonly daysSinceLastActive: number | null;
  /** `true` when the user is returning after a gap of two or more days. */
  readonly isResuming: boolean;
  /** Gentle, forgiving resume copy, or `null` when no resume is needed. */
  readonly resumeMessage: string | null;
}

export interface HabitsRepositoryOptions {
  readonly localDevice: LocalDeviceAdapter;
  /** Injectable clock (tests); defaults to `Date.now`. Used only for `updated_at`. */
  readonly now?: () => number;
}

const EMPTY_HABIT_STATE: HabitState = { lastActiveDay: null, currentStreakDays: 0 };

/**
 * FR-107 — owns the device-local reminder schedule and the kind habit loop. Every returned
 * message is calm and non-punitive; a missed day is a normal rhythm, never a loss.
 */
export class HabitsRepository {
  private readonly localDevice: LocalDeviceAdapter;
  private readonly now: () => number;

  constructor(options: HabitsRepositoryOptions) {
    this.localDevice = options.localDevice;
    this.now = options.now ?? Date.now;
  }

  /** The stored reminder schedule, or the gentle default when none has been set (FR-107). */
  async getReminderSchedule(): Promise<ReminderSchedule> {
    const stored = await this.readState<Partial<ReminderSchedule>>(REMINDER_SCHEDULE_KEY);
    if (stored === null) {
      return DEFAULT_REMINDER_SCHEDULE;
    }
    return normalizeReminderSchedule(stored);
  }

  /** Persist a reminder schedule, clamping out-of-range times (FR-107). */
  async setReminderSchedule(schedule: Partial<ReminderSchedule>): Promise<ReminderSchedule> {
    const normalized = normalizeReminderSchedule(schedule);
    await this.writeState(REMINDER_SCHEDULE_KEY, normalized);
    return normalized;
  }

  /**
   * Record that the user was active on `day` and return the refreshed habit summary. A same-day
   * repeat is a no-op; a consecutive day extends the streak; any longer gap starts a fresh,
   * kindly-counted day — the presence of a gap is never surfaced as a setback.
   */
  async recordActiveDay(day: string): Promise<HabitSummary> {
    const normalizedDay = normalizeDay(day);
    const state = await this.readState<HabitState>(HABIT_STATE_KEY);
    const next = advanceStreak(state === null ? EMPTY_HABIT_STATE : state, normalizedDay);
    await this.writeState(HABIT_STATE_KEY, next);
    return summarize(next, normalizedDay);
  }

  /** The habit summary as of `day`, without recording activity (FR-107). */
  async getHabitSummary(day: string): Promise<HabitSummary> {
    const normalizedDay = normalizeDay(day);
    const state = await this.readState<HabitState>(HABIT_STATE_KEY);
    return summarize(state === null ? EMPTY_HABIT_STATE : state, normalizedDay);
  }

  private async readState<T extends object>(key: string): Promise<T | null> {
    const { rows } = await this.localDevice.query<{ value_json: string }>(
      'SELECT value_json FROM workspace_state WHERE key = ?',
      [key],
    );
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(row.value_json);
      return parsed !== null && typeof parsed === 'object' ? (parsed as T) : null;
    } catch {
      return null;
    }
  }

  private async writeState(key: string, value: object): Promise<void> {
    await this.localDevice.execute(
      `INSERT INTO workspace_state (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), new Date(this.now()).toISOString()],
    );
  }
}

/** Clamp a partial reminder schedule into a valid one (FR-107). */
export function normalizeReminderSchedule(schedule: Partial<ReminderSchedule>): ReminderSchedule {
  return {
    enabled: schedule.enabled === true,
    hour: clampInteger(schedule.hour, 0, 23, DEFAULT_REMINDER_SCHEDULE.hour),
    minute: clampInteger(schedule.minute, 0, 59, DEFAULT_REMINDER_SCHEDULE.minute),
  };
}

/** Normalise any day input to a `YYYY-MM-DD` key, tolerating a full ISO timestamp. */
export function normalizeDay(day: string): string {
  const candidate = day.slice(0, 10);
  return DAY_PATTERN.test(candidate) ? candidate : day;
}

/**
 * Gentle, non-punitive copy shown when the user returns after `daysSinceLastActive` days.
 * It never scolds, never shows a "lost streak", and always invites a fresh start (FR-107).
 */
export function gentleResumeMessage(daysSinceLastActive: number): string {
  const dayWord = daysSinceLastActive === 1 ? 'day' : 'days';
  return `It's been ${daysSinceLastActive} ${dayWord} — welcome back. There's nothing to make up for; simply begin again whenever you're ready.`;
}

/** Compute the next habit state after activity on `day` (non-punitive streak, FR-107). */
function advanceStreak(state: HabitState, day: string): HabitState {
  const last = state.lastActiveDay;
  if (last === null) {
    return { lastActiveDay: day, currentStreakDays: 1 };
  }
  // Same day, or out-of-order/clock-skewed input: keep the later record unchanged.
  if (last === day || day <= last) {
    return state;
  }
  if (dayDiff(day, last) === 1) {
    return { lastActiveDay: day, currentStreakDays: state.currentStreakDays + 1 };
  }
  // A gap of two or more days starts a fresh day — counted kindly, never as a loss.
  return { lastActiveDay: day, currentStreakDays: 1 };
}

/** Project a habit state onto the gentle summary the UI renders (FR-107). */
function summarize(state: HabitState, day: string): HabitSummary {
  if (state.lastActiveDay === null) {
    return {
      lastActiveDay: null,
      currentStreakDays: 0,
      daysSinceLastActive: null,
      isResuming: false,
      resumeMessage: null,
    };
  }
  const daysSinceLastActive = Math.max(0, dayDiff(day, state.lastActiveDay));
  const isResuming = daysSinceLastActive >= 2;
  return {
    lastActiveDay: state.lastActiveDay,
    currentStreakDays: state.currentStreakDays,
    daysSinceLastActive,
    isResuming,
    resumeMessage: isResuming ? gentleResumeMessage(daysSinceLastActive) : null,
  };
}

/** Whole-day difference `day - from` (both `YYYY-MM-DD`); always finite. */
function dayDiff(day: string, from: string): number {
  const a = Date.parse(`${day}T00:00:00Z`);
  const b = Date.parse(`${from}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return 0;
  }
  return Math.round((a - b) / MS_PER_DAY);
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.trunc(value);
  return Math.min(max, Math.max(min, rounded));
}
