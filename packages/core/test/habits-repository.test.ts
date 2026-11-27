// FR-107 — Kind habits & reminders (A2 §4.1): a non-punitive habit loop whose surfaced copy is
// always gentle, plus a device-local daily reminder schedule. Both live in `local_device.sqlite`
// (`workspace_state`, B4 §4.4) and never sync.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_REMINDER_SCHEDULE,
  HabitsRepository,
  HABIT_STATE_KEY,
  REMINDER_SCHEDULE_KEY,
  gentleResumeMessage,
  normalizeDay,
  normalizeReminderSchedule,
} from '../src/repositories/habits-repository';

import { NodeLocalDeviceAdapter } from './helpers/node-local-device';

const FIXED_NOW = Date.parse('2026-11-27T09:00:00Z');

let localDevice: NodeLocalDeviceAdapter;
let repo: HabitsRepository;

beforeEach(() => {
  localDevice = new NodeLocalDeviceAdapter();
  repo = new HabitsRepository({ localDevice, now: () => FIXED_NOW });
});

afterEach(() => {
  localDevice.close();
});

describe('HabitsRepository reminder schedule (FR-107)', () => {
  it('defaults to a gentle, disabled morning reminder', async () => {
    expect(await repo.getReminderSchedule()).toEqual(DEFAULT_REMINDER_SCHEDULE);
  });

  it('round-trips a schedule and clamps out-of-range times', async () => {
    await repo.setReminderSchedule({ enabled: true, hour: 30, minute: -5 });
    expect(await repo.getReminderSchedule()).toEqual({ enabled: true, hour: 23, minute: 0 });

    await repo.setReminderSchedule({ enabled: true, hour: 6, minute: 45 });
    expect(await repo.getReminderSchedule()).toEqual({ enabled: true, hour: 6, minute: 45 });
  });

  it('stores the schedule under the workspace_state key and never throws on garbage', async () => {
    await repo.setReminderSchedule({ enabled: true, hour: 7, minute: 15 });
    const { rows } = await localDevice.query<{ value_json: string }>(
      'SELECT value_json FROM workspace_state WHERE key = ?',
      [REMINDER_SCHEDULE_KEY],
    );
    expect(JSON.parse(rows[0]!.value_json)).toEqual({ enabled: true, hour: 7, minute: 15 });

    await localDevice.execute('UPDATE workspace_state SET value_json = ? WHERE key = ?', [
      'not-json',
      REMINDER_SCHEDULE_KEY,
    ]);
    expect(await repo.getReminderSchedule()).toEqual(DEFAULT_REMINDER_SCHEDULE);
  });
});

describe('HabitsRepository non-punitive streak (FR-107)', () => {
  it('starts at a kind day 1 and extends on consecutive days', async () => {
    const first = await repo.recordActiveDay('2026-11-25');
    expect(first.currentStreakDays).toBe(1);
    expect(first.lastActiveDay).toBe('2026-11-25');

    const second = await repo.recordActiveDay('2026-11-26');
    expect(second.currentStreakDays).toBe(2);

    const third = await repo.recordActiveDay('2026-11-27');
    expect(third.currentStreakDays).toBe(3);
    expect(third.isResuming).toBe(false);
    expect(third.resumeMessage).toBeNull();
  });

  it('treats a same-day repeat as a no-op', async () => {
    await repo.recordActiveDay('2026-11-25');
    await repo.recordActiveDay('2026-11-25');
    const summary = await repo.getHabitSummary('2026-11-25');
    expect(summary.currentStreakDays).toBe(1);
  });

  it('restarts kindly after a missed day without punitive copy', async () => {
    await repo.recordActiveDay('2026-11-20');
    await repo.recordActiveDay('2026-11-21');

    // Three days away, then returns.
    const resumed = await repo.recordActiveDay('2026-11-25');
    expect(resumed.currentStreakDays).toBe(1); // fresh, kindly-counted day
    expect(resumed.lastActiveDay).toBe('2026-11-25');
    expect(resumed.daysSinceLastActive).toBe(0);
  });

  it('surfaces gentle resume copy only after a gap of two or more days', async () => {
    await repo.recordActiveDay('2026-11-20');

    const nextDay = await repo.getHabitSummary('2026-11-21');
    expect(nextDay.isResuming).toBe(false);
    expect(nextDay.resumeMessage).toBeNull();

    const afterGap = await repo.getHabitSummary('2026-11-23');
    expect(afterGap.isResuming).toBe(true);
    expect(afterGap.daysSinceLastActive).toBe(3);
    expect(afterGap.resumeMessage).toBe(gentleResumeMessage(3));
    expect(afterGap.resumeMessage).not.toMatch(/lost|streak|fail|miss/i);
  });

  it('reports an empty summary before the first active day', async () => {
    const summary = await repo.getHabitSummary('2026-11-27');
    expect(summary).toEqual({
      lastActiveDay: null,
      currentStreakDays: 0,
      daysSinceLastActive: null,
      isResuming: false,
      resumeMessage: null,
    });
  });

  it('tolerates an out-of-order (clock-skewed) day by keeping the later record', async () => {
    await repo.recordActiveDay('2026-11-26');
    const skewed = await repo.recordActiveDay('2026-11-24');
    expect(skewed.lastActiveDay).toBe('2026-11-26');
    expect(skewed.currentStreakDays).toBe(1);
  });

  it('persists habit state under the workspace_state key', async () => {
    await repo.recordActiveDay('2026-11-25');
    const { rows } = await localDevice.query<{ value_json: string }>(
      'SELECT value_json FROM workspace_state WHERE key = ?',
      [HABIT_STATE_KEY],
    );
    expect(JSON.parse(rows[0]!.value_json)).toEqual({
      lastActiveDay: '2026-11-25',
      currentStreakDays: 1,
    });
  });
});

describe('FR-107 helpers', () => {
  it('normalizes a full ISO timestamp to its day key', () => {
    expect(normalizeDay('2026-11-27T09:00:00Z')).toBe('2026-11-27');
    expect(normalizeDay('2026-11-27')).toBe('2026-11-27');
  });

  it('clamps a partial schedule', () => {
    expect(normalizeReminderSchedule({})).toEqual(DEFAULT_REMINDER_SCHEDULE);
    expect(normalizeReminderSchedule({ enabled: true, hour: 99, minute: 99 })).toEqual({
      enabled: true,
      hour: 23,
      minute: 59,
    });
  });

  it('never uses punitive language in resume copy', () => {
    expect(gentleResumeMessage(2)).toContain('welcome back');
    expect(gentleResumeMessage(2)).not.toMatch(/lost|broke|streak|fail/i);
  });
});
