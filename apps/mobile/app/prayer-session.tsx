// FR-203 prayer rotation session route (mobile) — renders the swipe deck over the booted core
// runtime (provided by app/_layout.tsx). Pure presentation: no store internals, repository, or SQL.
import { PrayerSessionScreen } from '../src/app/PrayerSessionScreen';

export default function PrayerSessionRoute() {
  return <PrayerSessionScreen />;
}
