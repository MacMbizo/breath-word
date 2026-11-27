// FR-204 (offline mode) — deterministic, zero-AI prayer prompt templates.
//
// Asserts the offline generator is pure/offline (no I/O), mirrors the `C1 §4.1`
// `PRAYER_PROMPT` response shape, and enforces the B6 privacy guardrail: personal context is
// never included unless `includeUserNotes === true`, and is always clipped to 500 chars.

import { describe, expect, it } from 'vitest';

import type { PrayerCategory } from '../src/domain/types';
import {
  MAX_USER_CONTEXT_CHARS,
  generatePrayerPrompt,
  type PrayerPromptRequest,
  type PromptFramework,
} from '../src/prayer/prompt-templates';

function request(overrides: Partial<PrayerPromptRequest> = {}): PrayerPromptRequest {
  return {
    framework: 'ACTS',
    category: 'ANXIETY',
    passageReference: 'Philippians 4:6-7',
    passageText: 'Be anxious for nothing, but in everything, by prayer and petition, with thanksgiving, present your requests to God.',
    includeUserNotes: false,
    ...overrides,
  };
}

describe('generatePrayerPrompt shape (FR-204 / C1 §4.1)', () => {
  it('returns the PRAYER_PROMPT response shape with staged sections', () => {
    const prompt = generatePrayerPrompt(request());

    expect(prompt.mode).toBe('PRAYER_PROMPT');
    expect(prompt.source).toBe('OFFLINE_TEMPLATE');
    expect(prompt.prayerText).toContain('Philippians 4:6-7');
    expect(prompt.sections.map((section) => section.stage)).toEqual([
      'Adoration',
      'Confession',
      'Thanksgiving',
      'Supplication',
    ]);
    for (const section of prompt.sections) {
      expect(section.prompt.length).toBeGreaterThan(0);
    }
  });

  it('produces the canonical stage set for each framework', () => {
    const stages: Record<PromptFramework, string[]> = {
      LECTIO_DIVINA: ['Lectio', 'Meditatio', 'Oratio', 'Contemplatio'],
      THREE_RS: ['Rejoice', 'Repent', 'Request'],
      ACTS: ['Adoration', 'Confession', 'Thanksgiving', 'Supplication'],
      BREATH: ['Inhale', 'Exhale'],
    };

    for (const [framework, expected] of Object.entries(stages)) {
      const prompt = generatePrayerPrompt(request({ framework: framework as PromptFramework }));
      expect(prompt.sections.map((section) => section.stage)).toEqual(expected);
    }
  });

  it('is deterministic and synchronous — identical inputs, identical output, no promises', () => {
    const req = request({ framework: 'LECTIO_DIVINA', includeUserNotes: true, optionalUserContext: 'I am worried about work.' });
    const first = generatePrayerPrompt(req);
    const second = generatePrayerPrompt(req);

    expect(second).toEqual(first);
    expect(first).not.toBeInstanceOf(Promise);
  });

  it('embeds an optional literary-genre framing when supplied', () => {
    const withGenre = generatePrayerPrompt(request({ genre: 'GOSPEL' })).prayerText;
    const withoutGenre = generatePrayerPrompt(request()).prayerText;

    expect(withGenre).toContain('as the good news of Jesus');
    expect(withoutGenre).not.toContain('as the good news of Jesus');
  });
});

describe('generatePrayerPrompt privacy guardrail (B6 / C1 §4.1)', () => {
  it('never includes personal context when includeUserNotes is false', () => {
    const prompt = generatePrayerPrompt(
      request({ includeUserNotes: false, optionalUserContext: 'My secret worry about money.' }),
    );

    const flat = `${prompt.prayerText} ${prompt.sections.map((section) => section.prompt).join(' ')}`;
    expect(flat).not.toContain('secret worry');
  });

  it('includes personal context only when includeUserNotes is true', () => {
    const prompt = generatePrayerPrompt(
      request({ includeUserNotes: true, optionalUserContext: 'My secret worry about money.' }),
    );

    const flat = `${prompt.prayerText} ${prompt.sections.map((section) => section.prompt).join(' ')}`;
    expect(flat).toContain('My secret worry about money.');
  });

  it('clips the personal context to 500 characters', () => {
    const long = 'x'.repeat(MAX_USER_CONTEXT_CHARS + 200);
    const prompt = generatePrayerPrompt(request({ includeUserNotes: true, optionalUserContext: long }));

    const section = prompt.sections.find((candidate) => candidate.prompt.includes('Bring this before Him'));
    expect(section).toBeDefined();
    const embedded = section!.prompt.split('Bring this before Him: ')[1]!.replace(/\.$/, '');
    expect(embedded.replace('…', '')).toHaveLength(MAX_USER_CONTEXT_CHARS);
  });

  it('treats blank or absent context as null even when includeUserNotes is true', () => {
    const blank = generatePrayerPrompt(request({ includeUserNotes: true, optionalUserContext: '   ' }));
    const absent = generatePrayerPrompt(request({ includeUserNotes: true }));

    expect(blank).toEqual(generatePrayerPrompt(request({ includeUserNotes: false })));
    expect(absent).toEqual(generatePrayerPrompt(request({ includeUserNotes: false })));
  });

  it('covers every prayer category with its own framing', () => {
    const categories: PrayerCategory[] = [
      'ANXIETY',
      'GUIDANCE',
      'THANKSGIVING',
      'FAMILY',
      'FINANCE',
      'HEALING',
      'CUSTOM',
    ];
    const texts = categories.map(
      (category) => generatePrayerPrompt(request({ category })).sections[1]!.prompt,
    );
    expect(new Set(texts).size).toBe(categories.length);
  });
});
