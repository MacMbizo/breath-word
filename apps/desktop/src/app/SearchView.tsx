// FR-103 offline FTS5 search — runs a local `verses_fts` MATCH through the headless reader
// store and highlights the `[[…]]`-wrapped snippet terms. No SQL here (AGENTS.md rule 1):
// the store calls `ReaderRepository`, which owns the query.
import { useState, type FormEvent, type ReactNode } from 'react';

import { formatCanonicalRange } from '@breath-and-word/core';

import { useCoreRuntime } from './CoreRuntime';
import { useCoreStore } from './useCoreStore';

const DEFAULT_PACK_ID = 'core_bsb';

const FIELD =
  'w-full rounded-md border border-hairline bg-surface px-md py-sm font-ui text-uiSm text-ink-primary outline-none focus:border-accent';

/** Split an FTS5 `snippet(...)` on its `[[…]]` match markers, emphasising the matched terms. */
function renderSnippet(snippet: string): ReactNode[] {
  return snippet.split(/(\[\[.*?\]\])/g).map((part, index) =>
    part.startsWith('[[') && part.endsWith(']]') ? (
      <mark
        key={index}
        className="bg-transparent font-semibold text-ink-primary underline decoration-accent"
      >
        {part.slice(2, -2)}
      </mark>
    ) : (
      part
    ),
  );
}

export function SearchView() {
  const { stores } = useCoreRuntime();
  const { searchQuery, searchResults, searchStatus, searchError } = useCoreStore(stores.reader);
  const [packId, setPackId] = useState(DEFAULT_PACK_ID);
  const [translationCode, setTranslationCode] = useState('');
  const [bookNumber, setBookNumber] = useState('');
  const [text, setText] = useState('');

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const translation = translationCode.trim();
    const book = bookNumber.trim();
    void stores.reader.getState().search({
      packId,
      text,
      translationCode: translation === '' ? undefined : translation,
      bookNumber: book === '' ? undefined : Number(book),
    });
  }

  return (
    <section className="flex h-full flex-col gap-lg overflow-hidden">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-sm">
        <label className="flex flex-col gap-xxs font-ui text-uiXs text-ink-secondary">
          Pack
          <input className={FIELD} value={packId} onChange={(e) => setPackId(e.target.value)} />
        </label>
        <label className="flex w-32 flex-col gap-xxs font-ui text-uiXs text-ink-secondary">
          Translation (opt.)
          <input
            className={FIELD}
            value={translationCode}
            placeholder="BSB"
            onChange={(e) => setTranslationCode(e.target.value)}
          />
        </label>
        <label className="flex w-24 flex-col gap-xxs font-ui text-uiXs text-ink-secondary">
          Book (opt.)
          <input
            className={FIELD}
            inputMode="numeric"
            value={bookNumber}
            placeholder="45"
            onChange={(e) => setBookNumber(e.target.value)}
          />
        </label>
        <label className="flex min-w-64 flex-1 flex-col gap-xxs font-ui text-uiXs text-ink-secondary">
          Query (FTS5)
          <input
            className={FIELD}
            value={text}
            placeholder={'shepherd AND valley  ·  "living water"  ·  stead*'}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-lg py-sm font-ui text-uiSm font-medium text-canvas transition hover:opacity-90"
        >
          Search
        </button>
      </form>

      <div className="flex-1 overflow-y-auto">
        {searchStatus === 'loading' && (
          <p className="font-ui text-uiSm text-ink-secondary">Searching…</p>
        )}
        {searchStatus === 'idle' && (
          <p className="font-ui text-uiSm text-ink-secondary">
            Search runs entirely offline against the installed pack.
          </p>
        )}
        {searchError !== null && (
          <p className="font-ui text-uiSm text-ink-red" role="alert">
            {searchError.userMessage}
          </p>
        )}
        {searchStatus === 'ready' && (
          <>
            <p className="mb-sm font-ui text-uiSm text-ink-secondary">
              {searchResults.length === 0
                ? `No verses matched "${searchQuery}".`
                : `${searchResults.length} result${searchResults.length === 1 ? '' : 's'} for "${searchQuery}"`}
            </p>
            <ul className="flex flex-col gap-sm">
              {searchResults.map((hit) => (
                <li
                  key={`${hit.canonicalVerseId}-${hit.translationCode}`}
                  className="rounded-md border border-hairline bg-surface px-lg py-md"
                >
                  <div className="mb-xxs flex items-baseline justify-between gap-sm">
                    <span className="font-ui text-uiSm font-medium text-ink-primary">
                      {formatCanonicalRange(hit.canonicalVerseId, hit.canonicalVerseId)}
                    </span>
                    <span className="font-ui text-uiXs text-ink-secondary">
                      {hit.translationCode}
                    </span>
                  </div>
                  <p className="font-scripture text-ink-primary">{renderSnippet(hit.snippet)}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
