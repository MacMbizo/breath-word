// FR-304 — Inductive study for the selected verse: Observation symbols (◇ △ ↳ ✦ ✓) as highlights,
// structured 5Ws & H notes, a personal Paraphrase, and the 5-step Application card whose checkup date
// schedules a local reminder. Notes are E2EE-encrypted by the repository when the vault is on (B6).
import { useMemo, useState } from 'react';

import {
  parseApplication5Step,
  parseInductive5Wh,
  serializeApplication5Step,
  serializeInductive5Wh,
  type Application5StepContent,
  type Inductive5WhContent,
  type NoteType,
  type StudyNoteRecord,
} from '@breath-and-word/core';
import { INDUCTIVE_HIGHLIGHTS, INDUCTIVE_SYMBOLS, inductiveCssVariable, type InductiveSymbol } from '@breath-and-word/tokens';

import { useCoreRuntime } from '../CoreRuntime';
import { useCoreStore } from '../useCoreStore';

import { BUTTON, CARD, FIELD, PANEL_HEADING, PRIMARY_BUTTON } from './styles';

export interface InductivePaneProps {
  readonly userId: string;
  readonly verseId: number;
  readonly reference: string;
  readonly translationCode: string;
}

const NOTE_TYPES: readonly { readonly id: NoteType; readonly label: string }[] = [
  { id: 'INDUCTIVE_5WH', label: '5Ws & H' },
  { id: 'PARAPHRASE', label: 'Paraphrase' },
  { id: 'APPLICATION', label: 'Application' },
  { id: 'GENERAL', label: 'Note' },
];

const FIVE_WH: readonly (keyof Inductive5WhContent)[] = ['who', 'what', 'when', 'where', 'why', 'how'];
const FIVE_STEPS: readonly { readonly key: keyof Application5StepContent; readonly label: string }[] = [
  { key: 'verse', label: '1 · Verse — what does it say?' },
  { key: 'truth', label: '2 · Truth — what is true about God?' },
  { key: 'need', label: '3 · Need — where do I need this?' },
  { key: 'intent', label: '4 · Intent — what will I do?' },
  { key: 'checkupNote', label: '5 · Checkup — how will I know?' },
];

const EMPTY_5WH: Inductive5WhContent = { who: '', what: '', when: '', where: '', why: '', how: '' };
const EMPTY_APPLICATION: Application5StepContent = { verse: '', truth: '', need: '', intent: '', checkupNote: '' };

/** `YYYY-MM-DD` a week from now — the default Application checkup. */
function inAWeek(): string {
  return new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
}

function NoteBody({ note }: { note: StudyNoteRecord }) {
  if (note.noteType === 'INDUCTIVE_5WH') {
    const content = parseInductive5Wh(note.body);
    if (content !== null) {
      return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-sm gap-y-xxs font-ui text-uiSm">
          {FIVE_WH.filter((key) => content[key].length > 0).map((key) => (
            <div key={key} className="contents">
              <dt className="capitalize text-ink-secondary">{key}</dt>
              <dd className="text-ink-primary">{content[key]}</dd>
            </div>
          ))}
        </dl>
      );
    }
  }
  if (note.noteType === 'APPLICATION') {
    const content = parseApplication5Step(note.body);
    if (content !== null) {
      return (
        <ol className="flex flex-col gap-xxs font-ui text-uiSm text-ink-primary">
          {FIVE_STEPS.filter((step) => content[step.key].length > 0).map((step) => (
            <li key={step.key}>
              <span className="text-ink-secondary">{step.label.split(' — ')[0]}</span> {content[step.key]}
            </li>
          ))}
        </ol>
      );
    }
  }
  return <p className="whitespace-pre-line font-ui text-uiSm text-ink-primary">{note.body}</p>;
}

export function InductivePane({ userId, verseId, reference, translationCode }: InductivePaneProps) {
  const { stores } = useCoreRuntime();
  const { highlights, notes, checkupReminders, error } = useCoreStore(stores.study);
  const [noteType, setNoteType] = useState<NoteType>('INDUCTIVE_5WH');
  const [fiveWh, setFiveWh] = useState<Inductive5WhContent>(EMPTY_5WH);
  const [application, setApplication] = useState<Application5StepContent>(EMPTY_APPLICATION);
  const [text, setText] = useState('');
  const [checkupDate, setCheckupDate] = useState(inAWeek);
  const [saving, setSaving] = useState(false);

  const verseHighlights = highlights.filter((h) => h.startVerseId <= verseId && h.endVerseId >= verseId);
  const verseNotes = notes.filter((n) => n.startVerseId <= verseId && n.endVerseId >= verseId);
  const dueReminders = useMemo(
    () => checkupReminders.filter((r) => !r.dismissed && Date.parse(r.remindAt) <= Date.now()),
    [checkupReminders],
  );

  async function toggleSymbol(symbol: InductiveSymbol) {
    const existing = verseHighlights.find((h) => h.symbolTag === symbol);
    if (existing !== undefined) {
      await stores.study.getState().removeHighlight(existing.id, userId);
      return;
    }
    await stores.study.getState().addHighlight({
      userId,
      translationCode,
      startVerseId: verseId,
      endVerseId: verseId,
      colorHex: INDUCTIVE_HIGHLIGHTS[symbol].lightWash,
      symbolTag: symbol,
    });
  }

  const body =
    noteType === 'INDUCTIVE_5WH'
      ? serializeInductive5Wh(fiveWh)
      : noteType === 'APPLICATION'
        ? serializeApplication5Step(application)
        : text.trim();
  const hasContent =
    noteType === 'INDUCTIVE_5WH'
      ? FIVE_WH.some((key) => fiveWh[key].trim().length > 0)
      : noteType === 'APPLICATION'
        ? FIVE_STEPS.some((step) => application[step.key].trim().length > 0)
        : text.trim().length > 0;

  async function saveNote() {
    if (!hasContent) return;
    setSaving(true);
    const created = await stores.study.getState().createNote({
      userId,
      startVerseId: verseId,
      endVerseId: verseId,
      noteType,
      body,
      ...(noteType === 'APPLICATION' && checkupDate.length > 0
        ? { checkupRemindAt: new Date(`${checkupDate}T09:00:00`).toISOString() }
        : {}),
    });
    setSaving(false);
    if (created !== null) {
      setFiveWh(EMPTY_5WH);
      setApplication(EMPTY_APPLICATION);
      setText('');
    }
  }

  return (
    <div className="flex flex-col gap-md">
      {error !== null && (
        <p className="font-ui text-uiSm text-ink-red" role="alert">
          {error.userMessage}
        </p>
      )}

      {dueReminders.length > 0 && (
        <section className={CARD} aria-label="Application checkups due">
          <h3 className={PANEL_HEADING}>Checkups due</h3>
          <ul className="mt-xs flex flex-col gap-xs">
            {dueReminders.map((reminder) => (
              <li key={reminder.noteId} className="flex items-center justify-between gap-sm font-ui text-uiSm">
                <span className="text-ink-primary">{`How did you live out ${reminder.passageReference}?`}</span>
                <button type="button" className={BUTTON} onClick={() => void stores.study.getState().dismissReminder(reminder.noteId)}>
                  Done
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-xs">
        <h3 className={PANEL_HEADING}>{`Observe · ${reference}`}</h3>
        <div className="flex flex-wrap gap-xs" role="toolbar" aria-label="Inductive symbols">
          {INDUCTIVE_SYMBOLS.map((symbol) => {
            const meta = INDUCTIVE_HIGHLIGHTS[symbol];
            const active = verseHighlights.some((h) => h.symbolTag === symbol);
            return (
              <button
                key={symbol}
                type="button"
                aria-pressed={active}
                title={meta.meaning}
                onClick={() => void toggleSymbol(symbol)}
                className={`flex items-center gap-xs rounded-pill border px-md py-xxs font-ui text-uiSm text-ink-primary transition ${
                  active ? 'border-accent' : 'border-hairline'
                }`}
                style={{ backgroundColor: `var(${inductiveCssVariable(symbol)})` }}
              >
                <span aria-hidden>{meta.badge}</span>
                {meta.meaning}
              </button>
            );
          })}
        </div>
      </section>

      <section className={`${CARD} flex flex-col gap-sm`}>
        <div className="flex flex-wrap gap-xs" role="tablist" aria-label="Note type">
          {NOTE_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              role="tab"
              aria-selected={noteType === type.id}
              onClick={() => setNoteType(type.id)}
              className={`rounded-pill px-md py-xxs font-ui text-uiSm transition ${
                noteType === type.id ? 'bg-accent text-canvas' : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        {noteType === 'INDUCTIVE_5WH' &&
          FIVE_WH.map((key) => (
            <label key={key} className="flex flex-col gap-xxs font-ui text-uiXs capitalize text-ink-secondary">
              {key}
              <input className={FIELD} value={fiveWh[key]} onChange={(e) => setFiveWh({ ...fiveWh, [key]: e.target.value })} />
            </label>
          ))}

        {noteType === 'APPLICATION' && (
          <>
            {FIVE_STEPS.map((step) => (
              <label key={step.key} className="flex flex-col gap-xxs font-ui text-uiXs text-ink-secondary">
                {step.label}
                <textarea
                  className={FIELD}
                  rows={2}
                  value={application[step.key]}
                  onChange={(e) => setApplication({ ...application, [step.key]: e.target.value })}
                />
              </label>
            ))}
            <label className="flex flex-col gap-xxs font-ui text-uiXs text-ink-secondary">
              Remind me to check up on
              <input type="date" className={FIELD} value={checkupDate} onChange={(e) => setCheckupDate(e.target.value)} />
            </label>
          </>
        )}

        {(noteType === 'PARAPHRASE' || noteType === 'GENERAL') && (
          <textarea
            className={FIELD}
            rows={5}
            placeholder={noteType === 'PARAPHRASE' ? 'Say this verse in your own words…' : 'Write a note…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}

        <div className="flex justify-end">
          <button type="button" className={PRIMARY_BUTTON} disabled={!hasContent || saving} onClick={() => void saveNote()}>
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </section>

      {verseNotes.length > 0 && (
        <section className="flex flex-col gap-sm">
          <h3 className={PANEL_HEADING}>{`Notes · ${verseNotes.length}`}</h3>
          {verseNotes.map((note) => (
            <article key={note.id} className={CARD}>
              <div className="mb-xs flex items-center justify-between gap-sm">
                <span className="font-ui text-uiXs text-ink-secondary">
                  {`${NOTE_TYPES.find((t) => t.id === note.noteType)?.label ?? note.noteType} · ${note.passageReference}`}
                  {note.isEncrypted ? ' · encrypted' : ''}
                </span>
                <button type="button" className={BUTTON} onClick={() => void stores.study.getState().removeNote(note.id, userId)}>
                  Delete
                </button>
              </div>
              <NoteBody note={note} />
              {note.checkupRemindAt !== undefined && (
                <p className="mt-xs font-ui text-uiXs text-ink-secondary">
                  {`Checkup ${new Date(note.checkupRemindAt).toLocaleDateString()}`}
                </p>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
