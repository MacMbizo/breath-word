// B6 §4.2 — offline Recovery-Key QR code.
//
// The Recovery Key is scanned into a secondary device (no network, no server). We encode a
// namespaced payload so a scanner can recognise what it holds, and expose the raw module matrix
// as pure TypeScript. Each UI renders that matrix with its own primitive — Skia on mobile,
// inline SVG on desktop — so `packages/core` stays free of DOM/RN imports (AGENTS.md rule 1).

import qrcode from 'qrcode-generator';

import { AppError } from '../errors/AppError';

/** Namespaced payload prefix; a scanner keys off this to know it holds a Recovery Key. */
export const RECOVERY_QR_PREFIX = 'bw-recovery:v1:';

/**
 * Error-correction level `M` (~15% recovery) balances screen glare on a secondary camera against
 * module count, keeping the code scannable at small sizes while remaining offline (B6 §4.2).
 */
const ERROR_CORRECTION_LEVEL = 'M';

/** The payload encoded into the QR code, e.g. `bw-recovery:v1:XXXX-XXXX-…`. */
export function recoveryKeyQrPayload(recoveryKeyDisplay: string): string {
  return `${RECOVERY_QR_PREFIX}${recoveryKeyDisplay}`;
}

/** A square QR module matrix; `matrix[row][col] === true` is a dark module. */
export interface RecoveryQr {
  /** Modules per side (rows === columns). */
  readonly size: number;
  readonly matrix: readonly (readonly boolean[])[];
}

/**
 * Encode a Recovery Key display string into a QR module matrix. Throws a canonical `AppError`
 * only if the display string is empty (a caller bug, not user input — the wizard only reaches
 * this step with a freshly minted key).
 */
export function generateRecoveryQr(recoveryKeyDisplay: string): RecoveryQr {
  if (recoveryKeyDisplay.trim() === '') {
    throw new AppError({
      code: 'CRYPTO_VAULT_LOCKED',
      domain: 'CRYPTO',
      retryPolicy: 'USER_ACTION',
      userMessage: 'There is no Recovery Key to display.',
      internalDetail: 'generateRecoveryQr received an empty recovery key display string.',
    });
  }

  // Type number 0 selects the smallest version that fits the payload.
  const qr = qrcode(0, ERROR_CORRECTION_LEVEL);
  qr.addData(recoveryKeyQrPayload(recoveryKeyDisplay));
  qr.make();

  const size = qr.getModuleCount();
  const matrix: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const line: boolean[] = [];
    for (let col = 0; col < size; col += 1) {
      line.push(qr.isDark(row, col));
    }
    matrix.push(line);
  }
  return { size, matrix };
}

/** Extract the Recovery Key display string from a scanned payload, or `null` if it is foreign. */
export function parseRecoveryQrPayload(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed.startsWith(RECOVERY_QR_PREFIX)) return null;
  const display = trimmed.slice(RECOVERY_QR_PREFIX.length);
  return display === '' ? null : display;
}
