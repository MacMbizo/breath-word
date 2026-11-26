# Tasks

- [x] Task 1: Create the `G5` register skeleton and the functional-requirement (FR) inventory.
  - [x] SubTask 1.1: Create `docs/G5-requirements-register.md` with the standard doc header (Document ID `G5`, Version `1.0.0`, Status `Active`, Last Updated, Related Docs), a "How to Use" section, and the coverage-summary table (columns: Phase × {Implemented, Partial, Not started, Blocked, N/A-in-v1} + total).
  - [x] SubTask 1.2: Add the FR inventory table for Pillar 1 — `FR-101`–`FR-107`. Columns: `ID | Title | Source | Verbatim acceptance | Phase | Status | Code/Test pointer`. Status values are one of `Implemented | Partial | Not started | Blocked | N/A-in-v1`; each pointer cites real repo files (or `Not implemented`).
  - [x] SubTask 1.3: Add the FR inventory table for Pillars 2–4 — `FR-201`–`FR-206`, `FR-301`–`FR-305`, `FR-401`–`FR-403`.
  - [x] SubTask 1.4: Add the phase-boundary + non-goals section (`A3 §4.1–4.2`): the four phases with their FR membership and exit gates, plus the six explicit v1 non-goals.

- [x] Task 2: Add the non-functional requirement (NFR) and architecture-rule sections.
  - [x] SubTask 2.1: Add the `B7` budget tables — performance/animation (`§4.1`), storage/bandwidth/memory (`§4.2`), availability/sync/cost (`§4.3`) — with exact targets and hard ceilings.
  - [x] SubTask 2.2: Add the architecture-rule section — `AGENTS.md` rules 1–7, the `B3 §4.3` adapter interfaces, the dual-SQLite data planes, the pack-ETL atomic protocol (`B4 §4.6`), the server-side trigger rules and tombstone GC (`B2`), and the runtime degradation table (`B1 §4.3`).
  - [x] SubTask 2.3: Add the ADR register — `ADR-001`–`ADR-005`, each with its mandated decision in one line.

- [x] Task 3: Add the contracts, security, design, licensing, ops, and testing sections.
  - [x] SubTask 3.1: `C1` — the `ai-gateway` request/response contracts (both modes) + validation rules + citation-verifier steps, the two shared-pool RPC contracts, and the BYO ESV adapter contract.
  - [x] SubTask 3.2: `C2` — the two PowerSync sync buckets with their data-select rules, the conflict-resolution policy, and the full `CoreEvent` union.
  - [x] SubTask 3.3: `C3` — the complete 26-row canonical error-code registry (code → domain → HTTP → retry policy → trigger), plus the backoff/timeout guardrails.
  - [x] SubTask 3.4: `C4` — the auth modes + guest-migration protocol, the RBAC matrix, and the RLS policy list.
  - [x] SubTask 3.5: `B6` — the E2EE envelope spec (primitives, envelope, IV rule, AAD binding), key-lifecycle operations, telemetry-redaction policy, and every "NEVER" prohibition.
  - [x] SubTask 3.6: `D1` — the four themes, the observation highlight palette, the typography/original-language font stack, the motion/breath tokens, and the component inventory; `D3` — the WCAG 2.2 AA rule table + the adaptive wireframes.
  - [x] SubTask 3.7: `B5` — the open-data licensing matrix and the in-app attribution mechanism.
  - [x] SubTask 3.8: `E1` — the environment topology + the variable/secret hygiene matrix + the phase feature-flag table; `E2` — the four CI/CD workflows and their gates; `E4` — telemetry/backup rules and runbooks `RB-01`–`RB-03`.
  - [x] SubTask 3.9: `F1` — the testing pyramid, the per-phase acceptance verification matrix, and the verbatim 7-point Definition of Done; `B3 §4.5` — Gate-1 spikes 1–4 with exact verification criteria.

- [x] Task 4: Add the gap register and the "specs missing / open items" section.
  - [x] SubTask 4.1: List the known-missing source (`A7`) and every external open item (`G1 §Known Gaps`: NET redistribution terms, BSB audio timestamps).
  - [x] SubTask 4.2: List every spike/acceptance item whose verification is still pending (Spike 1 device, Spike 2 device, Spike 3, Spike 4 device), cross-referencing the current build.
  - [x] SubTask 4.3: Reconcile the coverage summary counts against the actual table rows.

- [x] Task 5: Wire the register into the doc suite and verify.
  - [x] SubTask 5.1: Add the `G5` row to the `G1-index.md` Document Inventory table.
  - [x] SubTask 5.2: Add a `G3-changelog.md` row for the register.
  - [x] SubTask 5.3: Cross-check the register for exhaustiveness (every `FR-xxx`, every `C3` code, every `ADR`, every spike, every DoD item present exactly once) and run `pnpm turbo lint typecheck test` to confirm the tree is still green.

# Task Dependencies

- Task 2 depends on Task 1 (shares the document + coverage-summary skeleton).
- Task 3 depends on Task 1.
- Task 4 depends on Tasks 1–3 (gap register references the full inventory).
- Task 5 depends on Tasks 1–4.
- Tasks 2 and 3 are independent of each other and may proceed in parallel.
