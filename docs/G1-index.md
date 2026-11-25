# G1: Living Documentation Index

**Document ID:** `G1`  
**Version:** `1.0.0`  
**Status:** `Active`  
**Last Updated:** `2026-11-24`  
**Related Docs:** `AGENTS.md`, `SPECIFICATION.md`, `G3`

This is the canonical map of the Breath & Word documentation suite. **Document IDs are canonical; folder names are organizational only.**

## How to Use

1. Read `AGENTS.md` for non-negotiable engineering rules.
2. Use this index to locate the authoritative document for any `A*`–`G*` ID.
3. Consult `G3-changelog.md` before assuming a contract, schema, or phase boundary has changed.
4. Treat `SPECIFICATION.md` as the original product/architecture source; the `docs/` suite is the normalized build specification.

## Document Inventory

| ID | Title | Path | Status |
| --- | --- | --- | --- |
| `A1` | Problem Statement & Vision | [`product/A1-problem-statement-and-vision.md`](product/A1-problem-statement-and-vision.md) | Approved |
| `A2` | Product Requirements Document (PRD) | [`product/A2-product-requirements-document-prd.md`](product/A2-product-requirements-document-prd.md) | Approved |
| `A3` | Scope, Phasing & Non-Goals | [`product/A3-scope-phasing-and-non-goals.md`](product/A3-scope-phasing-and-non-goals.md) | Approved |
| `A7` | Constraints, Assumptions & Open Questions | _source document not yet extracted_ | **Missing source** |
| `B1` | System Architecture Overview | [`architecture/B1-system-architecture-overview.md`](architecture/B1-system-architecture-overview.md) | Approved |
| `B2` | Backend, PowerSync & AI Gateway Architecture | [`architecture/B2-backend-powersync-and-ai-gateway-architecture.md`](architecture/B2-backend-powersync-and-ai-gateway-architecture.md) | Approved |
| `B3` | Frontend & Monorepo Architecture | [`architecture/B3-frontend-and-monorepo-architecture.md`](architecture/B3-frontend-and-monorepo-architecture.md) | Approved |
| `B4` | Data Architecture, Schemas & Content Pack ETL | [`architecture/B4-data-architecture-schemas-and-content-pack-etl.md`](architecture/B4-data-architecture-schemas-and-content-pack-etl.md) | Approved |
| `B5` | Integrations & Open-Data Licensing Matrix | [`integrations/B5-integrations-and-open-data-licensing-matrix.md`](integrations/B5-integrations-and-open-data-licensing-matrix.md) | Approved |
| `B6` | Security, Privacy & E2EE Architecture | [`security/B6-security-privacy-and-e2ee-architecture.md`](security/B6-security-privacy-and-e2ee-architecture.md) | Approved |
| `B7` | Non-Functional Requirements & Cost Guardrails | [`architecture/B7-non-functional-requirements-and-cost-guardrails.md`](architecture/B7-non-functional-requirements-and-cost-guardrails.md) | Approved |
| `B8` | Architecture Decision Records | [`arch/adr/README.md`](arch/adr/README.md) + `ADR-001`–`ADR-005` | Approved |
| `C1` | API & Grounded AI RAG Gateway Contracts | [`contracts/C1-api-and-grounded-ai-rag-gateway-contracts.md`](contracts/C1-api-and-grounded-ai-rag-gateway-contracts.md) | Approved |
| `C2` | Sync Buckets & Offline Event Contracts | [`contracts/C2-sync-buckets-and-offline-event-contracts.md`](contracts/C2-sync-buckets-and-offline-event-contracts.md) | Approved |
| `C3` | Error Model & Offline Failure Modes | [`contracts/C3-error-model-and-offline-failure-modes.md`](contracts/C3-error-model-and-offline-failure-modes.md) | Approved |
| `C4` | AuthN/AuthZ & Shared Pool Tenancy | [`contracts/C4-authn-authz-and-shared-pool-tenancy.md`](contracts/C4-authn-authz-and-shared-pool-tenancy.md) | Approved |
| `D1` | Design System & Motion Tokens | [`design/D1-design-system-and-motion-tokens.md`](design/D1-design-system-and-motion-tokens.md) | Approved |
| `D3` | Adaptive UX Flows, Wireframes & WCAG 2.2 Accessibility | [`design/D3-adaptive-ux-flows-wireframes-and-wcag-22-accessibility.md`](design/D3-adaptive-ux-flows-wireframes-and-wcag-22-accessibility.md) | Approved |
| `E1` | Environments & Configuration Matrix | [`ops/E1-environments-and-configuration-matrix.md`](ops/E1-environments-and-configuration-matrix.md) | Approved |
| `E2` | CI/CD Pipeline & Pack Release Spec | [`ops/E2-cicd-pipeline-and-pack-release-spec.md`](ops/E2-cicd-pipeline-and-pack-release-spec.md) | Approved |
| `E4` | Observability, Privacy-Safe Backup/Export & Runbooks | [`ops/E4-observability-privacy-safe-backup-export-and-runbooks.md`](ops/E4-observability-privacy-safe-backup-export-and-runbooks.md) | Approved |
| `F1` | Testing Strategy, Feature Acceptance Plan & Definition of Done | [`quality/F1-testing-strategy-feature-acceptance-plan-and-definition-of-done.md`](quality/F1-testing-strategy-feature-acceptance-plan-and-definition-of-done.md) | Approved |
| `G1` | Living Documentation Index | [`G1-index.md`](G1-index.md) | Active |
| `G3` | Living Changelog | [`G3-changelog.md`](G3-changelog.md) | Active |
| `G4` | Master Glossary & Solo Developer + AI Handover Guide | [`governance/G4-master-glossary-and-solo-developer-ai-handover-guide.md`](governance/G4-master-glossary-and-solo-developer-ai-handover-guide.md) | Approved |

## ADR Files (`B8`)

- [`arch/adr/ADR-001-cross-platform-monorepo-and-rich-animated-ui-strategy.md`](arch/adr/ADR-001-cross-platform-monorepo-and-rich-animated-ui-strategy.md)
- [`arch/adr/ADR-002-dual-local-first-sqlite-and-powersync-adapter-boundary.md`](arch/adr/ADR-002-dual-local-first-sqlite-and-powersync-adapter-boundary.md)
- [`arch/adr/ADR-003-cross-platform-portable-stylus-ink-skia-vector-canvas.md`](arch/adr/ADR-003-cross-platform-portable-stylus-ink-skia-vector-canvas.md)
- [`arch/adr/ADR-004-opt-in-zero-knowledge-cloud-e2ee-and-volatile-in-memory-search.md`](arch/adr/ADR-004-opt-in-zero-knowledge-cloud-e2ee-and-volatile-in-memory-search.md)
- [`arch/adr/ADR-005-zero-egress-modular-content-pack-and-audio-distribution.md`](arch/adr/ADR-005-zero-egress-modular-content-pack-and-audio-distribution.md)

## Known Gaps & External Open Items

- **`A7` missing:** Many docs cite `ASM-*`, `CON-*`, and resolved `OQ-01..07` from `A7`; the standalone source document has not been extracted yet.
- **External verification:** Bible.org NET redistribution terms (`B5`) and BSB verse-level audio timestamp availability (`B5`/`B4`) remain open.
- **Gate-1 spikes:** `B3 §4.5` technical spikes must pass before Phase 1 implementation.

## Change Log

- `1.0.0` | `2026-11-24` | Devin | Initial extracted-docs index reflecting the current `docs/` tree.
