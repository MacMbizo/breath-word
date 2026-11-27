// FR-105 content library route (mobile) — renders the pack manager over the booted core runtime
// (provided by app/_layout.tsx). Pure presentation: no store, repository, or SQL is touched here.
import { LibraryScreen } from '../../src/app/LibraryScreen';

export default function LibraryRoute() {
  return <LibraryScreen />;
}
