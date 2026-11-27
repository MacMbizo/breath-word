// FR-202 prayer pools route (mobile) — renders the pools screen over the booted core runtime
// (provided by app/_layout.tsx). Pure presentation: no store internals, repository, or SQL here.
import { PoolsScreen } from '../src/app/PoolsScreen';

export default function PoolsRoute() {
  return <PoolsScreen />;
}
