// FR-304 (mobile) — Observation symbols as highlights, 5Ws & H, Paraphrase, and the 5-step Application
// card whose checkup schedules a local reminder. Notes are E2EE-encrypted by the repository when the
// vault is on (B6); nothing here touches storage directly.
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

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
import {
  INDUCTIVE_HIGHLIGHTS,
  INDUCTIVE_SYMBOLS,
  MIN_TOUCH_TARGET,
  inductiveWash,
  type InductiveSymbol,
} from '@breath-and-word/tokens';

import { useCoreRuntime } from '../CoreRuntime';
import { useCoreStore } from '../useCoreStore';

import { useTheme } from '../../theme/ThemeProvider';

import { useStudy } from './studyStyles';

export interface InductiveSectionProps {
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
const CHECKUP_DAYS = [
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
] as const;
const EMPTY_5WH: Inductive5WhContent = { who: '', what: '', when: '', where: '', why: '', how: '' };
const EMPTY_APPLICATION: Application5StepContent = { verse: '', truth: '', need: '', intent: '', checkupNote: '' };

function NoteBody({ note }: { note: StudyNoteRecord }) {
  const study = useStudy();
  if (note.noteType === 'INDUCTIVE_5WH') {
    const content = parseInductive5Wh(note.body);
    if (content !== null) {
      return (
        <View>
          {FIVE_WH.filter((key) => content[key].length > 0).map((key) => (
            <Text key={key} style={study.body}>
              <Text style={study.muted}>{`${key[0]!.toUpperCase()}${key.slice(1)}  `}</Text>
              {content[key]}
            </Text>
          ))}
        </View>
      );
    }
  }
  if (note.noteType === 'APPLICATION') {
    const content = parseApplication5Step(note.body);
    if (content !== null) {
      return (
        <View>
          {FIVE_STEPS.filter((step) => content[step.key].length > 0).map((step) => (
            <Text key={step.key} style={study.body}>
              <Text style={study.muted}>{`${step.label.split(' — ')[0]}  `}</Text>
              {content[step.key]}
            </Text>
          ))}
        </View>
      );
    }
  }
  return <Text style={study.body}>{note.body}</Text>;
}

export function InductiveSection({ userId, verseId, reference, translationCode }: InductiveSectionProps) {
  const study = useStudy();
  const { colors: THEME, name: themeName } = useTheme();
  const { stores } = useCoreRuntime();
  const { highlights, notes, checkupReminders, error } = useCoreStore(stores.study);
  const [noteType, setNoteType] = useState<NoteType>('INDUCTIVE_5WH');
  const [fiveWh, setFiveWh] = useState<Inductive5WhContent>(EMPTY_5WH);
  const [application, setApplication] = useState<Application5StepContent>(EMPTY_APPLICATION);
  const [text, setText] = useState('');
  const [checkupDays, setCheckupDays] = useState<number>(7);
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

  const hasContent =
    noteType === 'INDUCTIVE_5WH'
      ? FIVE_WH.some((key) => fiveWh[key].trim().length > 0)
      : noteType === 'APPLICATION'
        ? FIVE_STEPS.some((step) => application[step.key].trim().length > 0)
        : text.trim().length > 0;

  async function saveNote() {
    if (!hasContent) return;
    setSaving(true);
    const body =
      noteType === 'INDUCTIVE_5WH'
        ? serializeInductive5Wh(fiveWh)
        : noteType === 'APPLICATION'
          ? serializeApplication5Step(application)
          : text.trim();
    const created = await stores.study.getState().createNote({
      userId,
      startVerseId: verseId,
      endVerseId: verseId,
      noteType,
      body,
      ...(noteType === 'APPLICATION'
        ? { checkupRemindAt: new Date(Date.now() + checkupDays * 86_400_000).toISOString() }
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
    <View style={study.section}>
      {error !== null && (
        <Text accessibilityRole="alert" style={study.error}>
          {error.userMessage}
        </Text>
      )}

      {dueReminders.length > 0 && (
        <View style={study.card}>
          <Text style={study.heading}>Checkups due</Text>
          {dueReminders.map((reminder) => (
            <View key={reminder.noteId} style={[study.row, { justifyContent: 'space-between' }]}>
              <Text style={[study.body, { flex: 1 }]}>{`How did you live out ${reminder.passageReference}?`}</Text>
              <Pressable
                onPress={() => void stores.study.getState().dismissReminder(reminder.noteId)}
                accessibilityRole="button"
                style={study.button}
              >
                <Text style={study.buttonText}>Done</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Text style={study.heading}>{`Observe · ${reference}`}</Text>
      <View style={study.wrap} accessibilityRole="toolbar">
        {INDUCTIVE_SYMBOLS.map((symbol) => {
          const meta = INDUCTIVE_HIGHLIGHTS[symbol];
          const active = verseHighlights.some((h) => h.symbolTag === symbol);
          return (
            <Pressable
              key={symbol}
              onPress={() => void toggleSymbol(symbol)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={meta.meaning}
              style={[study.chip, { backgroundColor: inductiveWash(symbol, themeName) }, active && { borderColor: THEME.accent.primary }]}
            >
              <Text style={study.chipText}>{`${meta.badge}  ${meta.meaning}`}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={study.card}>
        <View style={study.wrap} accessibilityRole="tablist">
          {NOTE_TYPES.map((type) => (
            <Pressable
              key={type.id}
              onPress={() => setNoteType(type.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: noteType === type.id }}
              style={[study.chip, noteType === type.id && study.chipActive]}
            >
              <Text style={study.chipText}>{type.label}</Text>
            </Pressable>
          ))}
        </View>

        {noteType === 'INDUCTIVE_5WH' &&
          FIVE_WH.map((key) => (
            <View key={key} style={study.label}>
              <Text style={study.muted}>{`${key[0]!.toUpperCase()}${key.slice(1)}`}</Text>
              <TextInput
                style={study.input}
                value={fiveWh[key]}
                onChangeText={(value) => setFiveWh({ ...fiveWh, [key]: value })}
                accessibilityLabel={key}
              />
            </View>
          ))}

        {noteType === 'APPLICATION' && (
          <>
            {FIVE_STEPS.map((step) => (
              <View key={step.key} style={study.label}>
                <Text style={study.muted}>{step.label}</Text>
                <TextInput
                  style={study.input}
                  multiline
                  value={application[step.key]}
                  onChangeText={(value) => setApplication({ ...application, [step.key]: value })}
                  accessibilityLabel={step.label}
                />
              </View>
            ))}
            <Text style={study.muted}>Remind me to check up in</Text>
            <View style={study.wrap}>
              {CHECKUP_DAYS.map((option) => (
                <Pressable
                  key={option.days}
                  onPress={() => setCheckupDays(option.days)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: checkupDays === option.days }}
                  style={[study.chip, checkupDays === option.days && study.chipActive]}
                >
                  <Text style={study.chipText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {(noteType === 'PARAPHRASE' || noteType === 'GENERAL') && (
          <TextInput
            style={[study.input, { minHeight: MIN_TOUCH_TARGET * 3, textAlignVertical: 'top' }]}
            multiline
            placeholder={noteType === 'PARAPHRASE' ? 'Say this verse in your own words…' : 'Write a note…'}
            placeholderTextColor={THEME.text.verseNum}
            value={text}
            onChangeText={setText}
          />
        )}

        <Pressable
          onPress={() => void saveNote()}
          disabled={!hasContent || saving}
          accessibilityRole="button"
          style={[study.primaryButton, (!hasContent || saving) && study.disabled]}
        >
          <Text style={study.primaryButtonText}>{saving ? 'Saving…' : 'Save note'}</Text>
        </Pressable>
      </View>

      {verseNotes.length > 0 && <Text style={study.heading}>{`Notes · ${verseNotes.length}`}</Text>}
      {verseNotes.map((note) => (
        <View key={note.id} style={study.card}>
          <View style={[study.row, { justifyContent: 'space-between' }]}>
            <Text style={study.muted}>
              {`${NOTE_TYPES.find((t) => t.id === note.noteType)?.label ?? note.noteType}${note.isEncrypted ? ' · encrypted' : ''}`}
            </Text>
            <Pressable
              onPress={() => void stores.study.getState().removeNote(note.id, userId)}
              accessibilityRole="button"
              accessibilityLabel="Delete note"
              style={study.button}
            >
              <Text style={study.buttonText}>Delete</Text>
            </Pressable>
          </View>
          <NoteBody note={note} />
          {note.checkupRemindAt !== undefined && (
            <Text style={study.muted}>{`Checkup ${new Date(note.checkupRemindAt).toLocaleDateString()}`}</Text>
          )}
        </View>
      ))}
    </View>
  );
}
