# Security Policy

Breath & Word is a privacy-first, local-first application. We take security seriously — especially
anything touching the zero-knowledge E2EE vault, the encrypted journal, or sync credentials.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull
requests.**

Instead, use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the issue, the affected component, and reproduction steps.

If you cannot use private reporting, contact the maintainer directly through their GitHub profile
([@MacMbizo](https://github.com/MacMbizo)).

Please include as much of the following as possible:

- The type of issue (e.g. cryptographic flaw, data leak, injection, auth bypass)
- Affected version / commit and the platform (Android, iPadOS, desktop, web)
- Step-by-step reproduction and, ideally, a proof-of-concept
- The impact you believe the issue has

## What to expect

- We aim to acknowledge reports promptly and keep you informed of progress.
- We will credit reporters in the release notes unless you prefer to remain anonymous.

## Scope & threat model

- The **E2EE vault** uses AES-256-GCM with a fresh IV per write and an authenticated AAD; private
  notes must never be persisted, indexed, or transmitted in plaintext.
- **Sync** relies on Supabase RLS and PowerSync; report any tenant-isolation or RLS bypass.
- **Client secrets** (BYOK LLM keys, personal API keys) live only in OS secure storage and must
  never appear in bundles, logs, or environment variables.

## Supported versions

The project is in pre-1.0 development. Security fixes are applied to the latest `main`; no back-port
branches are maintained yet.
