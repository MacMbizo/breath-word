// D1 §4.2 — device-local appearance preferences (`workspace_state`, never synced).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  APPEARANCE_KEY,
  AppearanceRepository,
  DEFAULT_APPEARANCE,
  normalizeAppearance,
} from '../src/repositories/appearance-repository';
import { createAppearanceStore } from '../src/stores/appearance-store';

import { NodeLocalDeviceAdapter } from './helpers/node-local-device';

let localDevice: NodeLocalDeviceAdapter;
let repo: AppearanceRepository;

beforeEach(() => {
  localDevice = new NodeLocalDeviceAdapter();
  repo = new AppearanceRepository({ localDevice, now: () => Date.parse('2026-11-28T08:00:00Z') });
});

afterEach(() => {
  localDevice.close();
});

describe('AppearanceRepository', () => {
  it('returns the defaults on a fresh device', async () => {
    expect(await repo.get()).toEqual(DEFAULT_APPEARANCE);
  });

  it('merges patches and round-trips them', async () => {
    await repo.update({ theme: 'lamplight', wordView: 'interlinear' });
    const next = await repo.update({ studyPanelOpen: false });
    expect(next).toEqual({ ...DEFAULT_APPEARANCE, theme: 'lamplight', wordView: 'interlinear', studyPanelOpen: false });
    expect(await repo.get()).toEqual(next);
  });

  it('survives a corrupt stored row', async () => {
    await localDevice.execute(
      "INSERT INTO workspace_state (key, value_json, updated_at) VALUES (?, '{not json', 'x')",
      [APPEARANCE_KEY],
    );
    expect(await repo.get()).toEqual(DEFAULT_APPEARANCE);
  });
});

describe('normalizeAppearance', () => {
  it('drops invalid fields back to their defaults', () => {
    expect(
      normalizeAppearance({ theme: 7, wordView: 'popup', scriptureSize: 400, leftPanelOpen: 'yes', followSystemDark: false }),
    ).toEqual({ ...DEFAULT_APPEARANCE, followSystemDark: false });
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
  });

  it('keeps an unknown theme string for the app to validate', () => {
    expect(normalizeAppearance({ theme: 'daylight' }).theme).toBe('daylight');
  });
});

describe('appearance store', () => {
  it('applies a change immediately and persists it', async () => {
    const store = createAppearanceStore(repo);
    await store.getState().load();
    const pending = store.getState().update({ theme: 'selah' });
    expect(store.getState().prefs.theme).toBe('selah');
    await pending;
    expect((await repo.get()).theme).toBe('selah');
  });

  it('lands the last of several quick changes', async () => {
    const store = createAppearanceStore(repo);
    void store.getState().update({ leftPanelOpen: false });
    void store.getState().update({ leftPanelOpen: true });
    await store.getState().update({ leftPanelOpen: false });
    expect((await repo.get()).leftPanelOpen).toBe(false);
  });
});

describe('last passage', () => {
  it('round-trips a valid passage and rejects malformed ones', async () => {
    const passage = { packId: 'trans_kjv', translationCode: 'KJV', bookNumber: 43, chapter: 3 };
    expect((await repo.update({ lastPassage: passage })).lastPassage).toEqual(passage);
    expect(normalizeAppearance({ lastPassage: { ...passage, packId: 'DROP TABLE' } }).lastPassage).toBeNull();
    expect(normalizeAppearance({ lastPassage: { ...passage, bookNumber: 67 } }).lastPassage).toBeNull();
  });
});
