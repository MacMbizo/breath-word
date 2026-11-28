# D1: Design System & Motion Tokens (`packages/tokens`)

**Document ID:** `D1`  
**Version:** `1.3.0`  
**Status:** `Approved`  
**Owner:** Founder / Design  
**Last Updated:** `2026-11-28`  
**Related Docs:** `A1`, `B3`, `B7`, `B8` (`ADR-001`), `D3`

## Purpose & Scope

Defines the visual identity, 3-theme color palette (Parchment · Selah · Lamplight), sacred editorial typography (including Hebrew RTL & polytonic Greek), spacing scale, inductive highlight semantics, and shared 120Hz animation spring presets exported from `packages/tokens` to both `apps/mobile` and `apps/desktop`.

## Audience

Developer and AI coding partner styling React Native (Expo) and Tailwind CSS (Tauri/Web). **No hard-coded hex values or arbitrary animation durations inside UI components—import strictly from `@breath-and-word/tokens`.**

## Body

### 4.1 Aesthetic Direction: "Sacred Editorial Calm"

- Feels like a finely bound linen study Bible merged with an atmospheric evening prayer sanctuary—**zero** neon gamification, noisy streak flames, or cluttered toolbars.
- High typographic craft: generous line heights (`1.65–1.8`), optimal measure (`60–68ch` centered column on iPad/Desktop), delicate verse superscripts, and tactile, unhurried spring physics.

### 4.2 Three Semantic Themes (`packages/tokens/src/colors.ts`) — design round 2026-11-28

Chosen by the founder from three explored directions (design canvas rows D/E): **Parchment** (warm day page, from "Vellum"), **Selah** (the calm theme: cool, airy, quiet ornament — the default for new installs) and **Lamplight** (night study). "Lamplight when my device is dark" (on by default) follows the OS colour scheme. The previous Daylight/Midnight/Sanctuary themes are retired; a stored retired name falls back to the default.

Every theme carries the same **colour roles**, so screens never branch on the theme:

| Role | Used for | Parchment | Selah | Lamplight |
| --- | --- | :---: | :---: | :---: |
| `bg.canvas` | page | `#F4EEE3` | `#F7F7F4` | `#12100E` |
| `bg.surface` | cards, sheets, floating study card | `#FBF8F2` | `#FFFFFF` | `#1F1B17` |
| `bg.elevated` | chips, passage pill, secondary buttons | `#EBE2D3` | `#ECEEE9` | `#2A2520` |
| `bg.sunken` | segmented tracks, wells | `#EFE7DA` | `#F0F2EE` | `#15120F` |
| `text.primary` | body | `#2A211A` | `#1E2320` | `#EDE6DA` |
| `text.secondary` | secondary text | `#6B5A49` | `#5D6660` | `#A89D8E` |
| `text.verseNum` | verse numbers | `#7A2E24` | `#5F6B65` | `#E8806B` |
| `text.redLetter` | words of Christ | `#8C2B20` | `#9A3B2E` | `#E8806B` |
| `text.onAccent` | text on an accent fill | `#FFFFFF` | `#FFFFFF` | `#12100E` |
| `accent.primary` | **the one interactive colour** | `#3E6B5E` *(sage)* | `#3E6B5E` *(sage)* | `#E0A458` *(amber)* |
| `accent.wash` / `onWash` | tapped / selected word | `#D6E3DC` / `#1F3A32` | `#D6E6DF` / `#1F3A32` | `#E0A458` / `#12100E` |
| `accent.rubric` | **rubrics only**: chapter numeral, wordmark "&" | `#7A2E24` *(oxblood)* | `#3E6B5E` | `#E8806B` *(coral)* |
| `border.subtle` / `strong` | hairlines | `#DCCFB9` / `#C9B79C` | `#E2E5E1` / `#CBD1CC` | `#2B2621` / `#3A332B` |
| `nav.*` | floating pill nav (bg · icon · active bg · active icon) | `#2A211A` · `#D9CCB6` · `#3E6B5E` · `#FFFFFF` | `#1E2320` · `#C9D3CE` · `#3E6B5E` · `#FFFFFF` | `#2A2520` · `#C9BEAF` · `#E0A458` · `#12100E` |

`packages/tokens/test/contrast.test.ts` asserts WCAG 2.2 AA for 15 role pairs in every theme (45 checks); a palette change that breaks one fails the gate.

**Layout principles (same round):** mobile uses a floating pill navigation (Read · Pray · Journal · Library) and a floating word card above it; desktop uses a collapsible side panel (wordmark, navigation, translation · compare · focus, theme picker) and a floating study card that collapses to a tool strip (with an inline quick look for tapped words). Panel state, theme, word view (Card · Interlinear), text size and the last passage are device-local preferences (`workspace_state.appearance`, never synced).

### 4.3 Inductive Observation Highlight Palette (WCAG AA Safe Over All 3 Themes)

| Symbol Tag (`B4`) | Meaning | Light/Parchment Wash | Dark/Sanctuary Wash | Symbolic Margin Badge |
| --- | --- | :---: | :---: | :---: |
| `KEY_TERM` | Repeated theme/word | `#FEF08A` (45%) | `#CA8A04` (32%) | Diamond `◇` |
| `GOD_REF` | Father / Christ / Spirit | `#DDD6FE` (50%) | `#7C3AED` (32%) | Triangle `△` |
| `TRANSITION` | *Therefore, because, but* | `#BBF7D0` (48%) | `#16A34A` (30%) | Arrow `↳` |
| `PROMISE` | Covenant / assurance | `#BAE6FD` (48%) | `#0284C7` (32%) | Star `✦` |
| `COMMAND` | Imperative / obedience | `#FECACA` (48%) | `#DC2626` (30%) | Check `✓` |

### 4.4 Typography & Original-Language Font Stack (`packages/tokens/src/typography.ts`)

| Role | Font Family | Size Scale | Line Height | Notes |
| --- | --- | :---: | :---: | --- |
| **Scripture Body** | `Literata` *(toggleable to `Inter` Sans)* | `16–28px` (user setting, default `19px`) | `1.72` (`1.82` in Selah) | Optical sizing, crisp italics. |
| **Chapter numeral** | `Cormorant Garamond` SemiBold (desktop, `font-variant-numeric: lining-nums`); `Literata` Medium on mobile | `58–72px` | `1.05` | Coloured `accent.rubric`. Mobile uses Literata because the bundled Cormorant build's old-style "1" reads as "I" and Android ignores `lnum`. |
| **Display & wordmark** | `Cormorant Garamond` | `27–44px` | `1.1` | Hub titles, "Breath & Word" wordmark (rubric "&"). |
| **Section Headings** | `Literata` Italic | `1× body` | `1.35` | Inline in the verse flow. |
| **UI Chrome & Controls** | `Inter` 400 / 500 / 600 | `12 / 14 / 16 / 20px` | `1.4` | React Native selects weights by face name (`FONT_FACES`), not `fontWeight`. |
| **Hebrew / Aramaic** | `Noto Serif Hebrew` | `1.35× body` | `1.9` | **Mandatory `direction: rtl` + `unicode-bidi: isolate`** (mobile: RLI…PDI isolates). Replaces `SBL Hebrew`, whose licence does not permit app bundling. |
| **Polytonic Greek** | `Gentium Book Plus` | `1.15× body` | `1.75` | Full breathing marks, accents, and iota subscripts. |

All five families are SIL OFL and **bundled** (never fetched at runtime): desktop via `@fontsource/*`, mobile via `@expo-google-fonts/*` per-weight imports loaded at boot (`apps/mobile/src/theme/fonts.ts`).

### 4.5 Shared Animation & Spring Physics (`packages/tokens/src/motion.ts`)

```typescript
export const MOTION_SPRINGS = {
  /** Tap-to-Capture floating bar, popover reveals */
  snappy: { stiffness: 420, damping: 32, mass: 0.8 },
  /** Bottom sheets, morphology drawer, parallel compare */
  sheet: { stiffness: 300, damping: 34, mass: 1.0 },
  /** Prayer Deck card swipe settle, Focus Mode chrome fade */
  gentle: { stiffness: 180, damping: 26, mass: 1.0 },
} as const;

export const BREATH_EASING = {
  /** Smooth sine-in-out curve for 120Hz inhale (2-4s) and exhale (4-6s) expansion */
  bezier: [0.37, 0, 0.63, 1] as const,
  minScale: 0.62,
  maxScale: 1.0,
  holdPauseMs: 400,
} as const;
```

### 4.6 Core Component Inventory (Shared Semantics Across Mobile & Desktop)

`VerseBlock`, `ParallelColumnSync`, `FloatingCaptureBar`, `PrayerPoolCard`, `SwipePrayerDeck`, `BreathRingCanvas`, `MorphologyInspector`, `InductiveToolbar`, `SkiaInkCanvas`, `AmbientAudioMiniPlayer`, `VaultUnlockSheet`, `GroundedCitationPill`.

### 4.7 Scripture Signals (`FR-501`–`FR-507`) — design round 2026-11-28

Canvas: https://claude.ai/artifact/UjW6NYcCWGryuyZAeWkkdR (boards A–F). The owner liked all three on-page treatments, so
they ship as **three depths of one system**, all drawn from the same `study_signals` data:

1. **Read — quiet margin signs (board A, default).** A small sign in the verse gutter. A promise with a condition gets
   a dotted underline under the condition ("your part") and a solid underline under the promise.
2. **Look closer — labelled card (boards B + D).** Tapping a signed verse opens its card: category label, "Your part" /
   "His promise" split, "A prayer to begin", **Pray this promise** (primary), Keep in a pool, Linked passages, and the
   source compilation's name.
3. **Search — focus pills (board C).** The Signals button reveals pills with chapter counts (Promises · Commands ·
   Warnings · Wisdom) plus named collections; choosing one lights that category and dims the rest of the chapter.

Reading settings gain **Signals style: Quiet (A) · Labelled (B: every signed verse in its soft wash) · Off**.
Prayer surfaces: "Promises for when I'm…" (board E) and Today's promise + promises you kept (board F).

| Category | Sign (meaningful, not generic) | Selah | Parchment | Lamplight |
| --- | --- | --- | --- | --- |
| Promise | Rainbow arc — the covenant sign | `#8A5D0C` | `#80560A` | `#E8B96A` |
| Command | Two stone tablets | `#3E6B5E` | `#3E6B5E` | `#8CC5B0` |
| Warning | Shofar — the watchman's horn | `#9A3B2E` | `#8C2B20` | `#EE9580` |
| Wisdom | Oil lamp | `#4B5A8A` | `#45527F` | `#AEB9E8` |

Rules: meaning is never colour alone (sign + label); washes are the category colour at 9–10 % (light) / 13–14 % (dark);
the dimmed text in focus mode must still pass 4.5:1; focus-mode dimming respects Reduced Motion (no fade, instant);
the curated layer can be hidden and personal signals (`FR-506`) are styled distinctly. Colours above are mockup values —
add them to `packages/tokens` as `signal.*` roles and extend the contrast test before use.

### 4.8 Reference mockup v2 (adopted 2026-11-28)

[`mockups/breath-and-word-editorial-mockups-v2.html`](mockups/breath-and-word-editorial-mockups-v2.html) (made in
Antigravity from boards A–F of §4.7 and the owner's reference images) is the **primary visual reference for Phase 4**.
Open it in a browser; it has a 5-screen mobile board, a desktop/iPad studio view, theme switches and a greyscale check.

Adopted from it:
- **Quiet Page / Study Cards** switch on the reader (= the Signals style setting, placed on the page).
- **Count chips under the chapter numeral** (All · N, then each sign with its count) as the category filter.
- **Tappable blank in "A prayer to begin"** ("I acknowledge you in [this decision ✎] today") so the prayer becomes the
  reader's own in one tap; "Type own" for free text.
- **Desktop/iPad:** side rail → reading page → promise card in a third column.
- **Truth Chain** as a vertical thread from the anchor verse to linked passages, each naming its source.
- **Unfolding Story:** era timeline (Genesis → Exodus → David → Kings → Exile → Acts), "Written inside this cave"
  markers for psalms placed in their narrative, place pin from `factbook_entities`.

Not adopted / must change before build:
1. Text attributed to real sources in the mockup is **invented** (the "Faith's Checkbook" reflection, Clarke section
   names, OpenBible vote counts). Real text comes only from the sources.
2. Truth Chain link **types** (Precedent, Contrast, Fruit) are not in OpenBible or TSK data, which are untyped. Show
   untyped links plus the reader's own notes unless a source that types them is found.
3. Unfolding Story dates and order must come from a sourced chronology, shown as approximate.
4. The mockup loads Tailwind from a CDN and hard-codes colours: it is a picture to build from, not code. The apps use
   `@breath-and-word/tokens` only.

## Acceptance / Done Criteria

- All text/background and highlight/text pairings pass WCAG 2.2 AA contrast (`≥4.5:1` normal text, `≥3:1` large text/icons) across all 3 themes (enforced by `packages/tokens/test/contrast.test.ts`).
- Hebrew nikud vowels and Greek polytonic accents render cleanly without clipping on Android, iPadOS, Windows 11, and macOS.
- `packages/tokens` exports both plain TS objects (for Expo RN) and generated CSS custom properties (for Tauri Tailwind).

## Open Questions

- None.

## Assumptions

- `Literata`, `Inter`, `Cormorant Garamond`, `Gentium Book Plus` and `Noto Serif Hebrew` (all SIL OFL) are bundled in app assets — only the weights in `FONT_FACES` on mobile.

## Change Log

- `1.3.0` | `2026-11-28` | Claude | §4.8 adopts the Antigravity editorial mockup v2 (stored in `docs/design/mockups/`) as the Phase 4 visual reference, with four corrections (invented attributions, untyped links, sourced chronology, tokens only).
- `1.2.0` | `2026-11-28` | Claude | §4.7 Scripture Signals: quiet margin signs, labelled card and focus pills as three depths of one system; Signals style setting; category signs and mockup colours.
- `1.1.0` | `2026-11-28` | Claude | Design round 2026-11-28: three themes (Parchment · Selah · Lamplight) with shared colour roles (accent = interactive, rubric = chapter numeral and "&", wash = tapped word, nav = pill), contrast test, Cormorant display face, Noto Serif Hebrew replaces SBL Hebrew, fonts bundled, layout principles (pill nav, floating study card, collapsible panels).
- `1.0.0` | `2026-11-24` | Athena | Complete Sacred Editorial Calm design system, 4 themes, inductive highlight palette, Hebrew/Greek typography, and shared spring/breath motion tokens.

## Traceability

- Upstream: `A1`, `B3`, `B7`, `B8` (`ADR-001`). Downstream: `D3`, `F1`.
