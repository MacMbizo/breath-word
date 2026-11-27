// D1 §4.2 — Reading settings behind "Aa": theme (Parchment · Selah · Lamplight), Lamplight when the
// device is dark, what a word tap opens, text size, and Focus Mode (FR-104).
import { Pressable, Switch, Text, View } from 'react-native';

import { COLORS, FONT_SIZES, MIN_TOUCH_TARGET, RADII, SPACING, THEME_LABELS, THEME_NAMES, type ThemeName } from '@breath-and-word/tokens';

import { makeStyles, useTheme } from '../../theme/ThemeProvider';
import { Sheet } from '../ui/Sheet';

const THEME_NOTES: Record<ThemeName, string> = {
  parchment: 'Warm page',
  selah: 'Calm & airy',
  lamplight: 'For night',
};

export function ReadingSettingsSheet({ visible, onClose, onFocusMode }: { visible: boolean; onClose: () => void; onFocusMode: () => void }) {
  const styles = useStyles();
  const theme = useTheme();
  const { prefs, update, chosen, scriptureSize, colors } = theme;

  return (
    <Sheet visible={visible} title="Reading" onClose={onClose}>
      <View style={styles.section}>
        <Text style={styles.label}>Theme</Text>
        <View style={styles.themes} accessibilityRole="radiogroup">
          {THEME_NAMES.map((name) => {
            const swatch = COLORS[name];
            const selected = chosen === name;
            return (
              <Pressable
                key={name}
                onPress={() => update({ theme: name })}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${THEME_LABELS[name]} theme, ${THEME_NOTES[name]}`}
                style={[styles.themeCard, selected && styles.themeCardSelected]}
              >
                <View style={[styles.swatch, { backgroundColor: swatch.bg.canvas, borderColor: swatch.border.subtle }]}>
                  <Text style={[styles.swatchNumeral, { color: swatch.accent.rubric }]}>3</Text>
                </View>
                <Text style={[styles.themeName, selected && { color: colors.accent.primary }]}>{THEME_LABELS[name]}</Text>
                <Text style={styles.themeNote}>{THEME_NOTES[name]}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.rowTitle}>Lamplight when my device is dark</Text>
            <Text style={styles.rowDetail}>Follows your phone’s dark mode at night</Text>
          </View>
          <Switch
            value={prefs.followSystemDark}
            onValueChange={(value) => update({ followSystemDark: value })}
            accessibilityLabel="Lamplight when my device is dark"
            trackColor={{ true: colors.accent.primary, false: colors.border.strong }}
            thumbColor={colors.bg.surface}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>When you tap a word</Text>
        <View style={styles.segmented} accessibilityRole="radiogroup">
          {(
            [
              ['card', 'Card'],
              ['interlinear', 'Interlinear'],
            ] as const
          ).map(([value, label]) => {
            const selected = prefs.wordView === value;
            return (
              <Pressable
                key={value}
                onPress={() => update({ wordView: value })}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                style={[styles.segment, selected && styles.segmentSelected]}
              >
                <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.rowDetail}>
          {prefs.wordView === 'card'
            ? 'A simple card: the original word, its meaning and parsing.'
            : 'The whole verse in Greek or Hebrew, word by word, with full parsing.'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Text size</Text>
        <View style={styles.sizeRow}>
          <Pressable
            onPress={() => update({ scriptureSize: Math.max(FONT_SIZES.scriptureMin, scriptureSize - 1) })}
            disabled={scriptureSize <= FONT_SIZES.scriptureMin}
            accessibilityRole="button"
            accessibilityLabel="Smaller text"
            style={[styles.sizeButton, scriptureSize <= FONT_SIZES.scriptureMin && styles.disabled]}
          >
            <Text style={[styles.sizeGlyph, { fontSize: 15 }]}>A</Text>
          </Pressable>
          <Text style={[styles.sizePreview, { fontSize: scriptureSize }]} accessibilityLabel={`Text size ${scriptureSize}`}>
            In the beginning
          </Text>
          <Pressable
            onPress={() => update({ scriptureSize: Math.min(FONT_SIZES.scriptureMax, scriptureSize + 1) })}
            disabled={scriptureSize >= FONT_SIZES.scriptureMax}
            accessibilityRole="button"
            accessibilityLabel="Larger text"
            style={[styles.sizeButton, scriptureSize >= FONT_SIZES.scriptureMax && styles.disabled]}
          >
            <Text style={[styles.sizeGlyph, { fontSize: 22 }]}>A</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={() => {
          onClose();
          onFocusMode();
        }}
        accessibilityRole="button"
        style={styles.focus}
      >
        <Text style={styles.focusTitle}>Focus mode</Text>
        <Text style={styles.rowDetail}>Only the words on the page. Tap “Exit focus” to return.</Text>
      </Pressable>
    </Sheet>
  );
}

const useStyles = makeStyles((c, t) => ({
  section: { gap: SPACING.sm + 2 },
  label: {
    fontFamily: t.fonts.ui.semibold,
    fontSize: FONT_SIZES.uiXs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: c.text.secondary,
  },
  themes: { flexDirection: 'row', gap: SPACING.sm },
  themeCard: {
    flex: 1,
    gap: SPACING.xxs,
    padding: SPACING.sm,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border.subtle,
  },
  themeCardSelected: { borderWidth: 2, borderColor: c.accent.primary },
  swatch: { height: 56, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  swatchNumeral: { fontFamily: t.fonts.display.semibold, fontSize: 28 },
  themeName: { fontFamily: t.fonts.ui.semibold, fontSize: FONT_SIZES.uiSm, color: c.text.primary, marginTop: SPACING.xxs },
  themeNote: { fontFamily: t.fonts.ui.regular, fontSize: 12, color: c.text.secondary },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: MIN_TOUCH_TARGET },
  switchText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: t.fonts.ui.medium, fontSize: FONT_SIZES.uiSm + 1, color: c.text.primary },
  rowDetail: { fontFamily: t.fonts.ui.regular, fontSize: 13, lineHeight: 18, color: c.text.secondary },
  segmented: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: RADII.pill, backgroundColor: c.bg.sunken },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: RADII.pill },
  segmentSelected: { backgroundColor: c.bg.surface, elevation: 2, shadowColor: c.shadow, shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segmentText: { fontFamily: t.fonts.ui.medium, fontSize: FONT_SIZES.uiSm, color: c.text.secondary },
  segmentTextSelected: { fontFamily: t.fonts.ui.semibold, color: c.text.primary },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  sizeButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.bg.sunken,
  },
  sizeGlyph: { fontFamily: t.fonts.scripture.regular, color: c.text.primary },
  sizePreview: { flex: 1, textAlign: 'center', fontFamily: t.fonts.scripture.regular, color: c.text.primary },
  disabled: { opacity: 0.4 },
  focus: { gap: 2, padding: SPACING.md, borderRadius: 16, backgroundColor: c.bg.sunken, minHeight: MIN_TOUCH_TARGET },
  focusTitle: { fontFamily: t.fonts.ui.semibold, fontSize: FONT_SIZES.uiSm + 1, color: c.text.primary },
}));
