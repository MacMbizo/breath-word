# Canonical Requirements Register & Traceability Matrix Spec

## Why

The app's requirements are spread across 27 documents (`A1`–`G4`): functional requirements live in `A2`, phase boundaries in `A3`, numeric budgets in `B7`, architecture rules in `AGENTS.md`/ADRs, contracts in `C1`–`C4`, the E2EE spec in `B6`, design/accessibility in `D1`/`D3`, licensing in `B5`, environments/flags in `E1`, CI/CD gates in `E2`, observability/runbooks in `E4`, and the Definition of Done in `F1`. There is currently **no single canonical index of requirements** — only `G1` (a map of *documents*, not *requirements*). As a result, individual requirement clauses are easy to miss: e.g. `FR-103`'s *"testament filters"* clause went unnoticed until the PRD was read manually during a later task. We need one auditable register so nothing is missed and phase-exit gates can be checked at a glance.

## What Changes

- Add a new canonical document `docs/G5-requirements-register.md` that enumerates **every requirement ID** defined anywhere in the suite, each with: source doc + §, verbatim requirement/acceptance text, owning phase, current status (Implemented / Partial / Not started / Blocked / N/A-in-v1), and a pointer to the code/test that satisfies it.
- The register covers all requirement *classes*, not just FRs:
  - Functional requirements `FR-101`–`FR-403` (21 total).
  - Non-functional budgets (`B7 §4.1–4.3`), architecture rules (`AGENTS.md` rules 1–7 + `ADR-001`–`ADR-005`), interface contracts (`B3 §4.3` adapters).
  - `C1` API/Edge/RPC contracts, `C2` sync buckets + `CoreEvent` union, the full `C3` 26-code error registry, `C4` RBAC matrix + RLS policies.
  - `B6` E2EE envelope spec + "NEVER" prohibitions.
  - `D1` token themes + `D3` WCAG 2.2 AA rules.
  - `B5` licensing matrix + attribution rules.
  - `E1` environment-variable/secret matrix + phase feature flags; `E2` CI/CD gates; `E4` telemetry/backup/runbooks.
  - `F1` testing pyramid + 7-point Definition of Done.
  - `B3 §4.5` Gate-1 spikes 1–4.
- Add a **gap register** section: known-missing source (`A7`), external open items (NET redistribution terms, BSB audio timestamps), unverified spikes, and any FR clause without an implementation.
- Add a **coverage summary** table (counts per status, per phase).
- Link `G5` from `G1-index.md` and record the change in `G3-changelog.md`.
- **No `BREAKING` changes.** Documentation only.

## Impact

- Affected specs: `G1` (index — add `G5`), `G3` (changelog — add row). All other docs are *read as sources* into `G5`.
- Affected code: none. The register is documentation; it cites existing code/test files for status but changes no source.
- Consumers: future feature work (Phase 1→4) and PR reviews use `G5` as the completeness checklist; `F1` DoD item 7 (traceability) is served by it.

## ADDED Requirements

### Requirement: Canonical Requirements Register

The project SHALL maintain a single canonical register document (`docs/G5-requirements-register.md`) that enumerates every requirement identifier defined anywhere in the documentation suite, so that requirement coverage is auditable without re-reading all 27 documents.

#### Scenario: Locating a requirement's acceptance criteria
- **WHEN** a developer needs the acceptance criteria for `FR-103`
- **THEN** `G5` lists `FR-103` with its verbatim acceptance text, source (`A2 §4.1`), owning phase (`P1`), current status, and a code/test pointer.

#### Scenario: Register is exhaustive
- **WHEN** any requirement ID (a `FR-xxx`, a `C3` error code, an `ADR-00n`, a `B7` budget, a `B3 §4.5` spike, a `F1` DoD item) is selected at random
- **THEN** `G5` contains a row for it with a valid source citation.

### Requirement: Traceability to Implementation

Every functional requirement and every normative `SHALL`/`MUST` requirement in `G5` SHALL cite the repository file(s) and/or test(s) that satisfy it, or explicitly state `Not implemented`.

#### Scenario: Unimplemented clause is visible
- **WHEN** a requirement clause has no satisfying code or test
- **THEN** its `G5` status reads `Not started` or `Partial` and the gap register names it.

### Requirement: Coverage Summary & Gap Register

`G5` SHALL include (a) a coverage summary counting requirements by status per phase, and (b) a gap register listing known-open items.

#### Scenario: Phase readiness at a glance
- **WHEN** a phase-exit review begins
- **THEN** the coverage summary shows how many Phase-N requirements are Implemented / Partial / Not started / Blocked.

## MODIFIED Requirements

### Requirement: Living Documentation Index (`G1`)

`G1` SHALL list `G5 — Canonical Requirements Register & Traceability Matrix` in its Document Inventory table, so the register is discoverable from the canonical doc map.

#### Scenario: Register discoverable
- **WHEN** a reader opens `G1-index.md`
- **THEN** the Document Inventory contains a `G5` row pointing at `docs/G5-requirements-register.md`.
