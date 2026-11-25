// Shared structured-verse renderer (FR-101 / FR-102): renders a `Verse`'s spans and applies
// the red-letter tint. Used by the reader column and the parallel-compare columns.
import type { VerseSpan } from '@breath-and-word/core';

interface VerseSpansProps {
  readonly verseId: number;
  readonly spans: readonly VerseSpan[];
}

export function VerseSpans({ verseId, spans }: VerseSpansProps) {
  return (
    <>
      {spans.map((span, index) => (
        <span
          key={`${verseId}-${index}`}
          className={span.type === 'red_letter' ? 'text-ink-red' : undefined}
        >
          {span.text}
        </span>
      ))}
    </>
  );
}
