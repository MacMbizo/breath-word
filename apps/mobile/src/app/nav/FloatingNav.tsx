// The floating pill navigation (design round 2026-11-28, from "Selah"): four destinations —
// Read · Pray · Journal · Library — in a dark capsule that floats above the page.
//
// It is the custom `tabBar` of the (tabs) layout, so each destination keeps its own state and
// Android back behaves like any tabbed app. Screens under it pad their scroll content with
// `useNavClearance()` so the pill never hides the last lines of a chapter.
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { MIN_TOUCH_TARGET, SPACING } from '@breath-and-word/tokens';

import { makeStyles, useTheme } from '../../theme/ThemeProvider';

import { useFocusMode } from './chrome';
import { Icon, type IconName } from './Icon';

const PILL_HEIGHT = 64;
const PILL_GAP = SPACING.xl;

const TABS: Record<string, { label: string; icon: IconName }> = {
  read: { label: 'Read', icon: 'read' },
  pray: { label: 'Pray', icon: 'pray' },
  journal: { label: 'Journal', icon: 'journal' },
  library: { label: 'Library', icon: 'library' },
};

/** Bottom padding a tab screen's scroll content needs so the pill never covers it. */
export function useNavClearance(): number {
  const insets = useSafeAreaInsets();
  return PILL_HEIGHT + PILL_GAP + insets.bottom + SPACING.lg;
}

export function FloatingNav({ state, navigateToTab }: BottomTabBarProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const focusMode = useFocusMode();

  // The pill would sit on top of the keyboard and cover what the reader is typing: hide it.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Hidden while typing (it would cover the field) and in Focus Mode (FR-104: only the text).
  if (keyboardOpen || focusMode) return null;

  return (
    <View pointerEvents="box-none" style={[styles.dock, { bottom: insets.bottom + PILL_GAP }]}>
      <View style={styles.pill} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (tab === undefined) return null;
          const focused = state.index === index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                if (!focused) navigateToTab(route.key);
              }}
              style={[styles.item, focused && styles.itemActive]}
            >
              <Icon name={tab.icon} color={focused ? colors.nav.activeIcon : colors.nav.icon} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c, theme) => ({
  dock: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    height: PILL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: PILL_HEIGHT / 2,
    backgroundColor: c.nav.bg,
    borderWidth: theme.dark ? 1 : 0,
    borderColor: c.border.strong,
    shadowColor: c.shadow,
    shadowOpacity: theme.dark ? 0.5 : 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  item: {
    width: 56,
    height: Math.max(48, MIN_TOUCH_TARGET),
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemActive: { backgroundColor: c.nav.activeBg },
}));
