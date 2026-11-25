---
name: Feature request
description: Suggest an idea or enhancement for Breath & Word
title: "[Feature] "
labels: ["enhancement"]
body:
  - type: markdown
    attributes:
      value: |
        Before requesting a feature, please check the phase boundaries in
        [`docs/product/A3-scope-phasing-and-non-goals.md`](../blob/main/docs/product/A3-scope-phasing-and-non-goals.md).
        Deferred v1.1 features are intentionally out of scope for now.
  - type: textarea
    id: problem
    attributes:
      label: What problem does this solve?
      description: Describe the user need or pain point — not just the solution.
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: Proposed solution
    validations:
      required: false
  - type: dropdown
    id: phase
    attributes:
      label: Which phase does this belong to?
      options:
        - Phase 1 — Core local reader MVP
        - Phase 2 — Scripture prayer & E2EE sync
        - Phase 3 — Exegesis, inductive & audio
        - Phase 4 — Grounded AI & studio polish
        - v1.1+ (post-v1 roadmap)
        - Unsure
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
    validations:
      required: false
