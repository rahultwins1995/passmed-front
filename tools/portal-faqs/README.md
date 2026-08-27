# portal-faqs — student & institute portal FAQ seeding (SA + UK)

The student and institute portals read their Help/FAQ content from the **same
`/faqs` admin resource** as the marketing site, distinguished by a `portal_type`
field: `home` (marketing), `student`, `institute`. The admin FAQ screen has one
tab per `portal_type`; each portal's own read endpoint
(`api-student/v1/faqs`, `api-institute/v1/faqs`) returns only its group.

So a student FAQ is just a `/faqs` row with `portal_type: 'student'`. The
`/faqs`, `/faqs/add`, `/faqs/update/{id}` and `/faqs/counts` endpoints all accept
`portal_type`.

## Files

- `us-source.json` — US student/institute FAQs pulled from `passmedv2` (`/faqs?portal_type=`). The source of truth for the build.
- `build-payloads.mjs` — adapts the US source for SA + UK (localises exam coverage, generalises the mock-exam blueprint reference, cleans two corrupted US answers, standardises emails) → `{student,institute}-{sa,uk}.payload.json`.
- `populate.mjs` — seeds a region+portal payload into that region's admin `/faqs` with the right `portal_type`. Idempotent: matches by question **within** the `portal_type` group.
- `reclassify.mjs` — moves specific marketing (`home`) FAQs into the student/institute tabs. Note: `/faqs/update/{id}` scopes its lookup by the `portal_type` in the body, so it **cannot** change a FAQ's `portal_type` — a move is therefore an add-under-target + delete-from-home (add-first; idempotent). Also remaps each moved FAQ's `type` to the destination portal's chip categories.

## Usage

```bash
# rebuild payloads from the US source
node build-payloads.mjs

# dry-run (no writes)
REGION=uk PORTAL=student node populate.mjs

# one FAQ live (staged), then verify in the admin's "Student Portal" FAQ tab
REGION=uk PORTAL=student DRY_RUN=0 LIMIT=1 node populate.mjs

# all of a portal, live
REGION=uk PORTAL=student  DRY_RUN=0 node populate.mjs
REGION=uk PORTAL=institute DRY_RUN=0 node populate.mjs
REGION=sa PORTAL=student  DRY_RUN=0 node populate.mjs
REGION=sa PORTAL=institute DRY_RUN=0 node populate.mjs
```

`REGION` selects the backend (`pm-admin-<region>.vercel.app/api`) and default
admin login (`admin-<region>@gmail.com`). Counts: student = 17, institute = 8.

> Note: the portal front-ends only render this once each region's Vercel env
> (`NUXT_LARAVEL_API_STUDENT` / `NUXT_INSTITUTE_LARAVEL_API`) points at that
> region's backend. Until then, verify via the admin FAQ tabs.
