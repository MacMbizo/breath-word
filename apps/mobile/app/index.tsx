// Home route — B3 §4.5 Gate-1 Spike 4 (mobile). Boots inside the root layout's core runtime
// (see app/_layout.tsx) and renders the 120Hz Breath Prayer ring. Pure presentation: no store,
// repository, or SQL is touched here. A dev-only link opens the Gate-1 spike diagnostics screen.

import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import {
  COLORS,
  FONT_FAMILIES,
  FONT_SIZES,
  MIN_TOUCH_TARGET,
  RADII,
  SPACING,
} from '@breath-and-word/tokens';

import { BreathRing } from '../src/app/BreathRing';

const THEME = COLORS.daylight;

export default function HomeScreen() {
  return (
    <View style={styles.root}>
      <BreathRing />
      <View style={styles.devLinks}>
        <Link href="/read" style={styles.devLink}>
          <Text style={styles.devLinkText}>Reader</Text>
        </Link>
        <Link href="/compare" style={styles.devLink}>
          <Text style={styles.devLinkText}>Compare</Text>
        </Link>
        <Link href="/search" style={styles.devLink}>
          <Text style={styles.devLinkText}>Search</Text>
        </Link>
        <Link href="/library" style={styles.devLink}>
          <Text style={styles.devLinkText}>Library</Text>
        </Link>
        <Link href="/diagnostics" style={styles.devLink}>
          <Text style={styles.devLinkText}>Gate-1 spike diagnostics</Text>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  devLinks: {
    position: 'absolute',
    top: SPACING.xl,
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
  },
  devLink: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
  },
  devLinkText: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
});
