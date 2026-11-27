// Journal tab — the reader's own record: rhythms of reading and the private, encrypted vault.
import { HubScreen } from '../../src/app/nav/Hub';

export default function JournalRoute() {
  return (
    <HubScreen
      title="Journal"
      lede="What God is teaching you, kept privately."
      links={[
        { href: '/habits', title: 'Rhythms & reminders', detail: 'A gentle daily rhythm, never a streak to lose' },
        { href: '/vault', title: 'Private vault', detail: 'End-to-end encrypted notes, only you hold the key' },
      ]}
    />
  );
}
