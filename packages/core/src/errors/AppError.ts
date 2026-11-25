// C3 §4.1 — Canonical AppError contract.
// Every error surfaced across the app MUST be (or wrap) an AppError.

export type ErrorDomain =
  | 'AUTH'
  | 'CRYPTO'
  | 'SYNC'
  | 'POOL'
  | 'PACK'
  | 'AI'
  | 'ESV'
  | 'DB';

export type RetryPolicy = 'NONE' | 'EXPONENTIAL_BACKOFF' | 'USER_ACTION';

export interface AppErrorShape {
  code: string; // e.g. 'CRYPTO_VAULT_LOCKED', 'PACK_CHECKSUM_MISMATCH'
  domain: ErrorDomain;
  httpStatus?: number; // Populated for remote/RPC/Edge errors
  retryPolicy: RetryPolicy;
  userMessage: string; // Safe, calm, actionable copy (never leaks raw SQL/stack traces)
  internalDetail?: string; // Redacted diagnostic note (stripped before telemetry if sensitive)
  cause?: unknown;
}

export class AppError extends Error implements AppErrorShape {
  readonly code: string;
  readonly domain: ErrorDomain;
  readonly httpStatus?: number;
  readonly retryPolicy: RetryPolicy;
  readonly userMessage: string;
  readonly internalDetail?: string;

  constructor(shape: AppErrorShape) {
    super(shape.userMessage, { cause: shape.cause });
    this.name = 'AppError';
    this.code = shape.code;
    this.domain = shape.domain;
    this.httpStatus = shape.httpStatus;
    this.retryPolicy = shape.retryPolicy;
    this.userMessage = shape.userMessage;
    this.internalDetail = shape.internalDetail;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Canonical copy used when coercing a non-`AppError` into one. */
export interface AppErrorFallback {
  code: string;
  domain: ErrorDomain;
  retryPolicy: RetryPolicy;
  userMessage: string;
}

/**
 * Coerce any thrown value into a canonical `AppError` (AGENTS.md rule 7). An already-canonical
 * error passes through untouched; anything else is wrapped with the caller's fallback copy, with
 * the original value kept as `cause` (never surfaced to the user).
 */
export function asAppError(error: unknown, fallback: AppErrorFallback): AppError {
  return isAppError(error) ? error : new AppError({ ...fallback, cause: error });
}
