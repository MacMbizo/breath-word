// Metro resolves bundled media to an opaque asset id (B3 §4.1 `apps/mobile/assets`).
declare module '*.wav' {
  const assetId: number;
  export default assetId;
}
