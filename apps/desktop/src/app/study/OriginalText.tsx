// Original-language token (FR-301). Hebrew and Aramaic MUST render `dir="rtl"` with
// `unicode-bidi: isolate` so a right-to-left word never reorders the English around it (AGENTS.md
// rule 6, D3); Greek stays LTR. Fonts come from the token font stacks via Tailwind.
import type { ReactNode } from 'react';

import { isRtlOriginalLanguage, type OriginalLanguage } from '@breath-and-word/core';

const LANG_TAG: Record<OriginalLanguage, string> = { hebrew: 'he', aramaic: 'arc', greek: 'grc' };

export function languageFromStrongs(strongsId: string | undefined): OriginalLanguage {
  return strongsId?.startsWith('H') === true ? 'hebrew' : 'greek';
}

export function OriginalText({
  language,
  className = '',
  children,
}: {
  readonly language: OriginalLanguage;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const rtl = isRtlOriginalLanguage(language);
  return (
    <span
      dir={rtl ? 'rtl' : 'ltr'}
      lang={LANG_TAG[language]}
      className={`${rtl ? 'font-hebrew' : 'font-greek'} ${className}`}
      style={{ unicodeBidi: 'isolate' }}
    >
      {children}
    </span>
  );
}
