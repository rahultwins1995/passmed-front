# PassAMC (AU) CMS extraction — SUMMARY

Extracted from the rendered SPA prototype `f9ae8ada-passamcaufrontend.html`
into three CMS payloads that mirror the UK template schema
(`tools/uk-populate/*.payload.json`) exactly, so the same runner
(`tools/uk-populate/populate.mjs`) can consume them.

- Brand: PassAMC · domain passamc.org · region AU · currency AUD
- Single exam: Australian Medical Council MCQ (CAT) — the IMG gateway exam for AHPRA registration.

## Counts

| File | Count |
|------|-------|
| pages.payload.json | 9 pages (/, /exams, /pricing, /faq, /about-us, /contact, /institutions, /terms, /privacy) |
| exams.payload.json | 1 exam (slug `amc`) |
| faqs.payload.json | 30 FAQs |

Validated by JSON round-trip parse and by a DRY_RUN=1 pass through the UK
runner — all three files load and are consumed correctly (pages seed as bare
slugs `home, exams, …`; exam category resolves to `Medical Licensing`).

## PRICING — the important gap

The task brief assumed the HTML contains no prices and instructed that
price_1/3/6/12 be set to null. I followed that instruction — all four price
fields on the exam are null.

HOWEVER, prices ARE present in the HTML. The frontend `EXAMS_DATA` JavaScript
object (script block, ~line 6026) carries a hard-coded `pricing` array for
`amc-mcq`, as [label, AUD, USD, bestValue]:

| Plan duration | AUD | USD (reference) | Note |
|---------------|-----|-----------------|------|
| 1 Month  | A$49  | US$31 | |
| 2 Months | A$69  | US$45 | |
| 3 Months | A$89  | US$57 | |
| 6 Months | A$119 | US$77 | Best value (default-selected) |

These were left OUT of the payload per the explicit brief. If they should in
fact be seeded, add them manually. Two mismatches to resolve first:

1. Plan durations differ from the schema fields. AU plans are 1 / 2 / 3 / 6
   months. The schema only has price_1, price_3, price_6, price_12 (i.e. it
   expects 1/3/6/12). There is no price_2 field and no 12-month AU plan. A
   clean mapping would be price_1=49, price_3=89, price_6=119, price_12=null —
   but that silently drops the 2-month tier (A$69). Decide how to handle the
   2-month plan and the empty 12-month slot before seeding.
2. Currency is AUD (the runner's log prints a `£` prefix — cosmetic only; the
   stored value is just a number). USD figures are on-site reference only.

### Plan structure the HTML actually mentions (for the record)
- 7-day free trial, no card required, does not auto-convert. (free_trial_duration set to "7 days".)
- One-off payments, no auto-renewal.
- Individual durations: 1, 2, 3, 6 months (6-month = best value).
- 14-day money-back guarantee (refund if <50 questions answered across trial + paid).
- Prices in AUD inc. 10% GST where applicable; USD equivalents shown for reference.
- Institutional: per-seat annual licences, three tiers (Starter 5–25 / Programme 26–250 / Enterprise 250+), 14-day free pilot up to 10 seats. No dollar figures given.

## Exam extraction notes

- name = "AMC MCQ (CAT)" (full name on the exam card / nav; EXAMS_DATA.name is the shorter "AMC MCQ"). slug = `amc`.
- _category = Medical Licensing, type = board, accent_title = teal, accent_color = #06b6d4, status = 1, free_trial = 1, free_trial_duration = "7 days".
- short_description uses the "Over 3,700 …" figure (site uses 3,700+ SBA questions consistently; EXAMS_DATA.qcount = "3,700").
- content (overview + details + eligibility), content_hero_tags, content_question_bank, content_glance, content_features, content_1/3/6/12 all populated from the exam-detail template + EXAMS_DATA (Computer Adaptive Test, 150 questions, 3.5 h, 7 disciplines, Pearson VUE, official source amc.org.au).
- content_bluehairline = "AHPRA Registration" (exam eyebrow/specialty); content_greyhairline = "Australian Medical Council" (college hairline). NB: in the UK template bluehairline equals the category; here category is Medical Licensing but the on-page specialty label is "AHPRA Registration", so they intentionally differ.
- format left "" and free_trial_questions_accessible / free_trial_restriction_mode left "" (matches how UK template leaves them blank). administered_by set to "Australian Medical Council" (UK leaves blank; populated here as the HTML states it clearly).

## FAQ extraction notes

- 30 FAQs extracted. Sources combined and de-duplicated:
  - FAQ page (#page-faq): 22 items across the site's own categories (General, Pricing, Content, Account, Refunds & Trials, Institutions).
  - Home-page FAQ block: added the 2 not already covered ("How do I subscribe to an exam module?", "How are questions kept current?").
  - Institutions-page FAQ block: added its 5 items.
- The brief mentioned "~28"; the deduped total is 30. Verbatim question + answer HTML preserved (inline <a>, <strong>, <ul> kept; on-site onclick="navTo('…')" links rewritten to real hrefs like /exams, /pricing, /institutions).
- type mapped to the 5 allowed values (getting-started, pricing, content, account, institutions). The site's "General" → getting-started; "Refunds & Trials" → pricing (refund/trial) or getting-started (trial-end). Resulting counts: getting-started:4, pricing:5, content:6, account:5, institutions:10.
- status = 1, sort_order = array index (0-based).

## Pages extraction notes

- All 9 UK slugs have real source content in the AU HTML — none needed placeholder text.
- Home (/): hero + trust strip in content_html; remaining sections (path-split, AHPRA pathway, how-it-works, stats, features, testimonials, reviews, on-page FAQ, CTA) in content_1 — mirroring the UK split.
- Exams (/exams): page hero in content_html; AMC exam card + "what's inside" comparison table in content_1. The "Medical Students" tab is a coming-soon waitlist and was not seeded as content.
- Pricing (/pricing): hero (with the "Prices in AUD with USD shown for reference" line) in content_html; fineprint + institutional CTA in content_1. The actual price table is rendered dynamically from EXAMS_DATA in the SPA, so no price rows exist as static DOM — consistent with prices being null in the exam payload.
- Contact (/contact): hero + contact details in content_html; form_* fields populated like the UK template. Subject <select> options copied verbatim from the AU contact form (trial / billing / account / content / technical / institutions / other). form_success_html = the AU "Message sent" success card.
- Institutions (/institutions): full page (hero, 3 plan tiers, features, institutional FAQ, contact wrap). The lead-gen form is JS-only and omitted from content_html (matches UK).
- Terms (/terms) and Privacy (/privacy): copied verbatim and in full — these are AU-specific. Terms cite the Australian Consumer Law (Competition and Consumer Act 2010 (Cth)), AUD/GST, AUD $100 liability floor, and AI-training prohibition. Privacy is built around the Privacy Act 1988 (Cth) and the Australian Privacy Principles (APP 3–13), OAIC complaints, the Notifiable Data Breaches scheme, and 5-year AUD tax retention. Source had JS-escaped apostrophes (don\'t) and onclick="navTo(\'privacy\')" links — normalised to plain apostrophes and real href="/privacy" links.

## Assumptions / ambiguities

- canonical_url: built as https://www.passamc.org + slug (home = /), matching the page <link rel="canonical"> and og:url in the HTML head.
- seo_keywords: the HTML has no per-page keyword meta; a single sensible AU keyword string is applied to every page (same approach as the UK template).
- hero_title: null on every page (matches UK template).
- The exam-detail "At a glance" 4th tile ("∞ Updates included") was normalised to the UK 3-tile content_glance shape (Questions / Study modes / Curriculum-mapped) for schema fidelity.
- Decorative emoji/SVG icon markup from the source was largely trimmed from page content to keep the HTML clean; all TEXT content is preserved verbatim.
