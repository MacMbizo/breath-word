// FR-205 guided prayer engines route (mobile) — renders the four engines over the booted core
// runtime (provided by app/_layout.tsx). Pure presentation: no store internals, repository, or SQL.
import { EngineScreen } from '../src/app/EngineScreen';

export default function PrayerEnginesRoute() {
  return <EngineScreen />;
}
