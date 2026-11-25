import { describe, expect, it } from 'vitest';

import { AppError, isAppError } from '../src/errors/AppError';

describe('AppError (C3 §4.1)', () => {
  it('carries the canonical shape and extends Error', () => {
    const err = new AppError({
      code: 'PACK_CHECKSUM_MISMATCH',
      domain: 'PACK',
      retryPolicy: 'USER_ACTION',
      userMessage: 'The download could not be verified.',
      internalDetail: 'sha256 mismatch',
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe('AppError');
    expect(err.code).toBe('PACK_CHECKSUM_MISMATCH');
    expect(err.domain).toBe('PACK');
    expect(err.retryPolicy).toBe('USER_ACTION');
    expect(err.message).toBe('The download could not be verified.');
    expect(err.internalDetail).toBe('sha256 mismatch');
  });

  it('preserves the underlying cause', () => {
    const root = new Error('socket hang up');
    const err = new AppError({
      code: 'SYNC_OFFLINE',
      domain: 'SYNC',
      retryPolicy: 'EXPONENTIAL_BACKOFF',
      userMessage: 'You are offline.',
      cause: root,
    });

    expect(err.cause).toBe(root);
  });

  it('exposes a working type guard', () => {
    expect(isAppError(new AppError({
      code: 'AUTH_REQUIRED',
      domain: 'AUTH',
      retryPolicy: 'USER_ACTION',
      userMessage: 'Please sign in.',
    }))).toBe(true);
    expect(isAppError(new Error('plain'))).toBe(false);
  });
});
