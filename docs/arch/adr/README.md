# Architecture Decision Records

**Document ID:** `B8`  
**Version:** `1.0.0`  
**Status:** `Approved (Baseline)`  
**Owner:** Founder / Architect  
**Last Updated:** `2026-11-24`  
**Related Docs:** `A7`, `B1`, `B3`, `B4`, `B6`, `G1`

This document records irreversible or high-leverage technical architecture decisions for **Breath & Word v1**, including rationale, trade-offs, and concrete implementation constraints.

| ADR | Title | Status |
| --- | --- | --- |
| [ADR-001](ADR-001-cross-platform-monorepo-and-rich-animated-ui-strategy.md) | Cross-Platform Monorepo & Rich Animated UI Strategy | Accepted |
| [ADR-002](ADR-002-dual-local-first-sqlite-and-powersync-adapter-boundary.md) | Dual Local-First SQLite & PowerSync Adapter Boundary | Accepted |
| [ADR-003](ADR-003-cross-platform-portable-stylus-ink-skia-vector-canvas.md) | Cross-Platform Portable Stylus Ink (`Skia` / Vector Canvas) | Accepted |
| [ADR-004](ADR-004-opt-in-zero-knowledge-cloud-e2ee-and-volatile-in-memory-search.md) | Opt-In Zero-Knowledge Cloud E2EE & Volatile In-Memory Search | Accepted |
| [ADR-005](ADR-005-zero-egress-modular-content-pack-and-audio-distribution.md) | Zero-Egress Modular Content Pack & Audio Distribution | Accepted |

## Acceptance / Done Criteria

- All 5 ADRs are committed to `docs/arch/adr/` and enforced in `B3` (Monorepo spec) and `B4` (Data Architecture).

## Open Questions

- `[OPEN]` Confirm exact Bible.org redistribution clause for `pack_trans_net` prior to uploading NET to public R2 (tracked in `B5`).

## Assumptions

- `[ASSUMPTION]` Tauri v2 `rusqlite` IPC overhead for chapter queries (<5ms) meets UI frame budgets (validated in Gate-1 48-hour spike).

## Change Log

- `1.0.0` | `2026-11-24` | Athena | Initial approved ADR suite (`ADR-001` through `ADR-005`).

## Traceability

- Upstream: `SPECIFICATION.md`, `A7` (`OQ-01..07`). Downstream: `B2`, `B3`, `B4`, `B6`, `E2`.
