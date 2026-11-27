// FR-204 (offline mode) — deterministic, zero-AI prayer prompt generator.
//
// Produces the SAME response shape the P4 `ai-gateway` returns for `mode: "PRAYER_PROMPT"`
// (C1 §4.1) so the AI upgrade is a backend swap, not a UI rewrite. Everything here is pure,
// synchronous and offline — no network, no clock, no randomness — so it works with airplane
// mode on (FR-204 acceptance criterion).
//
// Privacy guardrail (B6 / C1 §4.1): decrypted personal context may only shape the prompt when
// `includeUserNotes === true`; otherwise `optionalUserContext` is ignored entirely and never
// appears in the output.

import type { PrayerCategory, PrayerFramework } from '../domain/types';

/** The four guided engines that generate prompts; the FR-203 rotation deck has none. */
export type PromptFramework = Exclude<PrayerFramework, 'DECK'>;

/** Coarse literary genre from the `books` pack (`B4 §4.2`); tunes the framing sentence only. */
export type LiteraryGenre =
  | 'LAW'
  | 'HISTORY'
  | 'POETRY_WISDOM'
  | 'PROPHECY'
  | 'GOSPEL'
  | 'ACTS_EPISTLE'
  | 'APOCALYPTIC';

/** Max personal-context characters that may ever reach a prompt (C1 §4.1). */
export const MAX_USER_CONTEXT_CHARS = 500;

export interface PrayerPromptRequest {
  readonly framework: PromptFramework;
  readonly category: PrayerCategory;
  /** Human reference, e.g. `"Philippians 4:6-7"`. */
  readonly passageReference: string;
  /** The captured verse text the user is praying through. */
  readonly passageText: string;
  readonly genre?: LiteraryGenre;
  /** Privacy gate: personal context is only honoured when this is `true`. */
  readonly includeUserNotes: boolean;
  /** Decrypted personal note (≤500 chars); ignored unless `includeUserNotes === true`. */
  readonly optionalUserContext?: string | null;
}

/** One stage of a guided flow — mirrors `C1`'s `sections[]` element. */
export interface PrayerPromptSection {
  readonly stage: string;
  readonly prompt: string;
}

/** Mirrors the `C1 §4.1` `PRAYER_PROMPT` response, minus the model/quota fields. */
export interface PrayerPrompt {
  readonly mode: 'PRAYER_PROMPT';
  readonly source: 'OFFLINE_TEMPLATE';
  readonly prayerText: string;
  readonly sections: readonly PrayerPromptSection[];
}

const CATEGORY_NOUN: Record<PrayerCategory, string> = {
  ANXIETY: 'your anxiety and the peace that guards your heart',
  GUIDANCE: 'your need for clear guidance',
  THANKSGIVING: 'your gratitude to God',
  FAMILY: 'the people you love',
  FINANCE: 'your financial pressures',
  HEALING: 'your need for healing',
  CUSTOM: 'this burden you are carrying',
};

const GENRE_FRAMING: Record<LiteraryGenre, string> = {
  LAW: "as God's covenant instruction",
  HISTORY: "as God's hand at work among His people",
  POETRY_WISDOM: 'as a prayer of the heart',
  PROPHECY: "as God's word to a waiting people",
  GOSPEL: 'as the good news of Jesus',
  ACTS_EPISTLE: 'as apostolic teaching for the church',
  APOCALYPTIC: 'as hope for the end of all things',
};

/**
 * Generate a structured, offline prayer prompt (FR-204). Pure and deterministic: identical
 * inputs always produce identical output, with no I/O of any kind.
 */
export function generatePrayerPrompt(request: PrayerPromptRequest): PrayerPrompt {
  const reference = request.passageReference.trim();
  const excerpt = clip(request.passageText.trim(), 120);
  const categoryNoun = CATEGORY_NOUN[request.category];
  const framing = request.genre === undefined ? null : GENRE_FRAMING[request.genre];
  const context = resolveUserContext(request);
  const quote = excerpt === '' ? reference : `"${excerpt}" (${reference})`;

  const sections = FRAMEWORK_SECTIONS[request.framework]({ categoryNoun, framing, quote, context, reference });

  return {
    mode: 'PRAYER_PROMPT',
    source: 'OFFLINE_TEMPLATE',
    prayerText: buildPrayerText({ categoryNoun, framing, reference, context }),
    sections,
  };
}

interface SectionContext {
  readonly reference: string;
  readonly quote: string;
  readonly categoryNoun: string;
  readonly framing: string | null;
  readonly context: string | null;
}

/** Appends the (already gated) personal context as a final clause when present. */
function withContext(prompt: string, context: string | null): string {
  return context === null ? prompt : `${prompt} Bring this before Him: ${context}.`;
}

const FRAMEWORK_SECTIONS: Record<PromptFramework, (ctx: SectionContext) => PrayerPromptSection[]> = {
  LECTIO_DIVINA: (ctx) => [
    { stage: 'Lectio', prompt: `Read ${ctx.quote} slowly, listening for the word that is meant for you today.` },
    { stage: 'Meditatio', prompt: `Sit with that word and ask what God is saying to you about ${ctx.categoryNoun}.` },
    { stage: 'Oratio', prompt: withContext(`Respond to God in your own words about ${ctx.categoryNoun}.`, ctx.context) },
    { stage: 'Contemplatio', prompt: `Rest quietly in God's presence, trusting Him with ${ctx.categoryNoun}.` },
  ],
  THREE_RS: (ctx) => [
    { stage: 'Rejoice', prompt: `Rejoice that God is near in ${ctx.quote}.` },
    { stage: 'Repent', prompt: `Repent of any way you have carried ${ctx.categoryNoun} in your own strength.` },
    { stage: 'Request', prompt: withContext(`Ask God plainly for His help with ${ctx.categoryNoun}.`, ctx.context) },
  ],
  ACTS: (ctx) => [
    {
      stage: 'Adoration',
      prompt:
        ctx.framing === null
          ? `Adore God as the One who speaks in ${ctx.reference}.`
          : `Adore God, who speaks ${ctx.framing} in ${ctx.reference}.`,
    },
    { stage: 'Confession', prompt: `Confess where ${ctx.categoryNoun} has crowded out your trust in Him.` },
    { stage: 'Thanksgiving', prompt: `Thank God for how ${ctx.quote} reveals His care for you.` },
    { stage: 'Supplication', prompt: withContext(`Place ${ctx.categoryNoun} before Him and ask for His peace.`, ctx.context) },
  ],
  BREATH: (ctx) => [
    { stage: 'Inhale', prompt: `Breathe in slowly, receiving ${ctx.quote}.` },
    { stage: 'Exhale', prompt: `Breathe out slowly, releasing ${ctx.categoryNoun} to God.` },
  ],
};

function buildPrayerText(params: {
  readonly categoryNoun: string;
  readonly framing: string | null;
  readonly reference: string;
  readonly context: string | null;
}): string {
  const lead =
    params.framing === null
      ? `Gracious Father, I come to You with ${params.reference}.`
      : `Gracious Father, I come to You with ${params.reference} ${params.framing}.`;
  return withContext(
    `${lead} You invite me to bring ${params.categoryNoun} to You. Speak to me through Your Word, and let Your peace guard my heart in Christ Jesus.`,
    params.context,
  );
}

/**
 * Resolve the effective personal context. Returns `null` unless the user explicitly included
 * notes, and always clips to `MAX_USER_CONTEXT_CHARS` (C1 §4.1 privacy guardrail).
 */
function resolveUserContext(request: PrayerPromptRequest): string | null {
  if (!request.includeUserNotes) {
    return null;
  }
  const raw = request.optionalUserContext;
  if (raw === undefined || raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed === '' ? null : clip(trimmed, MAX_USER_CONTEXT_CHARS);
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}
