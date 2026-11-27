// Shared structured-verse renderer (FR-101 / FR-102): renders a `Verse`'s spans and applies
// the red-letter tint, poetic indents and tappable footnote markers. Used by the reader column
// and the parallel-compare columns.
//
// Poetry (`\\q*`) lines are distinct source lines, so each one after the first is preceded by a
// `<br />` — inside a `<p>`, HTML collapses a newline to a space, which would run the lines together.
// Nesting depth (`span.indentLevel`) is expressed with non-breaking spaces because inline runs
// cannot carry block padding.
//
// FR-301 — when the pack carries `verse_word_alignments`, aligned English words render as quiet
// tappable runs (dotted underline on hover/focus) that open word study for that word.
import { segmentSpanText, type VerseSpan, type VerseWordAlignment } from '@breath-and-word/core';

/** Two non-breaking spaces per nesting level (`\q2` indents one step past the base `\q1` line). */
const POETRY_INDENT = '\u00A0\u00A0';

interface VerseSpansProps {
  readonly verseId: number;
  readonly spans: readonly VerseSpan[];
  /** FR-101 — opens the footnote sheet when a marker is tapped. */
  readonly onFootnotePress?: (footnoteId: string) => void;
  /** FR-301 — this verse's aligned English words; omitted in views without word study. */
  readonly alignments?: readonly VerseWordAlignment[];
  /** FR-301 — opens word study for a tapped aligned word. */
  readonly onWordPress?: (alignment: VerseWordAlignment) => void;
  /** The alignment currently open in word study, drawn as selected. */
  readonly activeAlignmentId?: number;
  /**
   * Whether aligned words are keyboard tab stops. Only the selected verse's words are, so a
   * chapter never becomes hundreds of tab stops; the verse-number button is the keyboard way in.
   */
  readonly wordsFocusable?: boolean;
}

const WORD =
  'cursor-pointer rounded-sm decoration-accent decoration-dotted underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none';

export function VerseSpans({ verseId, spans, onFootnotePress, alignments, onWordPress, activeAlignmentId, wordsFocusable = false }: VerseSpansProps) {
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
            {onWordPress === undefined || span.type === 'heading'
              ? span.text
              : segmentSpanText(span.text, index, alignments).map((segment, part) => {
                  const alignment = segment.alignment;
                  if (alignment === undefined) return segment.text;
                  const active = alignment.id === activeAlignmentId;
                  return (
                    <span
                      key={part}
                      role="button"
                      tabIndex={wordsFocusable ? 0 : -1}
                      className={`${WORD} ${active ? 'bg-elevated underline' : ''}`}
                      aria-pressed={active}
                      aria-label={`Study the word ${segment.text}`}
                      onClick={() => onWordPress(alignment)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onWordPress(alignment);
                        }
                      }}
                    >
                      {segment.text}
                    </span>
                  );
                })}
          </span>
        );
      })}
    </>
  );
}
