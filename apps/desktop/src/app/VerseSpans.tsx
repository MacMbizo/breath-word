// Shared structured-verse renderer (FR-101 / FR-102): renders a `Verse`'s spans and applies
// the red-letter tint, poetic indents and tappable footnote markers. Used by the reader column
// and the parallel-compare columns.
//
// Poetry (`\\q*`) lines are distinct source lines, so each one after the first is preceded by a
// `<br />` — inside a `<p>`, HTML collapses a newline to a space, which would run the lines together.
// Nesting depth (`span.indentLevel`) is expressed with non-breaking spaces because inline runs
// cannot carry block padding.
import type { VerseSpan } from '@breath-and-word/core';

/** Two non-breaking spaces per nesting level (`\q2` indents one step past the base `\q1` line). */
const POETRY_INDENT = '\u00A0\u00A0';

interface VerseSpansProps {
  readonly verseId: number;
  readonly spans: readonly VerseSpan[];
  /** FR-101 — opens the footnote sheet when a marker is tapped. */
  readonly onFootnotePress?: (footnoteId: string) => void;
}

export function VerseSpans({ verseId, spans, onFootnotePress }: VerseSpansProps) {
  return (
    <>
      {spans.map((span, index) => {
        const footnoteId = span.footnoteId;
        if (span.type === 'footnote') {
          return (
            <button
              key={`${verseId}-${index}`}
              type="button"
              className="align-super font-ui text-uiXs text-accent"
              aria-label={`Footnote ${span.text}`}
              onClick={
                footnoteId === undefined || onFootnotePress === undefined
                  ? undefined
                  : () => onFootnotePress(footnoteId)
              }
            >
              {span.text}
            </button>
          );
        }
        const indent =
          span.type === 'poetry'
            ? POETRY_INDENT.repeat(Math.max(0, (span.indentLevel ?? 1) - 1))
            : '';
        return (
          <span
            key={`${verseId}-${index}`}
            className={
              span.type === 'red_letter'
                ? 'text-ink-red'
                : span.type === 'heading'
                  ? 'italic text-ink-secondary'
                  : undefined
            }
          >
            {span.type === 'poetry' && index > 0 ? <br /> : null}
            {indent}
            {span.text}
          </span>
        );
      })}
    </>
  );
}
