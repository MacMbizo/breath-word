// D1 §4.2 / FR-101 — device-local appearance preferences (theme, word view, text size, panels).
//
// These are a reader's comfort settings for THIS device (a phone may read in Lamplight while the
// desktop stays in Parchment), so they live in `local_device.sqlite` (`workspace_state`, B4 §4.4)
// and are never synced. Per AGENTS.md rule 1 this is the ONLY place this `workspace_state` SQL lives.
//
// The theme is stored as a plain string: `packages/core` does not know the token palette. Apps
// validate it with the tokens' `isThemeName` and fall back to their default when it is unknown
// (an older install may hold a retired theme name such as `daylight`).

import type { LocalDeviceAdapter } from '../adapters';

/** `workspace_state` key holding the appearance preferences. */
export const APPEARANCE_KEY = 'appearance';

/** FR-301 — what tapping an aligned English word opens. */
export type WordView = 'card' | 'interlinear';

export interface AppearancePreferences {
  /** Chosen theme name, or `null` for the app's default. */
  readonly theme: string | null;
  /** Switch to the dark theme while the device is in dark mode. */
  readonly followSystemDark: boolean;
  readonly wordView: WordView;
  /** Scripture font size in points/px (clamped to the token range by the app). */
  readonly scriptureSize: number | null;
  /** Desktop: the left navigation/passage panel is expanded. */
  readonly leftPanelOpen: boolean;
  /** Desktop: the floating study card is expanded. */
  readonly studyPanelOpen: boolean;
}

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  theme: null,
  followSystemDark: true,
  wordView: 'card',
  scriptureSize: null,
  leftPanelOpen: true,
  studyPanelOpen: true,
};

/** Coerce anything read from storage (or passed by a caller) into valid preferences. */
export function normalizeAppearance(raw: unknown): AppearancePreferences {
  const value = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const bool = (key: keyof AppearancePreferences): boolean =>
    typeof value[key] === 'boolean' ? (value[key] as boolean) : (DEFAULT_APPEARANCE[key] as boolean);
  const size = value.scriptureSize;
  return {
    theme: typeof value.theme === 'string' && value.theme.length > 0 && value.theme.length <= 32 ? value.theme : null,
    followSystemDark: bool('followSystemDark'),
    wordView: value.wordView === 'interlinear' ? 'interlinear' : 'card',
    scriptureSize: typeof size === 'number' && Number.isFinite(size) && size >= 8 && size <= 64 ? size : null,
    leftPanelOpen: bool('leftPanelOpen'),
    studyPanelOpen: bool('studyPanelOpen'),
  };
}

export interface AppearanceRepositoryOptions {
  readonly localDevice: LocalDeviceAdapter;
  readonly now?: () => number;
}

export class AppearanceRepository {
  private readonly localDevice: LocalDeviceAdapter;
  private readonly now: () => number;

  constructor(options: AppearanceRepositoryOptions) {
    this.localDevice = options.localDevice;
    this.now = options.now ?? Date.now;
  }

  async get(): Promise<AppearancePreferences> {
    const { rows } = await this.localDevice.query<{ value_json: string }>(
      'SELECT value_json FROM workspace_state WHERE key = ?',
      [APPEARANCE_KEY],
    );
    const row = rows[0];
    if (row === undefined) return DEFAULT_APPEARANCE;
    try {
      return normalizeAppearance(JSON.parse(row.value_json));
    } catch {
      return DEFAULT_APPEARANCE;
    }
  }

  /** Merge `patch` into the stored preferences and return the result. */
  async update(patch: Partial<AppearancePreferences>): Promise<AppearancePreferences> {
    const next = normalizeAppearance({ ...(await this.get()), ...patch });
    await this.localDevice.execute(
      `INSERT INTO workspace_state (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      [APPEARANCE_KEY, JSON.stringify(next), new Date(this.now()).toISOString()],
    );
    return next;
  }
}
