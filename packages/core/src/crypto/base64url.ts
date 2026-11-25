// Base64url (RFC 4648 §5, unpadded) — implemented in pure TypeScript so that
// packages/core needs zero DOM/btoa dependencies and behaves identically on every platform.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function b64Char(index: number): string {
  return ALPHABET.charAt(index);
}

function decodeChar(ch: string): number {
  return ALPHABET.indexOf(ch);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? (bytes[i + 1] ?? 0) : 0;
    const b2 = hasB2 ? (bytes[i + 2] ?? 0) : 0;

    out += b64Char(b0 >> 2);
    out += b64Char(((b0 & 0x03) << 4) | (b1 >> 4));
    if (hasB1) {
      out += b64Char(((b1 & 0x0f) << 2) | (b2 >> 6));
    }
    if (hasB2) {
      out += b64Char(b2 & 0x3f);
    }
  }
  return out;
}

export function base64UrlToBytes(input: string): Uint8Array {
  let len = input.length;
  while (len > 0 && input.charAt(len - 1) === '=') {
    len -= 1;
  }

  const outLength = Math.floor((len * 6) / 8);
  const out = new Uint8Array(outLength);
  let bits = 0;
  let value = 0;
  let p = 0;

  for (let i = 0; i < len; i += 1) {
    const c = decodeChar(input.charAt(i));
    if (c < 0) {
      throw new RangeError('Invalid base64url character');
    }
    value = (value << 6) | c;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[p] = (value >> bits) & 0xff;
      p += 1;
    }
  }
  return out;
}
