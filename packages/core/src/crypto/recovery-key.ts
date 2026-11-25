// B6 §4.2 — Recovery Key codec.
// A 32-byte CSPRNG recovery key is shown to the user as 52 Crockford Base32
// characters grouped into 13 blocks of 4 ("XXXX-XXXX-..."). Crockford's alphabet
// omits I, L, O and U so that a hand-copied key cannot be misread (I/L -> 1, O -> 0).

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Recovery key entropy (B6 §4.2). */
export const RECOVERY_KEY_BYTES = 32;

const RECOVERY_KEY_CHARS = 52;
const BLOCK_SIZE = 4;

/** Pack bytes into an unformatted Crockford Base32 string (big-endian bit order). */
export function encodeCrockfordBase32(bytes: Uint8Array): string {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CROCKFORD_ALPHABET.charAt((value >>> bits) & 0x1f);
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) {
    out += CROCKFORD_ALPHABET.charAt((value << (5 - bits)) & 0x1f);
  }
  return out;
}

/** Uppercase, drop separators, and resolve Crockford's ambiguous letters. */
function normalizeCrockford(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
}

/** Unpack a Crockford Base32 string into bytes (trailing pad bits are ignored). */
export function decodeCrockfordBase32(input: string): Uint8Array {
  const symbols = normalizeCrockford(input);
  const out = new Uint8Array(Math.floor((symbols.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let p = 0;
  for (const symbol of symbols) {
    const index = CROCKFORD_ALPHABET.indexOf(symbol);
    if (index < 0) {
      throw new RangeError(`Invalid Crockford Base32 symbol: "${symbol}"`);
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[p] = (value >>> bits) & 0xff;
      p += 1;
    }
    value &= (1 << bits) - 1;
  }
  return out;
}

/** Render a recovery key exactly as displayed to the user: 13 blocks of 4. */
export function formatRecoveryKey(bytes: Uint8Array): string {
  const code = encodeCrockfordBase32(bytes);
  const blocks: string[] = [];
  for (let i = 0; i < code.length; i += BLOCK_SIZE) {
    blocks.push(code.slice(i, i + BLOCK_SIZE));
  }
  return blocks.join('-');
}

/** Parse a user-entered recovery key back into its 32 raw bytes. */
export function parseRecoveryKey(display: string): Uint8Array {
  const normalized = normalizeCrockford(display);
  if (normalized.length !== RECOVERY_KEY_CHARS) {
    throw new RangeError(
      `Recovery key must contain ${RECOVERY_KEY_CHARS} Crockford Base32 characters.`,
    );
  }
  const bytes = decodeCrockfordBase32(normalized);
  if (bytes.length !== RECOVERY_KEY_BYTES) {
    throw new RangeError('Recovery key decoded to an unexpected length.');
  }
  return bytes;
}
