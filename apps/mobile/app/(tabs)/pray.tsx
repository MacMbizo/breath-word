// Pray tab — a calm hub for every prayer surface (FR-201..205).
import { HubScreen } from '../../src/app/nav/Hub';

export default function PrayRoute() {
  return (
    <HubScreen
      title="Pray"
      lede="Be still, and pray the Word back to God."
      links={[
        { href: '/breath', title: 'Breath prayer', detail: 'A slow, paced breath with a line of Scripture' },
        { href: '/prayer-session', title: 'Prayer session', detail: 'Move through your prayer list one card at a time' },
        { href: '/prayer-engines', title: 'Guided prayer', detail: 'ACTS, the Lord’s Prayer and other patterns' },
        { href: '/pools', title: 'Prayer pools', detail: 'Pray with friends from a shared list' },
      ]}
    />
  );
}
