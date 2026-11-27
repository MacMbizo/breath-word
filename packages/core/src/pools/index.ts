// C3 §4.3 / C4 §4.3 — shared-pool join domain seam for `packages/core`.
//
// Holds the canonical POOL join error copy and keeps the core transport-free: the prayer store
// surfaces calm, actionable messages without importing a network library (the app injects a
// `PoolShareAdapter` — B3 §4.3).

import { AppError, type AppErrorFallback } from '../errors/AppError';

/** C3 §4.3 — invalid or rotated 8-char `share_code` (404). */
export const POOL_SHARE_CODE_INVALID_FALLBACK: AppErrorFallback = {
  code: 'POOL_SHARE_CODE_INVALID',
  domain: 'POOL',
  retryPolicy: 'USER_ACTION',
  userMessage: 'Code not found — ask your group leader for the latest code.',
};

/** C3 §4.3 — ≥5 failed join attempts within 15 minutes (429, C4 §4.4). */
export const POOL_JOIN_RATE_LIMITED_FALLBACK: AppErrorFallback = {
  code: 'POOL_JOIN_RATE_LIMITED',
  domain: 'POOL',
  retryPolicy: 'USER_ACTION',
  userMessage: 'Too many attempts. Please wait 15 minutes and try again.',
};

/** C3 §4.3 — the RPC was called with no authenticated JWT (401). */
export const POOL_JOIN_AUTH_REQUIRED_FALLBACK: AppErrorFallback = {
  code: 'AUTH_REQUIRED',
  domain: 'POOL',
  retryPolicy: 'USER_ACTION',
  userMessage: 'Sign in to join a shared prayer pool.',
};

/**
 * Map a raw `join_shared_pool_by_code` failure onto canonical copy, or `null` when the reason is
 * unmapped (the caller then falls back to a generic `AppError`). The RPC reports
 * `POOL_SHARE_CODE_INVALID` as a returned `{ "error": ... }` jsonb (so the failed-attempt log
 * commits — C4 §4.4) and raises `AUTH_REQUIRED` / `POOL_JOIN_RATE_LIMITED`; both shapes reach us
 * as an error whose message carries the code.
 */
export function poolJoinError(rawMessage: string, cause?: unknown): AppError | null {
  const message = rawMessage.toUpperCase();
  if (message.includes('POOL_JOIN_RATE_LIMITED')) {
    return new AppError({ ...POOL_JOIN_RATE_LIMITED_FALLBACK, cause });
  }
  if (message.includes('POOL_SHARE_CODE_INVALID')) {
    return new AppError({ ...POOL_SHARE_CODE_INVALID_FALLBACK, cause });
  }
  if (message.includes('AUTH_REQUIRED')) {
    return new AppError({ ...POOL_JOIN_AUTH_REQUIRED_FALLBACK, cause });
  }
  return null;
}

/** C3 §4.3 — only a pool's owner may rotate its `share_code` (403, C4 §4.4). */
export const POOL_PERMISSION_DENIED_FALLBACK: AppErrorFallback = {
  code: 'POOL_PERMISSION_DENIED',
  domain: 'POOL',
  retryPolicy: 'NONE',
  userMessage: 'Only the pool owner can change its share code.',
};

/**
 * Map a raw `rotate_pool_share_code` failure onto canonical copy, or `null` when unmapped (the
 * caller then falls back to a generic `AppError`). The RPC raises `POOL_PERMISSION_DENIED` for a
 * non-owner or unknown pool, and `AUTH_REQUIRED` with no JWT (C4 §4.4).
 */
export function poolShareCodeError(rawMessage: string, cause?: unknown): AppError | null {
  const message = rawMessage.toUpperCase();
  if (message.includes('POOL_PERMISSION_DENIED')) {
    return new AppError({ ...POOL_PERMISSION_DENIED_FALLBACK, cause });
  }
  if (message.includes('AUTH_REQUIRED')) {
    return new AppError({ ...POOL_JOIN_AUTH_REQUIRED_FALLBACK, cause });
  }
  return null;
}
