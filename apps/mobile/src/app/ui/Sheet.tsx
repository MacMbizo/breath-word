// A themed bottom sheet: scrim + rounded panel with a grab handle and a title row. Slides in, or
// appears instantly when the device asks for Reduced Motion (D3 / AGENTS.md rule 6).
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FONT_SIZES, MIN_TOUCH_TARGET, RADII, SPACING } from '@breath-and-word/tokens';

import { makeStyles } from '../../theme/ThemeProvider';

export function Sheet({
  visible,
  title,
  onClose,
  closeLabel = 'Done',
  children,
  scroll = true,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion() === true;
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel={`Close ${title}`} />
        <View style={[styles.panel, { paddingBottom: insets.bottom + SPACING.xl }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.close}>
              <Text style={styles.closeText}>{closeLabel}</Text>
            </Pressable>
          </View>
          {scroll ? <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView> : <View style={styles.body}>{children}</View>}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c, t) => ({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const), backgroundColor: c.shadow, opacity: t.dark ? 0.6 : 0.28 },
  panel: {
    maxHeight: '88%',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    gap: SPACING.md,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: c.bg.surface,
    borderTopWidth: t.dark ? 1 : 0,
    borderColor: c.border.strong,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border.strong },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: t.fonts.ui.semibold, fontSize: FONT_SIZES.uiMd + 1, color: c.text.primary },
  close: {
    minHeight: MIN_TOUCH_TARGET - 8,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    backgroundColor: c.bg.elevated,
  },
  closeText: { fontFamily: t.fonts.ui.medium, fontSize: FONT_SIZES.uiSm, color: c.text.primary },
  body: { gap: SPACING.lg, paddingBottom: SPACING.sm },
}));
