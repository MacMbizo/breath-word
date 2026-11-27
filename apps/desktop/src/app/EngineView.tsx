// FR-205 guided prayer engines (desktop) + FR-204 offline prompt generator.
//
// Mirrors the mobile `EngineScreen`: four engines — Lectio Divina, Three Rs, ACTS and Breath — run
// over the same stage flow. Each stage's prompt is produced by the deterministic, offline
// `generatePrayerPrompt` (FR-204), so the experience works with airplane mode on and is a backend
// swap away from the P4 AI gateway. The Breath engine embeds the animated `BreathRing`. Finishing
// logs a `prayer_session_logs` row via `PrayerEngineRepository`. No SQL and no repository
// construction happen here (AGENTS.md rule 1).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  generatePrayerPrompt,
  type PrayerCategory,
  type PrayerPrompt,
  type PromptFramework,
} from '@breath-and-word/core';

import { BreathRing } from './BreathRing';
import { useCoreRuntime } from './CoreRuntime';

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

const FIELD =
  'rounded-md border border-hairline bg-surface px-md py-sm font-ui text-uiSm text-ink-primary outline-none focus:border-accent';
const SECTION_LABEL = 'font-ui text-uiXs text-ink-secondary';
const PRIMARY =
  'rounded-pill bg-accent px-xl py-sm font-ui text-uiSm font-medium text-canvas transition hover:opacity-90 disabled:opacity-40';
const OUTLINE =
  'rounded-pill border border-hairline px-xl py-sm font-ui text-uiSm text-ink-secondary transition hover:text-ink-primary disabled:opacity-40';
const CARD = 'flex flex-col gap-md rounded-lg border border-hairline bg-surface p-xl';

export function EngineView() {
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
  /** Wall-clock milliseconds at which the current run began (captured on finish). */
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
    <section className="flex h-full flex-col gap-lg overflow-y-auto">
      <h2 className="font-ui text-uiLg text-ink-primary">Guided Prayer</h2>

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

      <label className="flex flex-col gap-sm">
        <span className={SECTION_LABEL}>Passage reference</span>
        <input
          className={FIELD}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. Romans 8:28"
        />
      </label>
      <label className="flex flex-col gap-sm">
        <span className={SECTION_LABEL}>Passage text</span>
        <textarea
          className={`${FIELD} min-h-24 resize-y`}
          value={passageText}
          onChange={(e) => setPassageText(e.target.value)}
          placeholder="Paste the verses you are praying through"
        />
      </label>

      {framework === 'BREATH' && (
        <div className="h-80">
          <BreathRing />
        </div>
      )}

      {!finished && !atLastStage && (
        <div className={CARD}>
          <span className="font-ui text-uiMd text-accent">{sections[stageIndex]?.stage ?? ''}</span>
          <p className="font-scripture text-ink-primary" style={{ lineHeight: 1.72 }}>
            {sections[stageIndex]?.prompt ?? ''}
          </p>
          <span className="font-ui text-uiXs text-ink-verse">
            {`Step ${stageIndex + 1} of ${sections.length}`}
          </span>
        </div>
      )}

      {!finished && (
        <div className="flex flex-col gap-lg">
          <div className="flex gap-sm">
            <button
              type="button"
              onClick={() => setStageIndex((value) => Math.max(0, value - 1))}
              disabled={stageIndex === 0}
              className={OUTLINE}
            >
              Back
            </button>
            {!atLastStage && (
              <button
                type="button"
                onClick={() => setStageIndex((value) => value + 1)}
                className={PRIMARY}
              >
                Next
              </button>
            )}
          </div>
          {atLastStage && (
            <div className="flex flex-col gap-md">
              <span className={SECTION_LABEL}>Journal (optional, encrypted)</span>
              <textarea
                className={`${FIELD} min-h-24 resize-y`}
                value={journal}
                onChange={(e) => setJournal(e.target.value)}
                placeholder="What did you notice or pray?"
              />
              <button type="button" onClick={() => void finish()} className={PRIMARY}>
                Finish session
              </button>
            </div>
          )}
        </div>
      )}

      {finished && (
        <div className={CARD}>
          <span className="font-ui text-uiMd text-accent">Session recorded</span>
          <p className="font-ui text-uiSm text-ink-secondary">
            Your session has been logged. There is no streak to lose here — simply return whenever
            you are ready.
          </p>
          <button type="button" onClick={restart} className={PRIMARY}>
            Pray again
          </button>
        </div>
      )}

      <p className="font-ui text-uiXs text-ink-verse">
        Prompts are generated offline from your device — nothing is sent anywhere.
      </p>
    </section>
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
    <div className="flex flex-col gap-sm">
      <span className={SECTION_LABEL}>{label}</span>
      <div className="flex flex-wrap gap-sm">
        {options.map((option) => {
          const selected = option.key === active;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onSelect(option.key)}
              aria-pressed={selected}
              className={`rounded-pill border px-lg py-sm font-ui text-uiSm transition ${
                selected
                  ? 'border-transparent bg-accent text-canvas'
                  : 'border-hairline text-ink-primary hover:text-ink-secondary'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
