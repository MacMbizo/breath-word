// Theographic Bible Metadata (Robert Rouse; CC BY-SA 4.0) → `FactbookEntityInput[]` (FR-303).
//
// Inputs are the Airtable exports from github.com/robertrouse/theographic-bible-metadata/json:
// `people.json`, `places.json` and `verses.json` (each `[{ id, fields }]`). Entity → verse links are
// record ids, resolved through `verses.json`, whose `verseID` is already BBCCCVVV (`"01001001"`).
// Summaries use the bundled Easton's Bible Dictionary text (public domain), cut to a short lead.
//
// ShareAlike: a pack built from this data must be published under CC BY-SA 4.0 (`study-refs-pack`
// enforces that), keeping the obligation isolated to `study_refs.sqlite` (B5).

import type { FactbookEntityInput } from '../study-refs-pack';

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

const SUMMARY_MAX = 320;

function str(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim().length > 0 ? value.trim() : undefined;
  if (Array.isArray(value)) return str(value.filter((v) => typeof v === 'string').join(' '));
  return undefined;
}

function num(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** First sentences of a dictionary article, at most `SUMMARY_MAX` characters. */
function lead(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const clean = text.replace(/\s+/g, ' ').replace(/^=\s*/, '').trim();
  if (clean.length <= SUMMARY_MAX) return clean;
  const cut = clean.slice(0, SUMMARY_MAX);
  const sentenceEnd = cut.lastIndexOf('. ');
  return sentenceEnd > 80 ? cut.slice(0, sentenceEnd + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

function yearLabel(year: number): string {
  return year < 0 ? `${-year} BC` : `AD ${year}`;
}

function aliasesFrom(...values: unknown[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const text = str(value);
    if (text === undefined) continue;
    for (const part of text.split(',')) {
      const alias = part.trim();
      if (alias.length > 0) out.add(alias);
    }
  }
  return [...out];
}

function slugId(prefix: string, record: AirtableRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = str(record.fields[key]);
    if (value !== undefined) return `${prefix}:${value.toLowerCase().replace(/[^a-z0-9_.-]+/g, '_')}`;
  }
  return undefined;
}

export interface TheographicInput {
  people: AirtableRecord[];
  places: AirtableRecord[];
  verses: AirtableRecord[];
}

export function parseTheographic(input: TheographicInput): FactbookEntityInput[] {
  const verseIdByRecord = new Map<string, number>();
  for (const verse of input.verses) {
    const id = num(verse.fields.verseID);
    if (id !== undefined) verseIdByRecord.set(verse.id, id);
  }
  const versesOf = (record: AirtableRecord): number[] => {
    const links = Array.isArray(record.fields.verses) ? (record.fields.verses as unknown[]) : [];
    return links
      .map((link) => (typeof link === 'string' ? verseIdByRecord.get(link) : undefined))
      .filter((id): id is number => id !== undefined)
      .sort((a, b) => a - b);
  };

  const entities: FactbookEntityInput[] = [];
  const seen = new Set<string>();
  const push = (entity: FactbookEntityInput): void => {
    if (entity.verseIds.length === 0 || seen.has(entity.entityId)) return;
    seen.add(entity.entityId);
    entities.push(entity);
  };

  for (const person of input.people) {
    const name = str(person.fields.displayTitle) ?? str(person.fields.name);
    const entityId = slugId('person', person, 'slug', 'personLookup');
    if (name === undefined || entityId === undefined) continue;
    const verseIds = versesOf(person);
    const min = num(person.fields.minYear);
    const max = num(person.fields.maxYear);
    const gender = str(person.fields.gender)?.toLowerCase();
    push({
      entityId,
      entityType: 'person',
      name,
      aliases: aliasesFrom(person.fields.alsoCalled).filter((alias) => alias !== name),
      summary:
        lead(str(person.fields.dictText) ?? str(person.fields.dictionaryText)) ??
        `${name}${gender !== undefined ? `, a ${gender} figure` : ''} mentioned in ${verseIds.length} verse${verseIds.length === 1 ? '' : 's'}.`,
      ...(min !== undefined && max !== undefined
        ? { eraLabel: min === max ? yearLabel(min) : `${yearLabel(min)} – ${yearLabel(max)}` }
        : {}),
      metadata: {
        ...(gender !== undefined ? { gender } : {}),
        source: 'Theographic Bible Metadata',
      },
      verseIds,
    });
  }

  for (const place of input.places) {
    const name = str(place.fields.displayTitle) ?? str(place.fields.kjvName);
    const entityId = slugId('place', place, 'slug', 'placeLookup');
    if (name === undefined || entityId === undefined) continue;
    const latitude = num(place.fields.latitude);
    const longitude = num(place.fields.longitude);
    const verseIds = versesOf(place);
    const featureType = str(place.fields.featureType);
    push({
      entityId,
      entityType: 'place',
      name,
      aliases: aliasesFrom(place.fields.aliases, place.fields.otherNames, place.fields.esvName, place.fields.kjvName).filter(
        (alias) => alias !== name,
      ),
      summary:
        lead(str(place.fields.dictText) ?? str(place.fields.dictionaryText)) ??
        `${featureType ?? 'Place'} mentioned in ${verseIds.length} verse${verseIds.length === 1 ? '' : 's'}.`,
      ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
      metadata: {
        ...(featureType !== undefined ? { featureType } : {}),
        source: 'Theographic Bible Metadata',
      },
      verseIds,
    });
  }

  return entities;
}
