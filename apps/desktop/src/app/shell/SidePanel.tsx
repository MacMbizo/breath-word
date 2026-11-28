// The desktop side panel (design round 2026-11-28, from "Vellum"): the "Breath & Word" wordmark,
// grouped navigation, the passage controls (translation · compare · focus) and the theme picker.
// Collapsible to an icon rail; the state persists in the device-local appearance store.
import { COLORS, THEME_LABELS, THEME_NAMES } from '@breath-and-word/tokens';

import { useCoreRuntime } from '../CoreRuntime';
import { useCoreStoreSelector } from '../useCoreStore';

import { Icon, type IconName } from './Icon';
import type { DesktopTheme } from './useDesktopTheme';

export type Tab =
  | 'read'
  | 'search'
  | 'compare'
  | 'library'
  | 'breathe'
  | 'pools'
  | 'deck'
  | 'pray'
  | 'vault'
  | 'habits'
  | 'account';

interface NavGroup {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly items: readonly { readonly tab: Tab; readonly label: string }[];
}

const GROUPS: readonly NavGroup[] = [
  {
    id: 'read',
    label: 'Read',
    icon: 'read',
    items: [
      { tab: 'read', label: 'Read' },
      { tab: 'compare', label: 'Compare' },
      { tab: 'search', label: 'Search' },
    ],
  },
  {
    id: 'pray',
    label: 'Pray',
    icon: 'pray',
    items: [
      { tab: 'breathe', label: 'Breath prayer' },
      { tab: 'deck', label: 'Prayer session' },
      { tab: 'pray', label: 'Guided prayer' },
      { tab: 'pools', label: 'Prayer pools' },
    ],
  },
  {
    id: 'journal',
    label: 'Journal',
    icon: 'journal',
    items: [
      { tab: 'habits', label: 'Rhythms & reminders' },
      { tab: 'vault', label: 'Private vault' },
    ],
  },
  {
    id: 'library',
    label: 'Library',
    icon: 'library',
    items: [
      { tab: 'library', label: 'Library' },
      { tab: 'account', label: 'Account & sync' },
    ],
  },
];

const ROW = 'flex h-9 w-full items-center gap-md rounded-pill px-md text-left font-ui text-uiSm transition';
const ROW_IDLE = 'text-ink-secondary hover:bg-sunken hover:text-ink-primary';
const ROW_ACTIVE = 'bg-sunken font-semibold text-accent';
const RAIL_BUTTON = 'flex h-11 w-12 items-center justify-center rounded-pill transition';
const SECTION = 'px-md font-ui text-uiXs font-semibold uppercase tracking-[0.14em] text-ink-secondary';

export interface SidePanelProps {
  readonly tab: Tab;
  readonly onSelect: (tab: Tab) => void;
  readonly onFocus: () => void;
  readonly theme: DesktopTheme;
}

export function SidePanel({ tab, onSelect, onFocus, theme }: SidePanelProps) {
  const { stores } = useCoreRuntime();
  const translations = useCoreStoreSelector(stores.reader, (state) => state.translations);
  const location = useCoreStoreSelector(stores.reader, (state) => state.location);
  const open = theme.prefs.leftPanelOpen;
  const activeGroup = GROUPS.find((group) => group.items.some((item) => item.tab === tab)) ?? GROUPS[0]!;
  const translationKey = location === null ? '' : `${location.packId}|${location.translationCode}`;

  function selectTranslation(key: string) {
    const target = translations.find((t) => `${t.packId}|${t.translationCode}` === key);
    if (target === undefined || location === null) return;
    const next = { ...location, packId: target.packId, translationCode: target.translationCode };
    void stores.reader.getState().openChapter(next);
    void stores.reader.getState().loadBooks(next.packId, next.translationCode);
  }

  if (!open) {
    return (
      <nav aria-label="Main" className="flex w-[76px] shrink-0 flex-col items-center gap-xs border-r border-hairline py-lg">
        <button
          type="button"
          onClick={() => theme.update({ leftPanelOpen: true })}
          aria-label="Expand side panel"
          aria-expanded={false}
          className={`${RAIL_BUTTON} text-ink-secondary hover:text-ink-primary`}
        >
          <Icon name="panelLeftOpen" />
        </button>
        <span aria-hidden="true" className="mb-md mt-xs font-display text-[22px] font-semibold text-ink-primary">
          B<span className="text-accent-rubric">&amp;</span>W
        </span>
        {GROUPS.map((group) => {
          const active = group.id === activeGroup.id;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onSelect(group.items[0]!.tab)}
              aria-label={group.label}
              aria-current={active ? 'page' : undefined}
              title={group.label}
              className={`${RAIL_BUTTON} ${active ? 'bg-sunken text-accent' : 'text-ink-secondary hover:text-ink-primary'}`}
            >
              <Icon name={group.icon} />
            </button>
          );
        })}
        {tab === 'read' && (
          <>
            <div aria-hidden="true" className="my-md h-px w-7 bg-hairline" />
            <span
              className="flex h-9 w-12 items-center justify-center rounded-pill border border-hairline font-ui text-[11px] font-semibold tracking-wide text-ink-primary"
              title="Translation"
            >
              {location?.translationCode ?? '—'}
            </span>
            <button type="button" onClick={() => onSelect('compare')} aria-label="Compare translations" title="Compare" className={`${RAIL_BUTTON} text-ink-secondary hover:text-ink-primary`}>
              <Icon name="compare" size={18} />
            </button>
            <button type="button" onClick={onFocus} aria-label="Focus mode" title="Focus mode" className={`${RAIL_BUTTON} text-ink-secondary hover:text-ink-primary`}>
              <Icon name="focus" size={18} />
            </button>
          </>
        )}
      </nav>
    );
  }

  return (
    <nav aria-label="Main" className="flex w-[248px] shrink-0 flex-col gap-lg overflow-y-auto border-r border-hairline px-md py-lg">
      <div className="flex items-center justify-between gap-xs pl-sm">
        <span className="whitespace-nowrap font-display text-[25px] font-semibold leading-tight text-ink-primary">
          Breath <span className="text-accent-rubric">&amp;</span> Word
        </span>
        <button
          type="button"
          onClick={() => theme.update({ leftPanelOpen: false })}
          aria-label="Collapse side panel"
          aria-expanded
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-ink-secondary transition hover:bg-sunken hover:text-ink-primary"
        >
          <Icon name="panelLeftClose" />
        </button>
      </div>

      <div className="flex flex-col gap-md">
        {GROUPS.map((group) => (
          <div key={group.id} className="flex flex-col gap-[2px]">
            <span className={`${SECTION} mb-xxs`}>{group.label}</span>
            {group.items.map((item) => {
              const active = item.tab === tab;
              return (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => onSelect(item.tab)}
                  aria-current={active ? 'page' : undefined}
                  className={`${ROW} ${active ? ROW_ACTIVE : ROW_IDLE}`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {tab === 'read' && (
        <div className="flex flex-col gap-sm border-t border-hairline pt-lg">
          <span className={SECTION}>This passage</span>
          <label className="flex flex-col gap-xxs px-md font-ui text-uiXs text-ink-secondary">
            Translation
            <select
              value={translationKey}
              onChange={(event) => selectTranslation(event.target.value)}
              className="h-10 rounded-md border border-hairline bg-surface px-sm font-ui text-uiSm text-ink-primary outline-none focus:border-accent"
            >
              {translations.length === 0 && <option value="">No Bible installed</option>}
              {translations.map((t) => (
                <option key={`${t.packId}|${t.translationCode}`} value={`${t.packId}|${t.translationCode}`}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => onSelect('compare')} className={`${ROW} ${ROW_IDLE}`}>
            <Icon name="compare" size={18} />
            Compare with…
          </button>
          <button type="button" onClick={onFocus} className={`${ROW} ${ROW_IDLE}`}>
            <Icon name="focus" size={18} />
            Focus mode
          </button>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-sm border-t border-hairline pt-lg">
        <span className={SECTION}>Theme</span>
        <div className="grid grid-cols-3 gap-xs px-xs" role="radiogroup" aria-label="Theme">
          {THEME_NAMES.map((name) => {
            const swatch = COLORS[name];
            const selected = theme.chosen === name;
            return (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => theme.update({ theme: name })}
                className={`flex flex-col items-center gap-xxs rounded-md border p-xs font-ui text-[11px] transition ${
                  selected ? 'border-accent font-semibold text-accent' : 'border-hairline text-ink-secondary hover:text-ink-primary'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-full items-center justify-center rounded-sm border font-display text-uiMd font-semibold [font-variant-numeric:lining-nums]"
                  style={{ backgroundColor: swatch.bg.canvas, borderColor: swatch.border.subtle, color: swatch.accent.rubric }}
                >
                  3
                </span>
                {THEME_LABELS[name]}
              </button>
            );
          })}
        </div>
        <label className="flex items-center justify-between gap-sm px-md font-ui text-uiXs text-ink-secondary">
          Lamplight when my device is dark
          <input
            type="checkbox"
            checked={theme.prefs.followSystemDark}
            onChange={(event) => theme.update({ followSystemDark: event.target.checked })}
            className="h-4 w-4 accent-[var(--bw-accent-primary)]"
          />
        </label>
      </div>
    </nav>
  );
}
