// FR-101 reader route (mobile) — renders the structured reader over the booted core runtime
// (provided by app/_layout.tsx). Pure presentation: no store, repository, or SQL is touched here.
import { ReaderScreen } from '../src/app/ReaderScreen';

export default function ReadScreen() {
  return <ReaderScreen />;
}
