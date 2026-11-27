// Shared token-only styles for the mobile study surfaces (AGENTS.md rule 6: no hex literals).
import { FONT_FACES, FONT_SIZES, LINE_HEIGHTS, MIN_TOUCH_TARGET, RADII, SPACING } from '@breath-and-word/tokens';

import { makeStyles } from '../../theme/ThemeProvider';

/** Themed study styles: call `const study = useStudy();` inside a component. */
export const useStudy = makeStyles((THEME) => ({
  section: { gap: SPACING.sm },
  heading: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiXs,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: THEME.text.secondary,
  },
  card: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
  },
  body: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    lineHeight: FONT_SIZES.uiSm * LINE_HEIGHTS.ui,
    color: THEME.text.primary,
  },
  muted: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  title: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  error: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.redLetter,
  },
  link: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.accent.primary,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
  },
  chipActive: { borderColor: THEME.accent.primary, backgroundColor: THEME.bg.elevated },
  chipText: { fontFamily: FONT_FACES.ui.regular, fontSize: FONT_SIZES.uiSm, color: THEME.text.primary },
  button: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  buttonText: { fontFamily: FONT_FACES.ui.regular, fontSize: FONT_SIZES.uiSm, color: THEME.text.secondary },
  primaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    backgroundColor: THEME.accent.primary,
  },
  primaryButtonText: { fontFamily: FONT_FACES.ui.regular, fontSize: FONT_SIZES.uiSm, color: THEME.text.onAccent },
  disabled: { opacity: 0.4 },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.primary,
  },
  label: { gap: SPACING.xxs },
}));
