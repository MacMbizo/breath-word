// FR-103 search route (mobile) — renders the offline FTS5 search screen over the booted core
// runtime (provided by app/_layout.tsx). Pure presentation: no store, repository, or SQL is
// touched here.
import { SearchScreen } from '../src/app/SearchScreen';

export default function SearchRoute() {
  return <SearchScreen />;
}
