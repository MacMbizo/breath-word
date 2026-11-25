<div align="center">

# Breath & Word

**A local-first, privacy-respecting Bible study and Scripture prayer studio.**

Read deeply · Study accurately · Pray personally

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![CI](https://github.com/MacMbizo/breath-word/actions/workflows/ci.yml/badge.svg)](https://github.com/MacMbizo/breath-word/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-12.9.1-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.x-EF4444?logo=turborepo&logoColor=white)](https://turbo.build/)
[![Expo SDK 58](https://img.shields.io/badge/Expo-SDK%2058-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-0.88-61DAFB?logo=react&logoColor=white)](https://reactnative.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![Platforms](https://img.shields.io/badge/platforms-Android%20%7C%20iPadOS%20%7C%20Windows%20%7C%20macOS%20%7C%20Web-informational)](#platforms)
[![Local-first](https://img.shields.io/badge/architecture-local--first%20%C2%B7%20offline%20ready-success)](#architecture)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

**Breath & Word** unites serene daily Scripture reading, open-data exegetical study, and a
zero-friction Scripture praying engine into a single **local-first, privacy-respecting** app —
designed to feel like a calm physical study Bible on Android, a stylus study desk on iPadOS, and a
multi-pane research studio on the desktop.

It is built for the believer who wants to *read Scripture deeply*, *study it accurately* offline,
and *pray it personally* — without juggling four separate apps or leaking private reflections to a
server.

## Table of contents

- [Why](#why)
- [Product pillars](#product-pillars)
- [Platforms](#platforms)
- [Monorepo layout](#monorepo-layout)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Roadmap](#roadmap)
- [Documentation](#documentation)
- [Project status](#project-status)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)
- [Acknowledgements](#acknowledgements)

## Why

Digital Bible tooling is fractured across two incompatible paradigms:

- **Consumer devotional apps** nail mobile habit loops and audio, but lack rigorous exegetical
  tooling and bury the reader in social/algorithmic clutter.
- **Academic research suites** deliver deep linguistic tools, but are desktop-heavy, expensive, and
  offer no structured path from reading to prayer.

Someone who wants to read deeply, study accurately (offline, cross-device), and pray personally must
stitch together 3–4 apps — usually copy-pasting verses into insecure note apps where prayers are
quickly forgotten.

Breath & Word closes that gap in one application.

## Product pillars

1. **Unobtrusive daily reading & audio** — structured typography (poetry, headings, red-letter,
   footnotes), offline multi-translation comparison, non-punitive daily pacing, and synchronized
   narration with ambient soundscapes.
2. **Open-data exegetical & inductive depth** — instant offline Strong's / interlinear lookup,
   morphology, lexicons, cross-references, factbook dossiers, an inductive study workflow, and
   portable stylus ink.
3. **Zero-friction Scripture praying engine** — one-tap verse capture into categorized or shared
   church prayer pools, smart rotation, answered-prayer testimonies, four guided prayer frameworks
   (*Lectio Divina*, *3 R's*, *ACTS*, and a 120 Hz *Breath Prayer*), and optional zero-knowledge
   client-side E2EE for private journals.

## Platforms

| Target | Technology | Notes |
| --- | --- | --- |
| **Android** | Expo + React Native | Primary mobile target; native build required (Expo Go will not work — native modules). |
| **iPadOS** | Expo + React Native | Apple Pencil / Skia ink study desk. |
| **Windows 11 / macOS** | Tauri v2 + React | Multi-pane desktop research studio. |
| **Web companion** | Vite + React | Lightweight read/prayer flows for small groups. |

## Monorepo layout

```text
breath-word/
├── AGENTS.md                  # non-negotiable engineering contract
├── HANDOFF.md                 # single-file continuity brief for new sessions
├── docs/                      # living specification suite (start at docs/G1-index.md)
├── tools/
│   └── pack-builder/          # Node/TS CLI: builds modular content packs (.sqlite + .gz + manifest)
├── packages/
│   ├── tokens/                # design tokens — the ONLY source of colors/fonts/spacing/motion
│   └── core/                  # 100% pure TypeScript (no RN / no DOM / no Tauri imports)
│       └── src/{domain,adapters,repositories,runtime,crypto,content,stores,errors,config}
└── apps/
    ├── mobile/                # Expo SDK 58 — React Native + Reanimated + Skia
    └── desktop/               # Tauri v2 + Vite + React 19
```

## Tech stack

| Layer | Stack |
| --- | --- |
| **Shared core** | TypeScript 5.6, framework-free Zustand stores, WebCrypto / `quick-crypto` |
| **Design tokens** | TypeScript — four semantic themes, typography, 4 pt spacing, motion/breath tokens |
| **Mobile** | Expo SDK 58, React Native 0.88 (New Architecture), Reanimated 4, Skia 2, Expo Router, `op-sqlite`, PowerSync RN, `react-native-quick-crypto`, Track Player |
| **Desktop** | Tauri v2 (Rust), Vite 6, React 19, Tailwind CSS 3, Framer Motion, PowerSync Web (WA-SQLite + OPFS) |
| **Tooling** | pnpm 12 workspaces, Turborepo 2, ESLint 9 (flat config), Vitest 2 |
| **Backend (Phase 2+)** | Supabase (PostgreSQL + RLS), PowerSync Cloud, Cloudflare R2 content CDN |

## Architecture

Four ideas shape the whole codebase. The full contract lives in [`AGENTS.md`](AGENTS.md) and
[`docs/architecture/`](docs/architecture/).

- **Pure core, thin shells.** `packages/core` is 100% framework-free TypeScript and owns all domain
  logic and SQL. UI apps never write raw SQL; they consume repositories through injected adapters.
- **Dual SQLite, cleanly separated.** Read-only static Scripture lives in modular content packs;
  synced user data lives in `user_data.sqlite` (local-only until Phase 2); device-local state
  (installed packs, audio cache, workspace layout) lives in `local_device.sqlite`.
- **Zero-knowledge E2EE by design.** Private notes are encrypted client-side with AES-256-GCM
  (`e2ee:v1:…`); plaintext is never persisted, indexed, or sent to AI without explicit consent.
- **Calm, accessible motion.** Colors, type, spacing, and springs all come from
  `@breath-and-word/tokens`; 120 Hz animations run on the UI thread with Reduced Motion fallbacks.

## Getting started

### Prerequisites

- **Node.js ≥ 22** (developed on **v24**)
- **pnpm 12** (`corepack enable` recommended)
- **Rust stable** + MSVC Build Tools — for the Tauri desktop app
- **Android SDK / emulator** — for the mobile app

### Install & run the quality gate

```bash
pnpm install
pnpm turbo lint typecheck test   # the gate — expect 12/12 tasks green
```

### Build & run

```bash
# Build every package and app
pnpm turbo build

# Desktop (Tauri) — requires the Rust toolchain
pnpm --filter @breath-and-word/desktop tauri dev

# Content-pack tooling (Phase-1 fixture + local pack server)
pnpm --filter @breath-and-word/pack-builder pack:sample   # build the sample pack into out/
pnpm --filter @breath-and-word/pack-builder serve:packs   # serve out/ on http://0.0.0.0:8787

# Mobile — needs an Android emulator/device (native build; Expo Go will NOT work)
pnpm --filter @breath-and-word/mobile run:android
```

> **Windows note:** the Android *native* build is performed in the cloud (EAS Build) or on Linux/CI.
> `apps/mobile/eas.json` is pre-configured — see [`HANDOFF.md`](HANDOFF.md) for the exact handoff.

## Roadmap

| Phase | Milestone | Platforms |
| --- | --- | --- |
| **1** | Core local reader MVP — offline reading, parallel compare, FTS5 search, focus mode | Android, iPadOS, Desktop |
| **2** | Scripture prayer + E2EE sync — prayer pools, rotation, encrypted journal, PowerSync | Android, iPadOS, Desktop |
| **3** | Exegesis, inductive study, ink & audio — Strong's, lexicons, cross-refs, Skia ink | Android, iPadOS, Desktop |
| **4** | Grounded AI & studio polish — citation-enforced RAG, desktop workspace, web companion | All |

Post-v1 (v1.1+): syntax-tree diagrams, BYO pack importer, home-screen widgets, UI i18n.
See [`docs/product/A3-scope-phasing-and-non-goals.md`](docs/product/A3-scope-phasing-and-non-goals.md).

## Documentation

The `docs/` tree is the authoritative, versioned specification. Start with the index.

| Document | What it covers |
| --- | --- |
| [`docs/G1-index.md`](docs/G1-index.md) | Canonical map of the whole documentation suite |
| [`docs/product/A1`](docs/product/A1-problem-statement-and-vision.md) | Problem statement & vision |
| [`docs/architecture/B1`](docs/architecture/B1-system-architecture-overview.md) | System architecture overview |
| [`docs/security/B6`](docs/security/B6-security-privacy-and-e2ee-architecture.md) | Security, privacy & E2EE architecture |
| [`docs/arch/adr/`](docs/arch/adr/README.md) | Architecture Decision Records (ADR-001 … ADR-005) |
| [`docs/G3-changelog.md`](docs/G3-changelog.md) | Living changelog |

## Project status

Early **Phase 1** development. The monorepo, pure-TS core (domain, crypto, content-pack schema,
repositories, runtime, stores), the content-pack builder, and both UI shells are in place; the
quality gate is green (12/12 tasks, 97 tests). Gate-1 technical spikes pass on the host — on-device
verification is pending. See [`HANDOFF.md`](HANDOFF.md) for the current status snapshot.

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) and the
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) first. Every pull request must pass the gate:

```bash
pnpm turbo lint typecheck test
```

## Security

Breath & Word is privacy-first and stores no plaintext secrets or private notes server-side. To
report a vulnerability, please follow [`SECURITY.md`](SECURITY.md) — do **not** open a public issue.

## License

Copyright © 2026 Breath & Word contributors.

Released under the **GNU Affero General Public License v3.0** — see [`LICENSE`](LICENSE).

> The AGPL applies to the **source code** in this repository. Bundled or downloadable **content
> packs** (Scripture translations, lexicons, factbooks, audio) carry their own upstream licenses,
> which are recorded per-pack in each pack's `manifest.json` metadata.

## Acknowledgements

Breath & Word stands on the shoulders of open data and open source: the Bible translations and
study datasets distributed under permissive or public-domain terms (see
[`docs/integrations/B5-…`](docs/integrations/B5-integrations-and-open-data-licensing-matrix.md)),
and the React Native, Expo, Tauri, Skia, Reanimated, PowerSync, op-sqlite, and Supabase projects.
