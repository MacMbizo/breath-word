// B3 §4.1 `apps/desktop/src/adapters` — the single bridge between the WebView and the Tauri
// command layer (`src-tauri/src/commands.rs`).
//
// Every command rejects with the Rust `CommandError` envelope `{ code, message }`. This module is
// the one place that turns that envelope (or any transport failure) into a canonical `AppError`
// (C3 / AGENTS.md rule 7), so no screen ever sees a raw SQL or IPC error.

import { invoke } from '@tauri-apps/api/core';
import {
  AppError,
  asAppError,
  type AppErrorFallback,
  type ErrorDomain,
  type RetryPolicy,
} from '@breath-and-word/core';

/** The `{ code, message }` envelope `CommandError` serialises to in `commands.rs`. */
interface CommandErrorEnvelope {
  readonly code: string;
  readonly message?: string;
}

function isCommandErrorEnvelope(value: unknown): value is CommandErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code: unknown }).code === 'string'
  );
}

function domainFor(code: string): ErrorDomain {
  if (code.startsWith('PACK_')) return 'PACK';
  if (code.startsWith('CRYPTO_')) return 'CRYPTO';
  return 'DB';
}

function retryPolicyFor(code: string): RetryPolicy {
  return code === 'PACK_DOWNLOAD_INTERRUPTED' ? 'EXPONENTIAL_BACKOFF' : 'USER_ACTION';
}

/** Calm, actionable copy for the command codes that can reach the user (C3). */
function userMessageFor(code: string): string {
  switch (code) {
    case 'PACK_STORAGE_FULL':
      return 'There is not enough free space to install this pack.';
    case 'PACK_CHECKSUM_MISMATCH':
      return 'The downloaded pack was corrupted in transit. Please retry the download.';
    case 'PACK_DOWNLOAD_INTERRUPTED':
      return 'The download was interrupted. It will resume when you are back online.';
    case 'PACK_INTEGRITY_FAILED':
      return 'The downloaded pack could not be verified.';
    case 'DB_CONTENT_PACK_NOT_ATTACHED':
      return 'That Bible pack is not installed yet.';
    default:
      return 'Something went wrong while reading your local data. Please try again.';
  }
}

/** Coerce a rejected Tauri command into a canonical `AppError`. */
export function toAppError(reason: unknown, fallback: AppErrorFallback): AppError {
  if (isCommandErrorEnvelope(reason)) {
    return new AppError({
      code: reason.code,
      domain: domainFor(reason.code),
      retryPolicy: retryPolicyFor(reason.code),
      userMessage: userMessageFor(reason.code),
      internalDetail: reason.message,
      cause: reason,
    });
  }
  return asAppError(reason, fallback);
}

/** `invoke` a Tauri command, mapping any rejection onto the canonical `AppError` taxonomy. */
export async function callCommand<T>(
  command: string,
  args: Record<string, unknown>,
  fallback: AppErrorFallback,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (reason) {
    throw toAppError(reason, fallback);
  }
}
