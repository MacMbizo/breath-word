# English Bible Versions (Research Catalog)

**Document ID:** `EXTRAS-ENG`  
**Version:** `0.1.0`  
**Status:** `Draft — Research / Pre-Approval`  
**Last Updated:** `2026-11-28`  
**Related Docs:** `EXTRAS-SRC`, `B5`, `B4`, `A3`

## Purpose & Scope

Every English Bible version found in the sources catalogued by `EXTRAS-SRC`, with each source's licence, so the
team can pick candidates for future `trans_*` packs. **Generated** from
`tools/pack-builder/data/english-bible-versions.json` — edit the JSON, not this table.

**Scope guardrail:** research data, not an approved `B5` row. A version marked public domain or open may be
*stored* for evaluation; it still needs `B5` licence review and an `A3` phase decision before any pack build.

## Summary

- **105 versions** found across 6 sources.
- Public domain: 59
- Open (attribution): 11
- No derivatives: 1
- Non-commercial only: 12
- CrossWire permission only: 10
- Copyrighted: 11
- Unknown: 1
- **70 stored** in `tools/pack-builder/sources/english/` (git-ignored, 79 MB compressed), each with
  source, licence and SHA-256 in `manifest.json`. Re-fetch with `node tools/pack-builder/scripts/fetch-english-bibles.mjs`.
- Where sources disagree on a licence, the **strictest claim wins** until verified (marked ⚠).

Source codes: **FUB** Free Use Bible API · **SM** scrollmapper/bible_databases · **SW** CrossWire SWORD ·
**BA** bible-api.com · **WL** wldeh/bible-api.

## Stored and redistributable (70)

| Key | Version | Scope | Licence | Stored from | Also in |
| --- | --- | --- | --- | --- | --- |
| `KJV` | King James Version (1769 Oxford standard) — Current Breath & Word pack (trans_kjv) is built from eBible USFM with Strong's tags. | Bible | Public domain | FUB `eng_kjv` | SM, SW, BA, WL |
| `KJVA` | King James Version with Apocrypha | Bible + Apocrypha | Public domain | FUB `eng_kja` | SM, SW |
| `KJVPCE` | King James Version: Pure Cambridge Edition | Bible | Public domain | SM `KJVPCE` | SW |
| `KJVCPB` | KJV Cambridge Paragraph Bible (Scrivener, 1873) | Bible | Public domain | FUB `eng_cpb` | WL |
| `UKJV` | Updated King James Version (2000) | Bible | Public domain | SM `UKJV` | SW |
| `RNKJV` | Restored Name King James Version | Bible | Public domain | SM `RNKJV` | SW |
| `RKJNT` | Revised King James New Testament | New Testament | Public domain | SW `RKJNT` | — |
| `RLT` | Revised Literal Translation (2018) of the KJV | Bible | Open (attribution) | SM `RLT` | SW |
| `Webster` | Webster Bible (1833) | Bible | Public domain | FUB `eng_wbs` | SM, SW |
| `RWebster` | Revised Webster Version (1833) | Bible | Public domain | SM `RWebster` | SW |
| `RV` | Revised Version (1885) | Bible | Public domain | FUB `eng_rv5` | WL |
| `ASV` | American Standard Version (1901) | Bible | Public domain | FUB `eng_asv` | SM, SW, BA, WL |
| `ASVBT` | American Standard Version, Byzantine Text (with Apocrypha) | Bible | Public domain | FUB `eng_abt` | WL |
| `WEB` | World English Bible (American, protestant canon) — Current Breath & Word pack (trans_web) is built from eBible USFM. | Bible | Public domain | FUB `ENGWEBP` | BA, WL |
| `WEB-classic` | World English Bible Classic | Bible | Public domain | FUB `eng_web` | WL |
| `WEBU` | World English Bible Updated | Bible | Public domain | FUB `eng_webu` | — |
| `WEBBE` | World English Bible, British Edition | Bible | Public domain | FUB `eng_webpb` | BA, WL |
| `WEBBE-DC` | World English Bible, British Edition with Deuterocanon | Bible + Deuterocanon | Public domain | FUB `eng_weu` | — |
| `WEBC` | World English Bible, Catholic Edition | Catholic Bible | Public domain | FUB `eng_webc` | — |
| `WMB` | World Messianic Bible | Bible | Public domain | FUB `eng_wmb` | WL |
| `WMBBE` | World Messianic Bible, British Edition | Bible | Public domain | FUB `eng_wmu` | WL |
| `BSB` | Berean Standard Bible — Current Breath & Word pack (core_bsb). Placed in the public domain (CC0) in 2023. | Bible | Public domain | FUB `BSB` | SM, SW, BA, WL |
| `MSB` | Majority Standard Bible | Bible | Public domain | FUB `eng_msb` | — |
| `NHEB` | New Heart English Bible | Bible | Public domain | SM `NHEB` | SW |
| `NHEBJE` | New Heart English Bible: Jehovah Edition | Bible | Public domain | SM `NHEBJE` | SW |
| `NHEBME` | New Heart English Bible: Messianic Edition | Bible | Public domain | SM `NHEBME` | SW |
| `OEB` | Open English Bible (US spelling) — Translation in progress; not every book is complete. | Partial Bible | Public domain | SM `OEB` | SW, BA |
| `OEBcth` | Open English Bible (Commonwealth spelling) — Translation in progress; not every book is complete. | Partial Bible | Public domain | SM `OEBcth` | SW, BA |
| `LSV` | Literal Standard Version | Bible | Open (attribution) | FUB `eng_lsv` | WL |
| `FBV` | Free Bible Version | Bible | Open (attribution) | FUB `eng_fbv` | WL |
| `T4T` | Translation for Translators | Bible | Open (attribution) | FUB `eng_t4t` | WL |
| `ULB` | Unlocked Literal Bible | Bible | Open (attribution) | FUB `eng_ulb` | — |
| `AAB` | Accessible Ancients Bible | Bible | Public domain | FUB `AAB` | — |
| `ACV` | A Conservative Version | Bible | Public domain | SM `ACV` | SW |
| `BBE` | Bible in Basic English (1949/1964) | Bible | Public domain | FUB `eng_bbe` | SM, SW, BA |
| `OJB` | The Orthodox Jewish Bible | Bible | Open (attribution) | FUB `eng_ojb` | — |
| `F35` | The English New Testament According to Family 35 | New Testament | Open (attribution) | FUB `eng_f35` | WL |
| `TCENT` | Text-Critical English New Testament | New Testament | Open (attribution) | FUB `eng_tce` | WL |
| `GHT` | Garth's Hyper-literal Translation | New Testament | Public domain | SW `GHT` | FUB |
| `DRA` | Douay-Rheims 1899 American Edition | Catholic Bible | Public domain | FUB `eng_dra` | BA, WL |
| `DRC` | Douay-Rheims Bible, Challoner Revision | Catholic Bible | Public domain | SM `DRC` | SW |
| `CPDV` | Catholic Public Domain Version | Catholic Bible | Public domain | SM `CPDV` | SW |
| `Wycliffe` | John Wycliffe Bible (c.1395, Middle English) | Bible | Open (attribution) | SM `Wycliffe` | SW |
| `W88` | Wycliffe Bible portions | Portions | Public domain | FUB `eng_w88` | — |
| `Tyndale` | William Tyndale Bible (1525/1530) — Free Use Bible API carries the NT only. | Partial Bible | Public domain | FUB `eng_tnt` | SM, SW |
| `Geneva1599` | Geneva Bible (1599) | Bible | Public domain | FUB `eng_gnv` | SM, SW, WL |
| `Darby` | Darby Bible (1889) | Bible | Public domain | FUB `eng_dby` | SM, SW, BA |
| `YLT` | Young's Literal Translation (1898) | Bible | Public domain | FUB `eng_ylt` | SM, SW |
| `Rotherham` | The Emphasised Bible (J. B. Rotherham) | Bible | Public domain | SM `Rotherham` | SW |
| `Noyes` | Noyes Translation (1869) | Partial Bible | Public domain | FUB `eng_noy` | SM, SW |
| `Anderson` | Henry Tompkins Anderson's New Testament (1864) | New Testament | Public domain | SM `Anderson` | SW |
| `Haweis` | Thomas Haweis New Testament (1795) | New Testament | Public domain | SM `Haweis` | SW |
| `Worsley` | John Worsley New Testament (1770) | New Testament | Public domain | SW `Worsley` | — |
| `Twenty` | Twentieth Century New Testament | New Testament | Public domain | SM `Twenty` | SW |
| `Godbey` | William Baxter Godbey New Testament (1902) | New Testament | Public domain | SW `Godbey` | — |
| `Montgomery` | Montgomery New Testament (1924) | New Testament | Public domain | SW `Montgomery` | — |
| `Weymouth` | Weymouth New Testament (1912) | New Testament | Public domain | SW `Weymouth` | — |
| `Diaglott` | The Emphatic Diaglott | New Testament | Public domain | SW `Diaglott` | — |
| `JST` | Joseph Smith Translation — Latter-day Saint revision of the KJV. | Bible | Public domain | SW `JST` | — |
| `Etheridge` | Peshitta Syriac New Testament (J. W. Etheridge) | New Testament | Public domain | SW `Etheridge` | — |
| `Murdock` | James Murdock's Translation of the Syriac Peshitta | New Testament | Public domain | SW `Murdock` | — |
| `Brenton` | Brenton English Septuagint | Old Testament (LXX) | Public domain | FUB `eng_bre` | WL |
| `BrentonUpd` | Brenton English Septuagint, updated spelling | Old Testament (LXX) | Public domain | FUB `eng_boy` | WL |
| `LXX2012` | LXX2012: Septuagint in American English | Old Testament (LXX) | Public domain | FUB `eng_lxx` | — |
| `LXX2012UK` | LXX2012: Septuagint in British English | Old Testament (LXX) | Public domain | FUB `eng_lxu` | — |
| `JPS1917` | JPS Tanakh (1917) | Old Testament (Tanakh) | Public domain | FUB `eng_jps` | SM, SW, WL |
| `Leeser` | Leeser Tanakh (1853) | Old Testament (Tanakh) | Public domain | FUB `eng_lee` | — |
| `Onkelos` | Targum Onkelos (J. W. Etheridge) | Pentateuch (Targum) | Public domain | FUB `eng_oke` | WL |
| `OURB` | One Unity Resource Bible | Portions | Open (attribution) | FUB `eng_our` | — |
| `E2T-Jonah` | E2T Jonah | Portions | Open (attribution) | FUB `eng_e2t` | — |

## Catalogued only — licence does not allow redistribution (24)

| Key | Version | Scope | Licence | Sources |
| --- | --- | --- | --- | --- |
| `AKJV` | American King James Version (1999) — Author placed it in the public domain, but both carrying sources label it non-commercial; treated conservatively. | Bible | Non-commercial only | SM (Copyrighted; Free non-commercial distribution), SW (Copyrighted; Free non-commercial distribution) |
| `MKJV` | Green's Modern King James Version | Bible | CrossWire permission only ⚠ | SM (Copyrighted; Non-commercial distribution), SW (Copyrighted; Permission to distribute granted to CrossWire) |
| `LITV` | Green's Literal Translation | Bible | CrossWire permission only ⚠ | SM (Copyrighted; Free non-commercial distribution), SW (Copyrighted; Permission to distribute granted to CrossWire) |
| `AFV` | A Faithful Version (2020) | Bible | Non-commercial only | SW (Copyrighted; Free non-commercial distribution) |
| `Jubilee2000` | English Jubilee 2000 Bible | Bible | Non-commercial only | SM (Copyrighted; Free non-commercial distribution), SW (Copyrighted; Free non-commercial distribution) |
| `LEB` | Lexham English Bible | Bible | Non-commercial only | FUB (commercial use not-allowed, derivatives not-allowed, attribution required), SM (Copyrighted; Free non-commercial distribution), SW (Copyrighted; Free non-commercial distribution) |
| `ISV` | International Standard Version | Bible | CrossWire permission only | SW (Copyrighted; Permission to distribute granted to CrossWire) |
| `GW` | GOD'S WORD to the Nations | Bible | CrossWire permission only | SW (Copyrighted; Permission to distribute granted to CrossWire) |
| `BWE` | Bible in Worldwide English | Bible | CrossWire permission only | SW (Copyrighted; Permission to distribute granted to CrossWire) |
| `NMV` | New Messianic Version | Bible | Non-commercial only | FUB (commercial use not-allowed, derivatives not-allowed, attribution required) |
| `OJBC` | The Orthodox Jewish Brit Chadasha | New Testament | CrossWire permission only | SW (Copyrighted; Permission to distribute granted to CrossWire) |
| `RcV` | Recovery Version (text only) | Bible | CrossWire permission only | SW (Copyrighted; Permission to distribute granted to CrossWire) |
| `Common` | The Common Edition: New Testament | New Testament | Non-commercial only | SW (Copyrighted; Free non-commercial distribution) |
| `EMTV` | English Majority Text Version | New Testament | CrossWire permission only ⚠ | FUB (commercial use not-allowed, derivatives not-allowed, attribution required), SW (Copyrighted; Permission to distribute granted to CrossWire), WL (not stated) |
| `WBMS` | Wycliffe's Bible, Modern Spelling (with Deuterocanon) | Bible + Deuterocanon | Non-commercial only | FUB (commercial use not-allowed, derivatives not-allowed, attribution required) |
| `WBMSE` | Wycliffe's Bible, Modern Spelling, Enhanced (with Deuterocanon) | Bible + Deuterocanon | Non-commercial only | FUB (commercial use not-allowed, derivatives not-allowed, attribution required) |
| `LivingOracles` | The Living Oracles New Testament | New Testament | Unknown | SW (not stated) |
| `AB` | The Apostles' Bible (Septuagint-based) | Bible | CrossWire permission only | SW (Copyrighted; Permission to distribute granted to CrossWire) |
| `ABP` | Apostolic Bible Polyglot English Text | Bible | CrossWire permission only | SW (Copyrighted; Permission to distribute granted to CrossWire) |
| `SPE` | Samaritan Pentateuch in English | Pentateuch | Non-commercial only | SW (Copyrighted; Free non-commercial distribution) |
| `AEB` | Anindilyakwa English Bible — Australian regional English portions. | Portions | Non-commercial only | FUB (commercial use not-allowed, derivatives not-allowed, attribution required) |
| `BBP` | Barkly Bible Portions — Australian regional English portions. | Portions | Non-commercial only | FUB (commercial use not-allowed, derivatives not-allowed, attribution required) |
| `NEB-Nyangumarta` | Nyangumarta English Bible — Australian regional English portions; not the New English Bible. | Portions | Non-commercial only | FUB (commercial use not-allowed, derivatives not-allowed, attribution required) |
| `GLW` | God's Living Word | Portions | No derivatives | FUB (commercial use allowed, derivatives not-allowed, attribution required) |

## Copyrighted — keyed API only (never bundled) (11)

| Key | Version | Scope | Licence | Sources |
| --- | --- | --- | --- | --- |
| `NET` | NET Bible (New English Translation) — SWORD also carries "nettext" (text only with footnote markers). | Bible | Copyrighted | FUB (not stated (see https://ebible.org/Scriptures/details.php?id=engnet)), SW (Copyrighted) |
| `ESV` | English Standard Version — Copyrighted; never bundled. Access: Crossway ESV API (api.esv.org) — already handled by B5 §4.1 (ephemeral cache, 500-verse cap) | Bible | Copyrighted | Crossway ESV API (Copyrighted) |
| `NIV` | New International Version — Copyrighted; never bundled. Access: API.Bible (per-translation licence required) | Bible | Copyrighted | API.Bible (Copyrighted) |
| `NLT` | New Living Translation — Copyrighted; never bundled. Access: API.Bible (per-translation licence required) | Bible | Copyrighted | API.Bible (Copyrighted) |
| `NASB` | New American Standard Bible (1995 / 2020) — Copyrighted; never bundled. Access: API.Bible (per-translation licence required) | Bible | Copyrighted | API.Bible (Copyrighted) |
| `NKJV` | New King James Version — Copyrighted; never bundled. Access: API.Bible (per-translation licence required) | Bible | Copyrighted | API.Bible (Copyrighted) |
| `CSB` | Christian Standard Bible — Copyrighted; never bundled. Access: API.Bible (per-translation licence required) | Bible | Copyrighted | API.Bible (Copyrighted) |
| `AMP` | Amplified Bible — Copyrighted; never bundled. Access: API.Bible (per-translation licence required) | Bible | Copyrighted | API.Bible (Copyrighted) |
| `MSG` | The Message — Copyrighted; never bundled. Access: API.Bible (per-translation licence required) | Bible | Copyrighted | API.Bible (Copyrighted) |
| `GNT` | Good News Translation — Copyrighted; never bundled. Access: API.Bible (per-translation licence required) | Bible | Copyrighted | API.Bible (Copyrighted) |
| `CEV` | Contemporary English Version — Copyrighted; never bundled. Access: API.Bible (per-translation licence required) | Bible | Copyrighted | API.Bible (Copyrighted) |

## Sources Not Found

- **beandog/bible-sqlite** — GitHub 404 on 2026-11-28; the user beandog has no Bible repositories.
- **fofgof/Bible-Database** — GitHub 404 on 2026-11-28; no such user.
- **YouVersion Platform** — Version list requires a developer key; not queried.
- **Biblia.com API** — Registration closed; not queried.

## Data-Quality Notes

- scrollmapper `Rotherham` contains replacement characters (`�`) where the original has em dashes; prefer the SWORD
  module or another source before building a pack.
- SWORD modules are stored as their original zip (compressed `ztext`); they need a SWORD reader in the pipeline
  before they can become packs.
- The KJV SWORD module is labelled GPL (its markup and Strong's tagging); the KJV text itself is public domain
  outside the UK (Crown letters patent apply in the UK).
- Current shipping packs (`core_bsb`, `trans_kjv`, `trans_web`) are built from eBible USFM, not from these files.

## Change Log

- `0.1.0` | `2026-11-28` | Claude | Initial catalog: 105 versions from 5 queried sources + keyed-API names; 70
  redistributable texts stored.

## Traceability

- Source: `EXTRAS-SRC` §1, §2, §4; data `tools/pack-builder/data/english-bible-versions.json`.
- Downstream: `B5` (licensing matrix), `B4` (`trans_*` pack schema).
