// FR-206 / C4 §4.1 — Account & sync surface (desktop).
//
// Mirrors the mobile `AccountScreen`: the sign-in/up surface that drives the Zero-Loss Guest →
// Account upgrade. When the app is unprovisioned the store reports `configured === false` and this
// view explains that everything stays on-device. It reads only through `runtime.stores.account` —
// no SQL, no Supabase import here (AGENTS.md rule 1).
import { useState } from 'react';

import { useCoreRuntime } from './CoreRuntime';
import { useCoreStore } from './useCoreStore';

const SECTION_LABEL = 'font-ui text-uiXs text-ink-secondary';
const CARD = 'flex flex-col gap-md rounded-lg border border-hairline bg-surface p-xl';
const INPUT =
  'rounded-md border border-hairline bg-canvas px-lg py-sm font-ui text-uiMd text-ink-primary';
const PRIMARY =
  'self-start rounded-pill bg-accent px-xl py-sm font-ui text-uiSm font-medium text-canvas transition hover:opacity-90 disabled:opacity-50';
const OUTLINE =
  'self-start rounded-pill border border-hairline px-lg py-sm font-ui text-uiSm text-ink-secondary transition hover:text-ink-primary disabled:opacity-50';

export function AccountView() {
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
    <section className="flex h-full flex-col gap-lg overflow-y-auto">
      <h2 className="font-ui text-uiLg text-ink-primary">Account &amp; Sync</h2>

      {!configured && (
        <div className={CARD}>
          <span className={SECTION_LABEL}>Offline Guest Mode</span>
          <p className="font-ui text-uiMd text-ink-primary" style={{ lineHeight: 1.6 }}>
            This build keeps everything on your device. Sign-in and cross-device sync are not set up
            here, so your notes, highlights and prayers stay private and local.
          </p>
        </div>
      )}

      {configured && signedIn && (
        <div className={CARD}>
          <span className={SECTION_LABEL}>Signed in</span>
          <p className="font-ui text-uiMd text-ink-primary">
            {session?.email ?? session?.userId ?? 'Your account'}
          </p>
          {lastMigration !== null && (
            <p className="font-ui text-uiSm text-ink-secondary">
              {`Linked ${lastMigration.totalMigrated} ${
                lastMigration.totalMigrated === 1 ? 'item' : 'items'
              } from this device to your account.`}
            </p>
          )}
          {upgrading && <p className="font-ui text-uiSm text-accent">Finishing your upgrade…</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => void store.getState().signOut()}
            className={OUTLINE}
          >
            Sign out
          </button>
        </div>
      )}

      {configured && !signedIn && (
        <div className={CARD}>
          <span className={SECTION_LABEL}>
            {mode === 'signIn' ? 'Sign in to sync' : 'Create an account'}
          </span>
          <p className="font-ui text-uiSm text-ink-secondary">
            Everything you have already made on this device stays — signing in links it to your
            account with zero loss.
          </p>
          <input
            type="email"
            autoComplete="email"
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            value={email}
            className={INPUT}
          />
          <input
            type="password"
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            value={password}
            className={INPUT}
          />
          {error !== null && <p className="font-ui text-uiSm text-accent">{error.userMessage}</p>}
          <button type="button" disabled={!canSubmit} onClick={submit} className={PRIMARY}>
            {busy ? 'Working…' : mode === 'signIn' ? 'Sign in' : 'Create account'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
            className="self-start font-ui text-uiSm text-accent transition hover:opacity-80"
          >
            {mode === 'signIn' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </button>
        </div>
      )}
    </section>
  );
}
