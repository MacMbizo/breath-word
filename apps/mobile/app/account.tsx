// FR-206 account & sync route (mobile) — renders the account screen over the booted core runtime
// (provided by app/_layout.tsx). Pure presentation: no store internals, Supabase import, or SQL.
import { AccountScreen } from '../src/app/AccountScreen';

export default function AccountRoute() {
  return <AccountScreen />;
}
