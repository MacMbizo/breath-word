// Expo Router root layout — boots the headless core once and provides it to every screen
// (B3 §4.2 rule 2). Screens never construct repositories or write SQL.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { CoreRuntime } from '@breath-and-word/core';
import { COLORS, FONT_FAMILIES, FONT_SIZES, SPACING } from '@breath-and-word/tokens';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLock } from '../src/app/AppLock';
import { CoreRuntimeProvider } from '../src/app/CoreRuntime';
import { bootMobile } from '../src/boot';

const THEME = COLORS.daylight;

export default function RootLayout() {
  const [runtime, setRuntime] = useState<CoreRuntime | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bootMobile().then(
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

  if (error !== null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Breath &Word could not start</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }

  if (runtime === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={THEME.accent.primary} />
        <Text style={styles.loading}>Preparing your study library…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <CoreRuntimeProvider runtime={runtime}>
          <AppLock />
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </CoreRuntimeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
    padding: SPACING.xl,
    backgroundColor: THEME.bg.canvas,
  },
  loading: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  errorTitle: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiMd,
    color: THEME.text.primary,
    textAlign: 'center',
  },
  errorDetail: {
    fontFamily: FONT_FAMILIES.ui,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
    textAlign: 'center',
  },
});
