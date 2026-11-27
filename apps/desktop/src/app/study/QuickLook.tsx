// FR-301 — the quick look shown under a verse when an English word is tapped while the study panel is
// collapsed: the original word, its gloss and Strong's number, and a way into the full panel. It
// never leaves a blank box: a "Looking up…" line shows until the lookup lands.
import { useEffect } from 'react';

import type { VerseWordAlignment } from '@breath-and-word/core';

import { useCoreRuntime } from '../CoreRuntime';
import { Icon } from '../shell/Icon';
import { useCoreStoreSelector } from '../useCoreStore';

import { languageFromStrongs, OriginalText } from './OriginalText';

export interface QuickLookProps {
  readonly alignment: VerseWordAlignment;
  readonly englishWord: string;
  readonly packId: string;
  readonly translationCode: string;
  readonly onOpenPanel: () => void;
  readonly onClose: () => void;
}

export function QuickLook({ alignment, englishWord, packId, translationCode, onOpenPanel, onClose }: QuickLookProps) {
  const { stores } = useCoreRuntime();
  const inspected = useCoreStoreSelector(stores.study, (state) => state.inspectedWord);

  useEffect(() => {
    void stores.study
      .getState()
      .inspectWord(packId, translationCode, alignment.canonicalVerseId, { spanIndex: alignment.spanIndex, charOffset: alignment.charStart });
  }, [stores, alignment, packId, translationCode]);

  const current = inspected !== null && inspected.alignment?.id === alignment.id ? inspected : null;
  const token = current?.token;
  const lexicon = current?.lexicon;
  const strongs = token?.strongsId ?? alignment.strongsId;

  return (
    <div
      role="dialog"
      aria-label={`Quick look: ${englishWord}`}
      className="my-sm ml-xxl flex max-w-sm flex-col gap-xs rounded-[18px] bg-surface p-md font-ui shadow-[0_14px_36px_var(--bw-shadow)]"
    >
      <div className="flex items-baseline justify-between gap-sm">
        {current === null ? (
          <span className="text-uiSm text-ink-secondary">Looking up the original word…</span>
        ) : token !== undefined ? (
          <OriginalText language={languageFromStrongs(token.strongsId)} className="text-[24px] text-ink-primary">
            {token.lemma ?? token.originalWord}
          </OriginalText>
        ) : lexicon !== undefined ? (
          <OriginalText language={lexicon.language} className="text-[24px] text-ink-primary">
            {lexicon.lemma}
          </OriginalText>
        ) : (
          <span className="text-uiSm text-ink-secondary">No original-language entry for this word yet.</span>
        )}
        <span className="flex items-center gap-xs">
          {strongs !== undefined && <span className="text-uiXs font-semibold text-accent">{strongs}</span>}
          <button type="button" onClick={onClose} aria-label="Close quick look" className="flex h-8 w-8 items-center justify-center rounded-pill text-ink-secondary hover:text-ink-primary">
            <Icon name="close" size={16} />
          </button>
        </span>
      </div>
      {current !== null && (lexicon?.shortDefinition ?? token?.englishGloss) !== undefined && (
        <span className="text-uiSm leading-snug text-ink-primary">{lexicon?.shortDefinition ?? token?.englishGloss}</span>
      )}
      <button
        type="button"
        onClick={onOpenPanel}
        className="self-start rounded-pill bg-elevated px-md py-xs text-uiXs font-semibold text-ink-primary transition hover:bg-sunken"
      >
        Open in study panel
      </button>
    </div>
  );
}
