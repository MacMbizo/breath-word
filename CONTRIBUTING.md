# Contributing to Breath & Word

Thanks for your interest in improving Breath & Word. This document explains how to set up the
project, the standards we hold contributions to, and how to get a change merged.

## Code of Conduct

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- Read [`AGENTS.md`](AGENTS.md) — the non-negotiable engineering contract. It defines the
  architecture rules every change must respect.
- Read [`HANDOFF.md`](HANDOFF.md) for orientation and the current status.
- Skim [`docs/G1-index.md`](docs/G1-index.md) — the authoritative specification lives in `docs/`.
- Build only for the **active phase** (Phase 1 → 2 → 3 → 4). Do not implement deferred v1.1
  features (syntax trees / Macula, on-device USFM importer, widgets) prematurely.

## Development setup

**Prerequisites:** Node.js ≥ 22 (developed on 24), pnpm 12, plus Rust and the Android SDK for the
respective apps.

```bash
corepack enable
pnpm install
git config core.hooksPath .githooks   # optional: enable local hooks if present
```

## The gate

Every change must pass the same gate CI runs:

```bash
pnpm turbo lint typecheck test
```

A pull request that does not keep this green **12/12** will not be merged.

## Non-negotiable rules (summary)

These are enforced by review and CI. The full list is in [`AGENTS.md`](AGENTS.md).

1. **`packages/core` stays 100% pure TypeScript** — never import `react-native`, `expo-*`,
   `@tauri-apps/*`, `window`, or `document` there.
2. **UI apps never write raw SQL** — all queries live in `packages/core/src/repositories/`.
3. **Dual-SQLite separation** — static Scripture only in read-only packs; synced user data in
   `user_data.sqlite` (UUID v4 `id` PK + soft deletes; never hard-`DELETE`); device state in
   `local_device.sqlite`.
4. **Prayer-pool privacy split** — per-user state never lives on `prayer_pool_items`.
5. **Canonical references** — verse IDs are `BBCCCVVV` integers; Strong's IDs are unpadded
   uppercase (`G26`, `H430`).
6. **Zero-knowledge E2EE** — never persist or log decrypted notes; never send private notes to AI
   without explicit consent.
7. **Tokens & accessibility** — no hard-coded colors; import everything from
   `@breath-and-word/tokens`; provide Reduced Motion fallbacks.
8. **Every error is a canonical `AppError`.**

## Commit conventions

Use clear, imperative commit messages. The project follows
[Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): add reading-plan Manna pacing
fix(mobile): guard nullable track-player item bundle
docs(readme): document the EAS build handoff
chore(ci): cache rust artifacts
```

Keep commits focused. Prefer one logical change per commit.

## Pull requests

1. Fork the repository and create a topic branch off `main`
   (e.g. `feat/reader-parallel-compare`).
2. Make your change, keeping `packages/core` free of UI/runtime imports.
3. Add or update tests. Host-side tests run under Vitest via `pnpm turbo test`.
4. Run the gate locally: `pnpm turbo lint typecheck test`.
5. Open a pull request using the template, and describe **why** the change is needed.
6. Ensure CI is green and respond to review feedback.

## Reporting bugs & requesting features

Use the GitHub issue templates. For anything security-related, follow [SECURITY.md](SECURITY.md)
instead of opening a public issue.

## License

By contributing, you agree that your contributions are licensed under the
[GNU Affero General Public License v3.0](LICENSE).
