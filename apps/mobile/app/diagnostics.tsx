// Dev-only route for the Gate-1 spike harness (see src/app/SpikeDiagnostics.tsx).
// Not part of the shipped product surface; it exists to measure the device-only spikes.

import { SpikeDiagnostics } from '../src/app/SpikeDiagnostics';

export default function DiagnosticsScreen() {
  return <SpikeDiagnostics />;
}
