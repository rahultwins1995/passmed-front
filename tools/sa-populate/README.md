# SA CMS populate (one-off)

Seeds the Passmed **SA** CMS with the 9 marketing pages and 15 exams via the
admin API (`pm-admin-sa.vercel.app`). Self-contained: `populate.mjs` reads the
two payload files in this folder. Safe to delete once SA content is seeded.

## Contents
- `pages.payload.json` — 9 page records (title, slug, SEO, `content_html`, `content_1`).
- `exams.payload.json` — 15 exam records (SEO, ZAR prices 1/3/6/12, all content fields, `_category`).
- `faqs.payload.json` — 51 FAQ records (question, answer HTML, `type` category, `sort_order`).
- `populate.mjs` — idempotent upsert runner (login → categories → pages/exams).

## Run

Dry-run (no network):
```bash
node tools/sa-populate/populate.mjs
```

Staged live rollout:
```bash
# 1 page, verify on pm-frontend-sa.vercel.app, then the rest
SA_EMAIL=admin-sa@gmail.com SA_PASSWORD=… DRY_RUN=0 ONLY=pages LIMIT=1 node tools/sa-populate/populate.mjs
SA_EMAIL=admin-sa@gmail.com SA_PASSWORD=… DRY_RUN=0 ONLY=pages          node tools/sa-populate/populate.mjs
# 1 exam, verify, then the rest
SA_EMAIL=admin-sa@gmail.com SA_PASSWORD=… DRY_RUN=0 ONLY=exams LIMIT=1  node tools/sa-populate/populate.mjs
SA_EMAIL=admin-sa@gmail.com SA_PASSWORD=… DRY_RUN=0 ONLY=exams          node tools/sa-populate/populate.mjs
SA_EMAIL=admin-sa@gmail.com SA_PASSWORD=… DRY_RUN=0 ONLY=faqs           node tools/sa-populate/populate.mjs
```

Everything at once:
```bash
SA_EMAIL=admin-sa@gmail.com SA_PASSWORD=… DRY_RUN=0 node tools/sa-populate/populate.mjs
```

## Env
| var | default | note |
|---|---|---|
| `SA_API_BASE` | `https://pm-admin-sa.vercel.app/api` | admin `/api` proxy → SA backend |
| `SA_EMAIL` / `SA_PASSWORD` | — | admin login (or set `SA_TOKEN`) |
| `SA_TOKEN` | — | bearer token, skips login |
| `DRY_RUN` | `1` | `0` = live writes |
| `ONLY` | `all` | `pages` \| `exams` \| `all` |
| `LIMIT` | ∞ | first N of each type |
| `SLUG_STYLE` | `bare` | `pricing`/`home` (matches the frontend's `getpage/{slug}`) vs `path` (`/pricing`, `/`) |
| `UPSERT` | `1` | update by slug if it exists, else add |

Credentials are read from the environment only — never hard-code them here.
The runner requires the host to be on the session's network egress allowlist.
