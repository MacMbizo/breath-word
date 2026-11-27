// FR-206 Private Vault wizard route (mobile) — renders the wizard over the booted core runtime
// (provided by app/_layout.tsx). Pure presentation: no store internals, repository, or SQL.
import { VaultWizardScreen } from '../src/app/VaultWizardScreen';

export default function VaultRoute() {
  return <VaultWizardScreen />;
}
