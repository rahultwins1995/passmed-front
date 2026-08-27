# UK CMS populate (one-off)

Seeds the Passmed **UK** CMS with marketing pages and exams via the admin API
(`pm-admin-uk.vercel.app`). Same runner as `tools/sa-populate`; only the env-var
prefix (`UK_`) and default admin base differ. Safe to delete once UK content is
seeded.

> ⚠️ **These payload files are STALE relative to the live UK Supabase database
> as of 25 Aug 2026 audit remediation.** The live DB (`kpxqwemddfdptywwvdla`,
> `exams`/`pages`/`faqs` tables) received a round of direct fixes — wrong exam
> facts, question-count mismatches, SA-origin copy, FAQ gaps, etc. — that were
> **not** re-exported back into these JSON files for every field. **Do not run
> `populate.mjs` against the live UK CMS without first diffing this payload
> against a fresh export of the live tables**, or it will silently overwrite
> those fixes with the older, wrong content still sitting in this repo.

## Contents
- `pages.payload.json` — page records (kept roughly in sync with `home`,
  `about-us`, `institutions`, `exams` for the region-leakage/copy fixes; not
  exhaustively re-synced for every live edit — see warning above).
- `exams.payload.json` — exam records (kept roughly in sync for the
  Workstream 2/3 fact and question-count fixes; not exhaustively re-synced —
  see warning above). Also note: the live `exams` table has 23 records (20
  real + 3 external stubs: `amc`, `mccqe`, `usmle-step-2`), while this file
  has only 19 — `psa` is missing here despite existing and being correctly
  configured live.
- `faqs.payload.json` — FAQ records (kept roughly in sync for the fixes
  applied here; the live `faqs` table has 40 rows vs. 51 in this file — do
  not assume row-for-row parity).
- `populate.mjs` — idempotent upsert runner (login → categories → pages/exams).

## Before it can run — two blockers
1. **Allowlist** `pm-admin-uk.vercel.app` on the session's network egress
   (as was done for `pm-admin-sa`). Until then the host is unreachable.
2. **Admin credentials** for the UK admin (`UK_EMAIL` + `UK_PASSWORD`, or `UK_TOKEN`).

## Run (staged, same as SA)
```bash
node tools/uk-populate/populate.mjs                                         # offline dry-run
UK_EMAIL=… UK_PASSWORD=… DRY_RUN=0 ONLY=pages LIMIT=1 node tools/uk-populate/populate.mjs
UK_EMAIL=… UK_PASSWORD=… DRY_RUN=0 ONLY=pages          node tools/uk-populate/populate.mjs
UK_EMAIL=… UK_PASSWORD=… DRY_RUN=0 ONLY=exams LIMIT=1  node tools/uk-populate/populate.mjs
UK_EMAIL=… UK_PASSWORD=… DRY_RUN=0 ONLY=exams          node tools/uk-populate/populate.mjs
UK_EMAIL=… UK_PASSWORD=… DRY_RUN=0 ONLY=faqs           node tools/uk-populate/populate.mjs
```

## Env
| var | default | note |
|---|---|---|
| `UK_API_BASE` | `https://pm-admin-uk.vercel.app/api` | admin `/api` proxy → UK backend |
| `UK_EMAIL` / `UK_PASSWORD` | — | admin login (or set `UK_TOKEN`) |
| `UK_TOKEN` | — | bearer token, skips login |
| `DRY_RUN` | `1` | `0` = live writes |
| `ONLY` | `all` | `pages` \| `exams` \| `all` |
| `LIMIT` | ∞ | first N of each type |
| `SLUG_STYLE` | `bare` | `home`/`pricing` (matches frontend `getpage/{slug}`) |
| `UPSERT` | `1` | update by slug if it exists, else add |

---

## Content needed (what to provide)

### Pages — one object per page in `pages.payload.json`
Slugs the frontend reads (bare): `/`, `/exams`, `/pricing`, `/faq`, `/about-us`,
`/contact`, `/institutions`, `/terms`, `/privacy` (the runner strips the leading
slash). Fields per page:

| field | notes |
|---|---|
| `title` | admin label |
| `status` | `1` = published |
| `slug` | `/`, `/exams`, … (leading slash ok; converted to bare) |
| `seo_title`, `seo_keywords`, `seo_description` | SEO — use "Passmed UK" branding |
| `content_html` | **hero blob** — rendered as `page.content` (top of the page) |
| `content_1` | **second blob** — rendered as `page.content_1` (FAQ / lower content) |
| `canonical_url` | e.g. `https://passmed.co.uk/pricing` |
| `hero_title` | optional |
| `form_intro_html`, `form_success_html`, `form_submit_label`, `form_fields` | contact form-builder only (see sa-populate contact for shape) |

> Note: home's "Two audiences" band and the exact form inputs are hardcoded in the
> Nuxt build, not CMS — only `content`/`content_1` blobs are CMS-driven.

### Exams — one object per exam in `exams.payload.json`
| field | notes |
|---|---|
| `_category` | grouping name, e.g. `MRCP`, `MRCS`, `Royal College Membership` — auto-created as a category |
| `name`, `slug` | e.g. `MRCP Part 1`, `mrcp-part-1` |
| `type` | e.g. `board` |
| `accent_color` / `accent_title` | audience colour — `#06b6d4`/`teal` (doctors) or amber (students) |
| `icon`, `short_description`, `format`, `administered_by` | display metadata |
| `free_trial`, `free_trial_duration`, `free_trial_questions_accessible`, `free_trial_restriction_mode` | trial config |
| `status` | `1` = published |
| `question_ids` | usually `[]` |
| `seo_title`, `seo_description`, `seo_keywords` | SEO |
| `price_1`, `price_3`, `price_6`, `price_12` | **GBP** prices for 1/3/6/12-month plans |
| `content`, `content_1`, `content_3`, `content_6`, `content_12` | overview + per-plan feature blobs |
| `content_bluehairline`, `content_greyhairline`, `content_hero_tags`, `content_question_bank`, `content_glance`, `content_features` | exam-page sections |

The runner upserts by slug (safe to re-run). Credentials are read from the
environment only — never hard-code them here.
