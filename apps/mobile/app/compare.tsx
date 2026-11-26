// FR-102 compare route (mobile) — renders the parallel-translation compare screen over the
// booted core runtime (provided by app/_layout.tsx). Pure presentation: no store, repository,
// or SQL is touched here.
import { CompareScreen } from '../src/app/CompareScreen';

export default function CompareRoute() {
  return <CompareScreen />;
}
