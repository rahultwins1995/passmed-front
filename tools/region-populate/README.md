# region-populate — generalized CMS seeder

One runner that seeds any region's admin CMS from `../<region>-populate/{pages,exams,faqs}.payload.json`.
Same idempotent logic as `tools/uk-populate` (pages by slug; exams matched by
**name** then updated to force the canonical slug; FAQs by question with
`portal_type=home`).

```bash
# dry-run
REGION=au node populate.mjs

# staged: one page live, then one exam, then the rest (per your gate flow)
REGION=au DRY_RUN=0 ONLY=pages LIMIT=1 node populate.mjs
REGION=au DRY_RUN=0 ONLY=pages        node populate.mjs
REGION=au DRY_RUN=0 ONLY=exams LIMIT=1 node populate.mjs
REGION=au DRY_RUN=0 ONLY=exams        node populate.mjs
REGION=au DRY_RUN=0 ONLY=faqs         node populate.mjs
```

`REGION` ∈ `au | ca | ph | uk | sa | us` → backend `pm-admin-<region>.vercel.app/api`,
login `admin-<region>@gmail.com`. Prices come from each exam payload's
`price_1/3/6/12` (platform tiers are fixed at 1/3/6/12 months; empty tiers are
hidden on the exam page).
