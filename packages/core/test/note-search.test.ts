// ADR-004 / B3 §4.1 `search/` — the volatile decrypted-note index is in-memory only and is
// destroyed on vault lock (B6 §4.2.4). These tests pin its behaviour and the purge guarantee.

import { describe, expect, it } from 'vitest';

import { NoteSearchIndex, type NoteSearchDocument } from '../src/search';

const NOTES: NoteSearchDocument[] = [
  { id: 's1', source: 'note', text: 'Please heal my grandmother', poolId: 'p1' },
  { id: 's2', source: 'testimony', text: 'God provided a new job', poolId: 'p1' },
  { id: 's3', source: 'journal', text: 'Grateful for the morning psalm' },
];

describe('NoteSearchIndex (ADR-004 — volatile decrypted-note search)', () => {
  it('is inactive and empty until rebuilt', () => {
    const index = new NoteSearchIndex();
    expect(index.active).toBe(false);
    expect(index.size).toBe(0);
    expect(index.search('anything')).toEqual([]);
  });

  it('rebuilds from decrypted notes and matches text', () => {
    const index = new NoteSearchIndex();
    index.rebuild(NOTES);
    expect(index.active).toBe(true);
    expect(index.size).toBe(3);
    expect(index.search('heal').map((hit) => hit.id)).toEqual(['s1']);
    expect(index.search('provided').map((hit) => hit.id)).toEqual(['s2']);
  });

  it('returns source and pool context with each hit', () => {
    const index = new NoteSearchIndex();
    index.rebuild(NOTES);
    const [hit] = index.search('grandmother');
    expect(hit?.source).toBe('note');
    expect(hit?.poolId).toBe('p1');
  });

  it('adds, replaces and removes single notes', () => {
    const index = new NoteSearchIndex();
    index.rebuild(NOTES);

    index.add({ id: 's1', source: 'note', text: 'Updated: healing for mum', poolId: 'p1' });
    expect(index.search('heal').map((hit) => hit.id)).toEqual(['s1']);
    expect(index.search('grandmother')).toEqual([]);
    expect(index.size).toBe(3);

    index.add({ id: 's9', source: 'journal', text: 'a fresh entry' });
    expect(index.size).toBe(4);

    index.remove('s2');
    expect(index.size).toBe(3);
    expect(index.search('provided')).toEqual([]);
  });

  it('ignores add/remove while purged', () => {
    const index = new NoteSearchIndex();
    index.purge();
    index.add({ id: 's1', source: 'note', text: 'ignored' });
    index.remove('s1');
    expect(index.active).toBe(false);
    expect(index.size).toBe(0);
  });

  it('purge drops every indexed term (B6 §4.2.4)', () => {
    const index = new NoteSearchIndex();
    index.rebuild(NOTES);
    expect(index.search('heal')).toHaveLength(1);

    index.purge();

    expect(index.active).toBe(false);
    expect(index.size).toBe(0);
    expect(index.search('heal')).toEqual([]);
  });
});
