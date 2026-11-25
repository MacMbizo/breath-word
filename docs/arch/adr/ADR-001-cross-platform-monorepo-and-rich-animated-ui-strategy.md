# ADR-001: Cross-Platform Monorepo & Rich Animated UI Strategy

- **Status:** Accepted
- **Date:** `2026-11-24`

## Context

Breath & Word targets Android phones, iPadOS (split-screen + Apple Pencil), Windows 11/macOS desktop (multi-pane dockable workspace), and an optional church Web Companion—built by a solo developer + AI—with a requirement for rich, fluid animated UX (for example, 120Hz Breath Prayer rings, swipeable Prayer Decks, and smooth drawers).

## Decision

Adopt a **pnpm + Turborepo** monorepo with strict separation of headless logic versus platform UI shells:

- `packages/core`: 100% pure TypeScript domain models, `BBCCCVVV` reference engine, SQLite repository interfaces, PowerSync schema, E2EE WebCrypto engine, prayer framework state machines, RAG client, and headless Zustand stores.
- `packages/tokens`: Shared design tokens (colors, typography scales, spacing, animation spring presets).
- `apps/mobile` (**Expo SDK 52+ / React Native**): Android + iPadOS using `react-native-reanimated`, `react-native-gesture-handler`, `@shopify/react-native-skia`, and `react-native-track-player`.
- `apps/desktop` (**Tauri v2 + React + Vite**): Windows 11 + macOS + Web Companion build target using Tailwind CSS, `motion` (Framer Motion), and `dockview`.

## Alternatives Considered

- **Tamagui / React Native Web universal UI:** Rejected. Fighting Web/Native style compiler edge cases, `dockview` incompatibilities, and Skia/Reanimated web shims slows solo + AI velocity and compromises desktop polish.

## Consequences

- (+) Native 120Hz animations on iPad/Android and crisp desktop docking on Windows 11/macOS.
- (+) AI generates cleaner, bug-free idiomatic React Native and Tailwind code separately than hybrid RNW abstractions.
- (+) Web Companion compiles directly from `apps/desktop` with a browser storage adapter.
- (−) UI screens are authored twice (mobile shell versus desktop shell), mitigated by keeping UI components thin and delegating all business logic/state to `packages/core`.
