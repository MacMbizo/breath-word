// FR-107 habits, reminders & ESV cache route (mobile) — renders the habits screen over the booted
// core runtime (provided by app/_layout.tsx). Pure presentation: no store internals, repository, or SQL.
import { HabitsScreen } from '../src/app/HabitsScreen';

export default function HabitsRoute() {
  return <HabitsScreen />;
}
