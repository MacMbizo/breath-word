// Home route — the app opens on the reader (the Read tab). Prayer, journal and library are one
// tap away on the floating pill.
import { Redirect } from 'expo-router';

export default function HomeRoute() {
  return <Redirect href="/read" />;
}
