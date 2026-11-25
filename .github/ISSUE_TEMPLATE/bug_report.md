---
name: Bug report
description: Report a reproducible defect in Breath & Word
title: "[Bug] "
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to file a bug. Please do **not** report security issues here —
        see [SECURITY.md](../blob/main/SECURITY.md) instead.
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: A clear and concise description of the bug.
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: What did you expect to happen?
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      placeholder: |
        1. Go to '...'
        2. Tap on '...'
        3. See error
    validations:
      required: true
  - type: dropdown
    id: platform
    attributes:
      label: Platform
      options:
        - Android
        - iPadOS
        - Windows
        - macOS
        - Web
        - Other / not applicable
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: Version / commit
      description: The app version, release tag, or commit SHA you are running.
    validations:
      required: false
  - type: textarea
    id: logs
    attributes:
      label: Relevant logs
      description: Paste any relevant output. **Remove secrets, private notes, and personal data.**
      render: shell
    validations:
      required: false
