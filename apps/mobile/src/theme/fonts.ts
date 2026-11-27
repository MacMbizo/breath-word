// D1 §4.4 — the bundled font faces, registered under the `FONT_FACES` names at boot.
//
// Each face is imported from its own weight sub-path so Metro bundles only these eleven files
// (not every weight of every family). All are SIL Open Font License fonts shipped inside the app:
// nothing is fetched at runtime, so first launch offline still renders in the right typefaces.
import { CormorantGaramond_500Medium } from '@expo-google-fonts/cormorant-garamond/500Medium';
import { CormorantGaramond_500Medium_Italic } from '@expo-google-fonts/cormorant-garamond/500Medium_Italic';
import { CormorantGaramond_600SemiBold } from '@expo-google-fonts/cormorant-garamond/600SemiBold';
import { GentiumBookPlus_400Regular } from '@expo-google-fonts/gentium-book-plus/400Regular';
import { GentiumBookPlus_400Regular_Italic } from '@expo-google-fonts/gentium-book-plus/400Regular_Italic';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Literata_400Regular } from '@expo-google-fonts/literata/400Regular';
import { Literata_400Regular_Italic } from '@expo-google-fonts/literata/400Regular_Italic';
import { Literata_500Medium } from '@expo-google-fonts/literata/500Medium';
import { NotoSerifHebrew_400Regular } from '@expo-google-fonts/noto-serif-hebrew/400Regular';

import { FONT_FACES } from '@breath-and-word/tokens';

/** `useFonts` map: token face name → bundled font file. */
export const APP_FONTS = {
  [FONT_FACES.scripture.regular]: Literata_400Regular,
  [FONT_FACES.scripture.italic]: Literata_400Regular_Italic,
  [FONT_FACES.scripture.medium]: Literata_500Medium,
  [FONT_FACES.ui.regular]: Inter_400Regular,
  [FONT_FACES.ui.medium]: Inter_500Medium,
  [FONT_FACES.ui.semibold]: Inter_600SemiBold,
  [FONT_FACES.display.medium]: CormorantGaramond_500Medium,
  [FONT_FACES.display.semibold]: CormorantGaramond_600SemiBold,
  [FONT_FACES.display.italic]: CormorantGaramond_500Medium_Italic,
  [FONT_FACES.greek.regular]: GentiumBookPlus_400Regular,
  [FONT_FACES.greek.italic]: GentiumBookPlus_400Regular_Italic,
  [FONT_FACES.hebrew.regular]: NotoSerifHebrew_400Regular,
} as const;
