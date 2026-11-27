// Shared structured-verse renderer (FR-101): renders a `Verse`'s spans inline and applies the
// red-letter tint, poetic indents and tappable footnote markers. It must sit INSIDE a parent
// `<Text>` so the runs flow as one paragraph.
//
// Poetry (`\q*`) lines are distinct source lines, so each one after the first is prefixed with a
// newline — otherwise consecutive poetry spans concatenate into a run-on sentence. Nesting depth
// (`span.indentLevel`) is expressed with non-breaking spaces because inline `<Text>` runs cannot
// carry block padding.
//
// FR-301 — when the pack carries `verse_word_alignments`, aligned English words are nested
// pressable `<Text>` runs (they stay inline, so the paragraph still wraps as one) that open word
// study for that word.
import { Text } from 'react-native';

import { segmentSpanText, type VerseSpan, type VerseWordAlignment } from '@breath-and-word/core';
import { FONT_SIZES } from '@breath-and-word/tokens';
import { makeStyles, useTheme } from '../theme/ThemeProvider';

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
  /** FR-301 — the word whose card is open, drawn with the theme's tapped-word wash. */
  readonly activeAlignmentId?: number;
}

export function VerseSpans({ verseId, spans, onFootnotePress, alignments, onWordPress, activeAlignmentId }: VerseSpansProps) {
  const styles = useStyles();
  const { colors: THEME } = useTheme();
  return (
    <>
      {spans.map((span, index) => {
        const footnoteId = span.footnoteId;
        if (span.type === 'footnote') {
          return (
            <Text
              key={`${verseId}-${index}`}
              style={styles.footnoteMarker}
              accessibilityRole="button"
              accessibilityLabel={`Footnote ${span.text}`}
              onPress={
                footnoteId === undefined || onFootnotePress === undefined
                  ? undefined
                  : () => onFootnotePress(footnoteId)
              }
            >
              {span.text}
            </Text>
          );
        }
        const indent =
          span.type === 'poetry'
            ? POETRY_INDENT.repeat(Math.max(0, (span.indentLevel ?? 1) - 1))
            : '';
        const spanStyle =
          span.type === 'red_letter'
            ? { color: THEME.text.redLetter }
            : span.type === 'heading'
              ? { color: THEME.text.secondary, fontFamily: styles.heading.fontFamily }
              : undefined;
        const prefix = `${span.type === 'poetry' && index > 0 ? '\n' : ''}${indent}`;
        if (onWordPress === undefined || span.type === 'heading') {
          return (
            <Text key={`${verseId}-${index}`} style={spanStyle}>
              {prefix}
              {span.text}
            </Text>
          );
        }
        // Each run is a direct child of the verse paragraph, so a pressable word sits at the same
        // nesting depth as the verse number. On Android (RN 0.88, new architecture) a pressable
        // <Text> nested a third level deep did not receive presses in device testing.
        return segmentSpanText(span.text, index, alignments).map((segment, part) => {
          const alignment = segment.alignment;
          const text = part === 0 ? `${prefix}${segment.text}` : segment.text;
          if (alignment === undefined) {
            return (
              <Text key={`${verseId}-${index}-${part}`} style={spanStyle}>
                {text}
              </Text>
            );
          }
          const active = alignment.id === activeAlignmentId;
          return (
            <Text
              key={`${verseId}-${index}-${part}`}
              style={active ? [spanStyle, styles.activeWord] : spanStyle}
              accessibilityState={{ selected: active }}
              accessibilityRole="button"
              accessibilityLabel={`Study the word ${segment.text}`}
              suppressHighlighting={false}
              onPress={() => onWordPress(alignment)}
            >
              {text}
            </Text>
          );
        });
      })}
    </>
  );
}

const useStyles = makeStyles((THEME, t) => ({
  footnoteMarker: {
    fontFamily: t.fonts.ui.semibold,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.accent.primary,
  },
  heading: { fontFamily: t.fonts.scripture.italic },
  activeWord: { backgroundColor: THEME.accent.wash, color: THEME.accent.onWash },
}));
