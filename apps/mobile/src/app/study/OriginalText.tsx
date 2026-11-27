// Original-language token (FR-301, mobile). React Native has no `unicode-bidi`, so Hebrew/Aramaic are
// wrapped in the Unicode isolate controls RLI (U+2067) … PDI (U+2069) — the plain-text equivalent of
// `dir="rtl"` + `unicode-bidi: isolate` (AGENTS.md rule 6, D3) — and laid out right-to-left. Greek
// gets LRI (U+2066) … PDI so it never reorders surrounding RTL context either.
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { isRtlOriginalLanguage, type OriginalLanguage } from '@breath-and-word/core';
import { FONT_FACES, LINE_HEIGHTS } from '@breath-and-word/tokens';

const RLI = '⁧';
const LRI = '⁦';
const PDI = '⁩';

export function languageFromStrongs(strongsId: string | undefined): OriginalLanguage {
  return strongsId?.startsWith('H') === true ? 'hebrew' : 'greek';
}

/** Wrap text in the bidi isolate matching its script. */
export function isolateOriginal(text: string, language: OriginalLanguage): string {
  return `${isRtlOriginalLanguage(language) ? RLI : LRI}${text}${PDI}`;
}

export function OriginalText({
  language,
  size,
  style,
  children,
}: {
  readonly language: OriginalLanguage;
  readonly size: number;
  readonly style?: StyleProp<TextStyle>;
  readonly children: string;
}) {
  const rtl = isRtlOriginalLanguage(language);
  return (
    <Text
      style={[
        {
          fontFamily: rtl ? FONT_FACES.hebrew.regular : FONT_FACES.greek.regular,
          fontSize: size,
          lineHeight: size * (rtl ? LINE_HEIGHTS.hebrew : LINE_HEIGHTS.greek),
          writingDirection: rtl ? 'rtl' : 'ltr',
        },
        style,
      ]}
    >
      {isolateOriginal(children, language)}
    </Text>
  );
}
