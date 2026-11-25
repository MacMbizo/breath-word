# D1: Design System & Motion Tokens (`packages/tokens`)

**Document ID:** `D1`  
**Version:** `1.0.0`  
**Status:** `Approved`  
**Owner:** Founder / Design  
**Last Updated:** `2026-11-24`  
**Related Docs:** `A1`, `B3`, `B7`, `B8` (`ADR-001`), `D3`

## Purpose & Scope

Defines the visual identity, 4-theme color palette, sacred editorial typography (including Hebrew RTL & polytonic Greek), spacing scale, inductive highlight semantics, and shared 120Hz animation spring presets exported from `packages/tokens` to both `apps/mobile` and `apps/desktop`.

## Audience

Developer and AI coding partner styling React Native (Expo) and Tailwind CSS (Tauri/Web). **No hard-coded hex values or arbitrary animation durations inside UI components—import strictly from `@breath-and-word/tokens`.**

## Body

### 4.1 Aesthetic Direction: "Sacred Editorial Calm"

- Feels like a finely bound linen study Bible merged with an atmospheric evening prayer sanctuary—**zero** neon gamification, noisy streak flames, or cluttered toolbars.
- High typographic craft: generous line heights (`1.65–1.8`), optimal measure (`60–68ch` centered column on iPad/Desktop), delicate verse superscripts, and tactile, unhurried spring physics.

### 4.2 Four Semantic Themes (`packages/tokens/src/colors.ts`)

| Token | Daylight (Crisp Paper) | Parchment (Warm Study) | Midnight (OLED Study) | Sanctuary (Prayer Ambient) |
| --- | :---: | :---: | :---: | :---: |
| `bg.canvas` | `#FAF9F6` | `#F5EFE4` | `#0F1115` | `#090D16` |
| `bg.surface` | `#FFFFFF` | `#FBF7F0` | `#171A21` | `#111827` |
| `bg.elevated` | `#F2EFE9` | `#EAE0CE` | `#202530` | `#1B2436` |
| `text.primary` | `#1C1917` | `#2B2118` | `#E8E6E1` | `#EDF2F7` |
| `text.secondary` | `#57534E` | `#6B5B4B` | `#9CA3AF` | `#94A3B8` |
| `text.verseNum` | `#A8A29E` | `#9C8873` | `#64748B` | `#64748B` |
| `text.redLetter` | `#991B1B` | `#8F2424` | `#F87171` | `#FCA5A5` |
| `accent.primary` | `#2B5B6C` *(Deep Teal)* | `#7C4D2B` *(Warm Cedar)* | `#60A5FA` *(Calm Sky)* | `#818CF8` *(Twilight Indigo)* |
| `accent.breathGlow` | `#3B82F6` | `#B45309` | `#38BDF8` | `#6366F1` → `#38BDF8` |
| `border.subtle` | `#E7E5E4` | `#DFD3BE` | `#262B36` | `#1E293B` |

### 4.3 Inductive Observation Highlight Palette (WCAG AA Safe Over All 4 Themes)

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
| **Scripture Body** | `Literata` (Variable Serif) *(toggleable to `Inter` Sans)* | `16–28px` (user slider, default `19px`) | `1.72` | Supports optical sizing, crisp italics, small-caps for `LORD`. |
| **Section Headings** | `Literata SemiBold` | `1.15× body` | `1.35` | `marginTop: 24px`, `marginBottom: 8px`. |
| **UI Chrome & Controls** | `Inter` (Variable Sans) | `12 / 14 / 16 / 20px` | `1.4` | Tabular numerals (`tnum`) for verse counts & timers. |
| **Hebrew / Aramaic** | `SBL Hebrew` (bundled `.ttf`) | `1.35× body` | `1.9` | **Mandatory `direction: rtl` + `unicode-bidi: isolate`** so nikud/cantillation marks never clip. |
| **Polytonic Greek** | `Gentium Plus` / `SBL Greek` (bundled `.ttf`) | `1.15× body` | `1.75` | Full breathing marks, accents, and iota subscripts. |

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

## Acceptance / Done Criteria

- All text/background and highlight/text pairings pass WCAG 2.2 AA contrast (`≥4.5:1` normal text, `≥3:1` large text/icons) across all 4 themes.
- Hebrew nikud vowels and Greek polytonic accents render cleanly without clipping on Android, iPadOS, Windows 11, and macOS.
- `packages/tokens` exports both plain TS objects (for Expo RN) and generated CSS custom properties (for Tauri Tailwind).

## Open Questions

- None.

## Assumptions

- `[ASSUMPTION]` `Literata`, `Inter`, `SBL Hebrew`, and `Gentium Plus` (all SIL OFL / free redistribution) are bundled in app assets (~2.5 MB total subsetted).

## Change Log

- `1.0.0` | `2026-11-24` | Athena | Complete Sacred Editorial Calm design system, 4 themes, inductive highlight palette, Hebrew/Greek typography, and shared spring/breath motion tokens.

## Traceability

- Upstream: `A1`, `B3`, `B7`, `B8` (`ADR-001`). Downstream: `D3`, `F1`.
