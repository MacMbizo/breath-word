// B4 §4.3 — every synced row uses a UUID v4 `id` primary key.
//
// `packages/core` stays platform-agnostic, so the caller supplies the CSPRNG byte source
// (`CryptoPrimitivesAdapter.randomBytes` on both Mobile and Desktop). RFC 4122 version 4
// (random) with variant 1.

const UUID_BYTE_LENGTH = 16;

/** Generate an RFC 4122 v4 UUID string from a 16-byte CSPRNG source. */
export function uuidV4(randomBytes: (length: number) => Uint8Array): string {
  const bytes = randomBytes(UUID_BYTE_LENGTH);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant 1 (RFC 4122)
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
