# E1-RB: Account & API-Key Provisioning Runbook

**Document ID:** `E1-RB`
**Version:** `1.0.0`
**Status:** `Draft`
**Owner:** Founder / DevOps
**Last Updated:** `2026-11-26`
**Related Docs:** `E1`, `B4`, `B5`, `C1`, `C4`, `E2`

> Companion runbook to **`E1` (Environments & Configuration Matrix)**. `E1 §4.2` says *which*
> variables exist and whether they are client-safe; this document says *how to obtain each one*,
> screen by screen, and where the value goes.

---

## 0. TL;DR — do you need any of this right now?

| Phase | What you need | Key required? |
| --- | --- | --- |
| **Phase 1** (current — Gate-1 spikes, reader, prayer) | Nothing from this document. Packs are served off your own machine. | **No** |
| **Phase 2** (cloud sync, shared pools) | Supabase project + PowerSync instance | Yes |
| **Phase 3** (exegesis, audio) | Cloudflare R2 (to publish packs + audio) | Yes |
| **Phase 4** (AI gateway) | Server-side LLM key (`SHARED_LLM_API_KEY`) | Yes |
| **Anytime (optional)** | Crossway ESV key — *device-only, never in `.env`* | Yes |

`E1 §4.3` sets `ENABLE_CLOUD_SYNC: false` and `ENABLE_AI_GATEWAY: false` for Phase 1, so
Supabase, PowerSync and the AI gateway are **not exercised** yet. **You are not blocked.**

---

## 1. Files you will edit

| File | Git status | Holds |
| --- | --- | --- |
| `apps/mobile/.env.local` | **ignored** (`*.local`) | `EXPO_PUBLIC_*` values |
| `apps/desktop/.env.local` | **ignored** (`*.local`) | `VITE_*` values |
| `.env.example` (both apps) | committed | templates, zero real values |

Verify they are ignored before typing a single secret into them:

```powershell
git check-ignore -v apps/mobile/.env.local
git check-ignore -v apps/desktop/.env.local
```

Expected: a line pointing at `.gitignore:17:*.local`.

> **Never** commit a real value. **Never** give a server secret an `EXPO_PUBLIC_` or `VITE_`
> prefix — that inlines it into the shipped bundle (`E1 §4.2` hard rule, `B6`).

---

## 2. Part A — Local pack server (Phase 1, no account needed)

The reader and Gate-1 Spike 1 install packs from a static HTTP server, per `ADR-005`.

```powershell
# 1. Build the fixture pack into tools/pack-builder/out/
pnpm --filter @breath-and-word/pack-builder pack:sample

# 2. Serve out/ on port 8787
pnpm --filter @breath-and-word/pack-builder serve:packs
```

To exercise the **parallel compare (FR-102)** and **cross-translation search (FR-103)** flows you need
*more than one* translation installed. Build both fixtures into the same `out/` instead of step 1:

```powershell
# Builds out/core_bsb-1.0.0.sqlite.gz (BSB) + out/trans_kjv-1.0.0.sqlite.gz (KJV) into ONE manifest
pnpm --filter @breath-and-word/pack-builder pack:spike
```

Both fixtures are synthetic filler text (**NOT scripture**) used only for Gate-1 timing/verification.
Then compare with `core_bsb:BSB, trans_kjv:KJV` (book `45`, chapter `8`).

Then set the manifest URL:

| Target | Value |
| --- | --- |
| Android emulator | `http://10.0.2.2:8787/manifest.json` |
| Physical device on same Wi-Fi | `http://<your-LAN-IP>:8787/manifest.json` |

Put it in `EXPO_PUBLIC_PACK_MANIFEST_URL` (mobile) and `VITE_PACK_MANIFEST_URL` (desktop).
Find your LAN IP with `ipconfig` (look for the IPv4 address of your active adapter).

---

## 3. Part B — Supabase (Phase 2)

1. Sign in at <https://supabase.com/dashboard> → **New project**.
2. Name it (e.g. `breath-and-word`), pick the region closest to your users, and set a strong
   **database password**. Store that password in your password manager — it is *not* an `.env`
   value, but you will need it for migrations and for the PowerSync connection string.
3. Wait for provisioning to finish (~2 minutes).
4. Go to **Project Settings → API**.
5. Copy these two values:

| Value on screen | Goes into |
| --- | --- |
| **Project URL** — `https://<ref>.supabase.co` | `EXPO_PUBLIC_SUPABASE_URL`, `VITE_SUPABASE_URL` |
| **anon / public key** | `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY` |

Notes:

- The anon key is *meant* to be public. It carries zero privilege without a signed-in user plus
  the Row Level Security policies in `C4`.
- The **`service_role` / secret key** on the same page is the opposite: full admin bypass. It
  must never appear in `EXPO_PUBLIC_*`/`VITE_*` and never be committed (`E1 §4.2`). It belongs in
  Edge Function secrets and CI only.
- The free tier is sufficient.
- `SUPABASE_SERVICE_ROLE_KEY` goes into **Edge Function secrets**, not into `apps/*/.env.local`:
  `npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`

---

## 4. Part C — PowerSync Cloud (Phase 2)

1. Create an account at <https://www.powersync.com/> and open the dashboard.
2. Create a **Development / Sandbox** instance.
3. When asked to connect a database, supply your Supabase **Postgres connection string**
   (Supabase → **Project Settings → Database → Connection string → URI**). Swap in your database
   password.
4. Copy the instance URL it gives you (looks like `https://<id>.powersync.journeyapps.com`) into
   `EXPO_PUBLIC_POWERSYNC_URL` / `VITE_POWERSYNC_URL`.

The sync buckets this instance must serve are defined in `C2` (`user_private` and `joined_pools`).

---

## 5. Part D — Cloudflare R2 (Phase 3, pack + audio CDN)

Skip until you are ready to publish packs publicly; Part A covers local development.

1. Sign in at <https://dash.cloudflare.com/> → **R2** → **Create bucket** (e.g. `breath-and-word-packs`).
2. Upload `manifest.json` and the `*.sqlite.gz` files produced by `tools/pack-builder`
   (use a `staging/` or `v1/` prefix per `E1 §4.1`).
3. Expose the bucket publicly (R2 public bucket URL or a custom domain).
4. Set the manifest URL as `EXPO_PUBLIC_PACK_MANIFEST_URL` / `VITE_PACK_MANIFEST_URL`.

For **CI publishing only** (never client-side), create a scoped R2 API token and set these as
GitHub Actions secrets (`E1 §4.2`, `E2`):

```
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
```

---

## 6. Part E — Sentry (optional, any phase)

1. Sign in at <https://sentry.io/> → create a project.
2. Copy the **DSN** into `EXPO_PUBLIC_SENTRY_DSN` / `VITE_SENTRY_DSN`.
3. Reporting is opt-in and privacy-scrubbed (`E4`). Leaving it blank is a valid configuration.

---

## 7. Part F — Bible texts: **no API keys exist for these**

All shipped translations are free datasets you download once and convert with `tools/pack-builder`.
There is nothing to register for. See `B5 §4.1` for the licensing matrix.

| Dataset | Target pack | Licence | Where to get it |
| --- | --- | --- | --- |
| Berean Standard Bible (BSB) | `core_bsb` | CC0 1.0 | <https://berean.bible/downloads.htm> — take **Text**, **USFM**, or **USX** |
| World English Bible (WEB) | `trans_web` | Public domain | <https://ebible.org/> — locate the version, download USFM/OSIS |
| King James Version (KJV) | `trans_kjv` | Public domain | <https://ebible.org/> |
| American Standard Version (ASV) | `trans_asv` | Public domain | <https://ebible.org/> |
| STEPBible TAHOT / TAGNT | `exegesis_step` | CC BY 4.0 | <https://github.com/STEPBible/STEPBible-Data> |
| TSK + OpenBible cross-references | `study_refs` | Public domain / CC BY 4.0 | <https://www.openbible.info/data/> |
| Theographic Bible Metadata | `study_refs` | CC BY-SA 4.0 | <https://github.com/robertrouse/theographic-bible-metadata> |

Two rules that are load-bearing:

1. **Never bundle or host an ESV pack.** ESV is runtime-only and user-supplied (see Part G).
2. **Keep Theographic data isolated** in `study_refs.sqlite` and license the derived pack +
   ETL script under CC BY-SA 4.0, so ShareAlike never touches your application source (`B5`).

Also note the KJV carries a **UK Crown Patent** — exclude the KJV pack from UK storefronts if you
publish publicly (`B5 §4.1`).

---

## 8. Part G — Crossway ESV API key (optional, **device-only**)

This is the only Bible API **key** in the whole product, and it deliberately never touches `.env`
(`E1 §4.2`, `B6`).

1. Go to <https://api.esv.org/> and create an account.
2. **Create an API Application** (the key belongs to the application you register).
3. Generate / copy the key.
4. In the app, the user pastes it into the ESV setup modal; it is stored in `expo-secure-store`
   (mobile) or the OS Keychain (desktop) — never in the database, never synced (`C1 §4.3`).
5. Requests are made with:

```
GET https://api.esv.org/v3/passage/text/?q=<Book+Ch>&include-headings=true&include-footnotes=true&include-verse-numbers=true
Authorization: Token <user_esv_key>
```

Caching limits you must honour (`B5 §4.1`, `C3`):

- maximum **500 consecutive verses** cached (`api_ephemeral_cache`)
- maximum **50% of any single book**
- **ephemeral TTL ≤ 7 days**, oldest-first (FIFO) eviction
- show the required *"Scripture quotations are from the ESV® Bible…"* attribution

> ⚠️ **Commercial check.** Crossway's public permissions page states their policy is *"to license
> to organizations, not to individuals or solo developers."* Your design is user-supplied BYO key
> rather than a distributed app key, which is the safer shape — but confirm this before any public
> release. `B5` already marks the Crossway terms as strict.

---

## 9. Part H — BYO LLM keys (Phase 4, **device-only**)

Same rule as Part G: the user's own Gemini / Anthropic / OpenAI key is entered in-app and kept in
OS secure storage. It is sent per-request as `X-BYOK-Key` headers to the `ai-gateway` Edge
Function and is never logged or stored (`C1 §4.1`, `B6`).

The only LLM key that ever lives in a `.env`-style secret is the **server-side shared quota** key:

```
SHARED_LLM_PROVIDER
SHARED_LLM_API_KEY
```

Set these as **Edge Function secrets** — never in `apps/*/.env.local`, never with a client prefix.

---

## 10. Part I — Getting values into a cloud build (EAS)

Because `.env` files are excluded from the EAS upload (they are listed in `.easignore`, so that
`EXPO_TOKEN` and other secrets are never uploaded to Expo's build servers), a **cloud build cannot
read `.env.local`**. Local `npx expo start` reads it fine.

For a cloud APK, register the client-safe values as EAS environment variables:

```powershell
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value "https://<ref>.supabase.co" --visibility plaintext
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key>" --visibility plaintext
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_POWERSYNC_URL --value "https://<id>.powersync.journeyapps.com" --visibility plaintext
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_PACK_MANIFEST_URL --value "https://<your-cdn>/manifest.json" --visibility plaintext
```

Confirm the exact flags with `npx eas-cli env:create --help`, and verify the result with
`npx eas-cli env:list --environment preview`.

`EXPO_PUBLIC_*` values are inlined **at bundle time** — changing one requires a new build.

---

## 11. Checklist

- [ ] `git check-ignore -v apps/mobile/.env.local` prints the `.gitignore` rule
- [ ] `git check-ignore -v apps/desktop/.env.local` prints the `.gitignore` rule
- [ ] No `EXPO_PUBLIC_*` or `VITE_*` variable holds `service_role`, `R2_SECRET_ACCESS_KEY`, or an LLM key
- [ ] Phase 1: local pack server reachable at `http://10.0.2.2:8787/manifest.json`
- [ ] Phase 2: Supabase project created, URL + anon key filled in both `.env.local` files
- [ ] Phase 2: PowerSync instance created, instance URL filled in both `.env.local` files
- [ ] Phase 3: R2 bucket public, manifest URL filled in
- [ ] Optional: Sentry DSN filled in, or intentionally left blank
- [ ] Optional: ESV key obtained from `api.esv.org` and stored **on-device only**
- [ ] Cloud builds: client-safe values registered with `eas env:create`

---

## 12. Sources

- ESV API — <https://api.esv.org/> and <https://api.esv.org/docs/>
- Crossway permissions — <https://www.crossway.org/permissions/>
- Berean Standard Bible downloads — <https://berean.bible/downloads.htm>
- eBible.org (WEB / KJV / ASV) — <https://ebible.org/>
- STEPBible-Data (CC BY 4.0) — <https://github.com/STEPBible/STEPBible-Data>
- OpenBible.info cross-references — <https://www.openbible.info/data/>
- Theographic Bible Metadata (CC BY-SA 4.0) — <https://github.com/robertrouse/theographic-bible-metadata>

## Change Log

- `1.0.0` | `2026-11-26` | Initial provisioning runbook: Supabase, PowerSync, R2, Sentry, open
  Bible datasets, Crossway ESV, BYO LLM keys, and EAS environment variables.
