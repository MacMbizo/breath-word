// Calm hub pages for the Pray and Journal tabs: a display-serif title, a line of context, and a
// short list of destinations. Each row is one generous touch target (D3: ≥ 44 pt).
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useRouter, type Href } from 'expo-router';

import { FONT_SIZES, MIN_TOUCH_TARGET, RADII, SPACING } from '@breath-and-word/tokens';

import { makeStyles, useTheme } from '../../theme/ThemeProvider';

import { useNavClearance } from './FloatingNav';
import { Icon } from './Icon';

export interface HubLink {
  readonly href: Href;
  readonly title: string;
  readonly detail: string;
}

export function HubScreen({ title, lede, links, children }: { title: string; lede: string; links: readonly HubLink[]; children?: ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const clearance = useNavClearance();
  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: clearance }]}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.lede}>{lede}</Text>
      {children}
      <View style={styles.list}>
        {links.map((link) => (
          <Pressable
            key={link.title}
            accessibilityRole="link"
            accessibilityHint={link.detail}
            onPress={() => router.push(link.href)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{link.title}</Text>
              <Text style={styles.rowDetail}>{link.detail}</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.text.secondary} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((c, t) => ({
  root: { flex: 1, backgroundColor: c.bg.canvas },
  content: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl, gap: SPACING.lg },
  title: {
    fontFamily: t.fonts.display.semibold,
    fontSize: 44,
    lineHeight: 48,
    color: c.text.primary,
  },
  lede: {
    fontFamily: t.fonts.scripture.italic,
    fontSize: FONT_SIZES.uiMd,
    lineHeight: FONT_SIZES.uiMd * 1.5,
    color: c.text.secondary,
    marginTop: -SPACING.sm,
  },
  list: {
    borderRadius: RADII.lg,
    backgroundColor: c.bg.surface,
    borderWidth: t.dark ? 1 : 0,
    borderColor: c.border.subtle,
    overflow: 'hidden',
  },
  row: {
    minHeight: MIN_TOUCH_TARGET + SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: c.border.subtle,
  },
  rowPressed: { backgroundColor: c.bg.sunken },
  rowText: { flex: 1, gap: SPACING.xxs },
  rowTitle: { fontFamily: t.fonts.ui.semibold, fontSize: FONT_SIZES.uiMd, color: c.text.primary },
  rowDetail: { fontFamily: t.fonts.ui.regular, fontSize: FONT_SIZES.uiSm, color: c.text.secondary },
}));
