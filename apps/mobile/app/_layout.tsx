// Expo Router root layout — boots the headless core once and provides it to every screen
// (B3 §4.2 rule 2). Screens never construct repositories or write SQL.
//
// Boot order: core runtime + saved appearance (so the first frame is already in the reader's
// theme) and the bundled fonts load in parallel; the boot screen shows until both are ready.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import type { CoreRuntime } from '@breath-and-word/core';
import { FONT_SIZES, SPACING } from '@breath-and-word/tokens';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppLock } from '../src/app/AppLock';
import { CoreRuntimeProvider } from '../src/app/CoreRuntime';
import { bootMobile } from '../src/boot';
import { APP_FONTS } from '../src/theme/fonts';
import { makeStyles, ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

export default function RootLayout() {
  const [runtime, setRuntime] = useState<CoreRuntime | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fontsLoaded, fontError] = useFonts(APP_FONTS);

  useEffect(() => {
    let cancelled = false;
    bootMobile()
      .then(async (wired) => {
        await wired.stores.appearance.getState().load();
        return wired;
      })
      .then(
        (wired) => {
          if (!cancelled) setRuntime(wired);
        },
        (reason: unknown) => {
          if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
        },
      );
    return () => {
      cancelled = true;
    };
  }, []);

  // FR-206 — start the account store once so an existing Supabase session (or a later sign-in)
  // drives the guest→account upgrade. Inert (`configured: false`) in an unprovisioned build.
  useEffect(() => {
    if (runtime === null) return undefined;
    void runtime.stores.account.getState().start();
    return () => {
      void runtime.stores.account.getState().stop();
    };
  }, [runtime]);

  // A font that fails to load falls back to the system face rather than blocking the app.
  const fontsReady = fontsLoaded || fontError !== null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider store={runtime?.stores.appearance ?? null}>
          {error !== null ? (
            <BootMessage title="Breath & Word could not start" detail={error} />
          ) : runtime === null || !fontsReady ? (
            <BootMessage busy detail="Preparing your study library…" />
          ) : (
            <CoreRuntimeProvider runtime={runtime}>
              <AppLock />
              <AppStack />
            </CoreRuntimeProvider>
          )}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppStack() {
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          // Every screen starts below the status bar; the canvas colour fills behind it.
          contentStyle: { paddingTop: insets.top, backgroundColor: colors.bg.canvas },
          animation: 'fade_from_bottom',
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

function BootMessage({ title, detail, busy = false }: { title?: string; detail: string; busy?: boolean }) {
  const styles = useStyles();
  const { colors, dark } = useTheme();
  return (
    <View style={styles.centered}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {busy && <ActivityIndicator color={colors.accent.primary} />}
      {title !== undefined && <Text style={styles.title}>{title}</Text>}
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

// The boot screen renders before the bundled fonts are ready, so it uses the system face.
const useStyles = makeStyles((c) => ({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
    padding: SPACING.xl,
    backgroundColor: c.bg.canvas,
  },
  title: { fontSize: FONT_SIZES.uiMd, color: c.text.primary, textAlign: 'center' },
  detail: { fontSize: FONT_SIZES.uiSm, color: c.text.secondary, textAlign: 'center' },
}));
