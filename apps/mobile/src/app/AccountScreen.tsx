// FR-206 / C4 §4.1 — Account & sync surface (mobile).
//
// The sign-in/up surface that drives the Zero-Loss Guest → Account upgrade. When the app is
// unprovisioned the store reports `configured === false` and this screen explains that everything
// stays on-device. Otherwise it shows the signed-out form (email + password) or the signed-in
// state, and reports the in-flight migration (`upgrading`) and the canonical `AppError` copy.
// It reads only through `runtime.stores.account` — no SQL, no Supabase import here (AGENTS.md rule 1).

import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FONT_FACES, FONT_SIZES, LINE_HEIGHTS, MIN_TOUCH_TARGET, RADII, SPACING } from '@breath-and-word/tokens';

import { useCoreRuntime } from './CoreRuntime';
import { useCoreStore } from './useCoreStore';
import { makeStyles, useTheme } from '../theme/ThemeProvider';


export function AccountScreen() {
  const styles = useStyles();
  const { colors: THEME } = useTheme();
  const runtime = useCoreRuntime();
  const store = runtime.stores.account;
  const { configured, signedIn, session, upgrading, status, error, lastMigration } =
    useCoreStore(store);

  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const busy = upgrading || status === 'loading';
  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  function submit() {
    const trimmed = email.trim();
    if (mode === 'signIn') {
      void store.getState().signIn(trimmed, password);
    } else {
      void store.getState().signUp(trimmed, password);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Account & Sync</Text>

      {!configured && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Offline Guest Mode</Text>
          <Text style={styles.body}>
            This build keeps everything on your device. Sign-in and cross-device sync are not set up
            here, so your notes, highlights and prayers stay private and local.
          </Text>
        </View>
      )}

      {configured && signedIn && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Signed in</Text>
          <Text style={styles.body}>{session?.email ?? session?.userId ?? 'Your account'}</Text>
          {lastMigration !== null && (
            <Text style={styles.muted}>
              {`Linked ${lastMigration.totalMigrated} ${
                lastMigration.totalMigrated === 1 ? 'item' : 'items'
              } from this device to your account.`}
            </Text>
          )}
          {upgrading && <Text style={styles.notice}>Finishing your upgrade…</Text>}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void store.getState().signOut()}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Sign out</Text>
          </Pressable>
        </View>
      )}

      {configured && !signedIn && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>
            {mode === 'signIn' ? 'Sign in to sync' : 'Create an account'}
          </Text>
          <Text style={styles.muted}>
            Everything you have already made on this device stays — signing in links it to your
            account with zero loss.
          </Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            inputMode="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={THEME.text.secondary}
            style={styles.input}
            value={email}
          />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={THEME.text.secondary}
            secureTextEntry
            style={styles.input}
            value={password}
          />
          {error !== null && <Text style={styles.error}>{error.userMessage}</Text>}
          <Pressable
            accessibilityRole="button"
            disabled={!canSubmit}
            onPress={submit}
            style={[styles.primaryButton, canSubmit ? null : styles.disabled]}
          >
            <Text style={styles.primaryButtonText}>
              {busy ? 'Working…' : mode === 'signIn' ? 'Sign in' : 'Create account'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
          >
            <Text style={styles.link}>
              {mode === 'signIn'
                ? 'New here? Create an account'
                : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((THEME) => ({
  content: {
    gap: SPACING.lg,
    padding: SPACING.xl,
    paddingBottom: SPACING.xxxl,
    backgroundColor: THEME.bg.canvas,
  },
  title: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiLg,
    color: THEME.text.primary,
  },
  card: {
    gap: SPACING.md,
    padding: SPACING.xl,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.surface,
  },
  sectionLabel: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiXs,
    color: THEME.text.secondary,
  },
  body: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiMd,
    lineHeight: FONT_SIZES.uiMd * LINE_HEIGHTS.ui,
    color: THEME.text.primary,
  },
  muted: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    lineHeight: FONT_SIZES.uiSm * LINE_HEIGHTS.ui,
    color: THEME.text.secondary,
  },
  notice: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.accent.primary,
  },
  error: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.accent.primary,
  },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
    backgroundColor: THEME.bg.canvas,
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiMd,
    color: THEME.text.primary,
  },
  primaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.pill,
    backgroundColor: THEME.accent.primary,
  },
  primaryButtonText: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.bg.canvas,
  },
  secondaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: THEME.border.subtle,
  },
  secondaryButtonText: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.text.secondary,
  },
  disabled: { opacity: 0.5 },
  link: {
    fontFamily: FONT_FACES.ui.regular,
    fontSize: FONT_SIZES.uiSm,
    color: THEME.accent.primary,
  },
}));
