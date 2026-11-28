# Choosing Which English Versions to Build (Selection Method)

**Document ID:** `EXTRAS-SEL`  
**Version:** `0.1.0`  
**Status:** `Draft — Proposal for owner decision`  
**Last Updated:** `2026-11-28`  
**Related Docs:** `EXTRAS-ENG`, `EXTRAS-SRC`, `B4`, `B5`, `A2` (`FR-102`, `FR-105`), `A3`, `B6`

## Purpose & Scope

`EXTRAS-ENG` lists 105 English versions and 70 we may legally redistribute. Building all 70 as `trans_*` packs
would be wrong for three reasons:

1. **The Library becomes noise.** 9 of the 70 are KJV editions and 6 are WEB editions. Someone looking for "a Bible
   I can read" should not scroll past *KJV Pure Cambridge Edition* and *Restored Name KJV*.
2. **Every pack is a maintenance cost.** Each one needs the `B5` licence review, a USFM source, a versification
   check, an R2 upload, and a re-build whenever the pack schema changes.
3. **The versions most people actually read are not in the 70.** NIV, ESV, NLT, NKJV, CSB and NASB are all
   copyrighted. Public-domain texts serve tradition, study and access. They do not replace those.

This document proposes a repeatable way to choose a small set, and a privacy-safe way to adjust it after launch.
It is a proposal, not approved scope: the shortlist enters `B5`/`A3` only when the owner signs it off.

## Body

### 1. Gates — a version must pass all of these to be considered

| Gate | Rule | Why |
| --- | --- | --- |
| Licence | `redistribution` is `public-domain` or `open` in `EXTRAS-ENG`, with no unresolved ⚠ conflict | `B5`: never bundle copyrighted or non-commercial text |
| Completeness | A full Bible, Testament or canon for its stated scope; "translation in progress" versions wait | A reader that is missing books feels broken |
| Clean text | No mojibake or replacement characters (fails today: scrollmapper `Rotherham`) | Scripture text must be exact |
| Buildable source | Available as USFM (eBible.org preferred) or as a JSON source we can map to `BBCCCVVV` | `FR-101` needs headings, poetry and footnotes; the current ETL reads USFM |
| Versification | Maps onto Protestant `BBCCCVVV` through `versification_maps` (LXX and Tanakh numbering included) | `FR-102` parallel view aligns by verse ID |

### 2. Collapse families — one representative each

| Family | Editions in the 70 | Representative | Others |
| --- | --- | --- | --- |
| King James | KJV, KJVA, KJVPCE, KJVCPB, UKJV, RNKJV, RLT, Webster, RWebster | **KJV** (already shipped) | KJVA only if an Apocrypha reader is wanted |
| World English Bible | WEB, WEBBE, WEB-classic, WMB, WMBBE, … | **WEB** (already shipped) | WEBBE as a British-spelling option |
| New Heart English | NHEB, NHEBJE, NHEBME | none for now | Overlaps WEB, which it derives from |
| Open English Bible | OEB, OEBcth | none for now | Incomplete (fails Completeness) |
| Douay-Rheims | DRA, DRC | **DRA** | |
| Brenton Septuagint | Brenton, BrentonUpd | **BrentonUpd** | Updated spelling reads more easily |

### 3. Score what is left

Each candidate gets 0–3 on four measures. The total ranks the list, and the slot rule in §4 then fills one slot per
reader need.

| Measure | 0 | 1 | 2 | 3 | Evidence |
| --- | --- | --- | --- | --- | --- |
| **Carried by** (independent sources that publish it) | 1 source | 2 | 3–4 | 5 | Measured: `sources[]` in `EXTRAS-ENG`. Each source maintainer chose to carry it, which is a demand signal |
| **Recognition** | Unknown outside specialists | Known in study circles | Widely cited in tools and commentaries | Used in churches today | Owner judgement, written down per version |
| **Distinct need** | Duplicates a picked version | Minor difference (spelling) | Different style | Fills an unserved need: a tradition, canon or reading level | The reader-needs table in §4 |
| **Study richness** | Plain text | Headings or footnotes | Poetry and paragraphs | Strong's tags, which unlock `FR-301` word taps | The source's markup |

### 4. Fill reader needs, then cap

Pick the best-scoring candidate for each need. The cap is roughly 10–12 English packs at v1, so the Library fits on
one screen.

| Reader need | Already shipped | Proposed next | Carried by | Notes |
| --- | --- | --- | --- | --- |
| Modern, readable (default) | **BSB** (`core_bsb`) | — | 5 | |
| Traditional / liturgical | **KJV** (`trans_kjv`) | — | 5 | Has Strong's tags (word taps) |
| Modern, openly licensed | **WEB** (`trans_web`) | — | 3 | Has Strong's tags |
| Classic study (1901) | — | **ASV** | 5 | Already a planned `B5` row (`trans_asv`) |
| Word-for-word literal | — | **YLT**, or **LSV** for modern English | 3 / 2 | LSV is CC BY-SA 4.0: attribution plus ShareAlike, so check the `B5` gate wording |
| Plain English / learners | — | **BBE** | 4 | 850-word vocabulary. Check its UK status, as for KJV |
| Catholic canon | — | **DRA** | 3 | Brings the deuterocanon; needs canon-aware book lists |
| Jewish Tanakh | — | **JPS 1917** | 4 | OT only; Tanakh book order |
| Reformation history | — | **Geneva 1599** | 4 | Early-modern spelling |
| Brethren / literal tradition | — | **Darby** | 4 | Optional if the cap is tight |
| Septuagint (Greek OT) | — | **Brenton (updated)** | 2 | LXX versification; good for studying NT quotations |

That gives **3 shipped + 8 proposed = 11**. Everything else stays in `EXTRAS-ENG`, catalogued and stored, ready
to promote if demand appears.

### 5. Re-rank with real demand after launch, without tracking anyone

`B6` rules out per-user analytics. Two signals respect it:

- **Download counts per pack.** Each pack is one R2 object, so Cloudflare's own request counts per object show
  what people install. No user ID and no app telemetry are involved. Review them at each content release: drop a
  pack nobody installs, promote the next candidate.
- **"Request a version" in the Library.** Show the catalogued-but-unbuilt versions (from `EXTRAS-ENG`) as a list
  people can request. A request is an explicit action, such as a pre-filled email or issue, so nothing is sent
  silently. Copyrighted names (NIV, ESV …) can show here too, pointing to the BYO-key API path when one exists.

### 6. The copyrighted versions people use most

The honest gap: most English readers use NIV, ESV, KJV, NLT, NKJV or CSB, and only KJV is free. The options are:

1. **BYO-key runtime API**, like the existing ESV ephemeral-cache rule in `B5 §4.1`: API.Bible for NIV/NLT/NASB/CSB.
   This is an `A3` scope decision and probably v1.1.
2. **Publisher licensing**, which would be a commercial agreement per translation.
3. **Leave them out of v1** and say so in the Library.

## Open Questions

- Owner sign-off on the 8 proposed versions and the ~11 cap.
- Confirm that eBible.org publishes USFM for each proposed version. If it does not, write a JSON → pack path in the
  ETL from the stored Free Use Bible API files.
- The Catholic canon (DRA) and the LXX (Brenton) need the book list and `versification_maps` to handle books
  outside the 66.
- Do BBE and the KJV family need UK-storefront handling (Crown patent and Cambridge's claim)?
- Is a BYO-key API path for the popular copyrighted versions in scope, and when?

## Change Log

- `0.1.0` | `2026-11-28` | Claude | Initial selection method: gates, family collapse, scoring, reader-need slots,
  privacy-safe demand signals; proposed 8 versions.

## Traceability

- Data: `EXTRAS-ENG` / `tools/pack-builder/data/english-bible-versions.json`.
- Downstream: `B5` rows for approved versions, `A3` phase placement, `FR-105` Library listing.
