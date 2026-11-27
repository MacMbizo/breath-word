// C3 §4.3 / C4 §4.1 — auth-domain seam for `packages/core`.
//
// Holds the canonical `AUTH_REQUIRED` / `AUTH_GUEST_MIGRATION_FAILED` copy and keeps the core
// transport-free: the account store reports "sign-in unavailable" without ever importing a network
// library (the app injects an `AuthAdapter` — B3 §4.3).

import { AppError, type AppErrorFallback } from '../errors/AppError';

/**
 * C3 §4.3 — no signed-in account (or no auth transport at all). Offline reading/writing is never
 * blocked; the user is simply invited to sign in when they want cross-device sync.
 */
export const AUTH_REQUIRED_FALLBACK: AppErrorFallback = {
  code: 'AUTH_REQUIRED',
  domain: 'AUTH',
  retryPolicy: 'USER_ACTION',
  userMessage: 'Sign in to sync your study across your devices.',
};

/** C3 §4.3 — the local guest→account rewrite failed and rolled back; guest data is intact. */
export const AUTH_GUEST_MIGRATION_FALLBACK: AppErrorFallback = {
  code: 'AUTH_GUEST_MIGRATION_FAILED',
  domain: 'AUTH',
  retryPolicy: 'USER_ACTION',
  userMessage:
    'We could not finish linking your offline notes to your account. Your notes are safe — please try again.',
};

export function authRequiredError(): AppError {
  return new AppError(AUTH_REQUIRED_FALLBACK);
}

export function guestMigrationError(internalDetail: string, cause?: unknown): AppError {
  return new AppError({ ...AUTH_GUEST_MIGRATION_FALLBACK, internalDetail, cause });
}
