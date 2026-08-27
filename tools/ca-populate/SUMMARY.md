# CA (PassMCCQE) content extraction — summary

Source: `466b8053-passmccqecafrontend.html` (rendered static frontend for **passmed.ca**, brand **PassMCCQE**, single exam **MCCQE Part 1**).
Payloads mirror the UK templates in `tools/uk-populate/` exactly (same keys/shapes) and are consumed by the same `populate.mjs` runner (use a `CA_`-style env prefix / `CA_API_BASE`; the shipped runner is UK-specific).

## Counts

| File | Items |
|------|-------|
| `pages.payload.json` | **9** pages — `/`, `/exams`, `/pricing`, `/faq`, `/about-us`, `/contact`, `/institutions`, `/terms`, `/privacy` |
| `exams.payload.json` | **1** exam — MCCQE Part 1 |
| `faqs.payload.json` | **28** FAQs |

FAQ type breakdown: `getting-started` 4, `pricing` 8, `content` 4, `account` 4, `institutions` 8.
(23 from the FAQ page + 5 from the Institutions-page FAQ block. FAQ-page `general`->getting-started, `pricing`+`refunds`->pricing, `content`->content, `account`->account, `institutions`->institutions.) `status:1`, `sort_order` = 0-based index across the whole list. The 6 marketing FAQs duplicated in the home-page FAQ section were intentionally **not** re-added (they restate FAQ-page items).

## Exam

- `name` "MCCQE Part 1", `slug` "mccqe-1", `_category` "Medical Licensing", `type` "board", `accent_title` "teal", `accent_color` "#06b6d4", `status` 1.
- `free_trial` 1, `free_trial_duration` "7 days" (HTML states a 7-day free trial with full access, no card).
- `content` / `content_*` rich fields built verbatim from the page's `EXAMS_DATA['mccqe-1']` object: overview (2 paras, incl. the 2025 CDM-removal reform), the 8 detail rows, and the 5 eligibility requirements, plus official source `mcc.ca`.
- **Question count used: 3,123** (the figure carried throughout the HTML: hero, stats band, `qcount`, exam card, at-a-glance). Written as "3,123+".
- Exam blueprint facts from HTML: 230 MCQs in 2 sections of 115; 6.5 h total; pass mark 226 (scale 100-400); 4 sessions/yr; up to 4 attempts; Prometric / remote proctoring.

## PRICING — not carried into the payloads (all four price fields = null)

Per instruction, `price_1`, `price_3`, `price_6`, `price_12` are all **null**. Currency for CA is **CAD**.

Note on reliability: the schema's price fields are **1 / 3 / 6 / 12 months**, but the HTML does **not** use that ladder, so the numbers do not map cleanly and were left null. What the HTML actually states about plans:

- **Durations offered: 1, 2, 3, and 6 months** (a **2-month** tier the schema has no slot for; and **no 12-month** tier at all). Confirmed in the pricing-page duration tabs, the FAQ "How does pricing work?", and Terms section 4.
- **6-month tier is flagged "Best value".**
- **Free trial: 7 days**, full access, no card required.
- **One-off payments, no auto-renewal** (explicitly, repeatedly — Terms sections 4/5, FAQ, hero microtrust).
- **14-day money-back guarantee** (refund if <50 questions answered across trial + paid).
- Prices shown in **CAD with USD equivalents**; processed in CAD inclusive of GST/HST.

For reference only (present in the page's `EXAMS_DATA.pricing`, **not** written to the payload): 1 mo C\$60/US\$45, 2 mo C\$95/US\$70, 3 mo C\$120/US\$90, 6 mo C\$130/US\$96. These were left out because the field mapping is unreliable (2-month vs 12-month mismatch) and the instruction was to null them.

## Terms & Privacy (Canadian law) — copied faithfully

- **Terms** (`/terms`): governing law Singapore for non-consumer matters; Canadian provincial consumer-protection statutes preserved (Ontario CPA 2002, Quebec CPA, BC BPCPA, Alberta CPA, etc.); PIPEDA referenced; AI-training prohibition; liability cap wording — all verbatim.
- **Privacy** (`/privacy`): built on **PIPEDA** and the ten Fair Information Principles (Schedule 1); provincial laws (Alberta/BC PIPA, Quebec Law 25, Ontario PHIPA); cross-border disclosures; OPC complaint route (priv.gc.ca); breach reporting under s.10.1. All verbatim.
- Institutions page privacy copy ("PIPEDA compliant", PHIPA addenda, EFT/SWIFT in CAD) preserved verbatim.

## Extraction method & minor normalisations (applied to all extracted HTML)

Content was extracted verbatim from the DOM by exact line range (see `scratchpad/build.mjs`). Two mechanical fixes were applied so the CMS pages are clean and navigable:

1. **backslash-apostrophe -> apostrophe** — the source Terms/Privacy markup contains a template-escaping artifact (literal `\'`, e.g. `Don\'t`); unescaped to a normal apostrophe.
2. **SPA handlers -> hrefs** — `onclick="navTo('x')"` -> `href="/x"` (home -> `/`), `onclick="navToExam('mccqe-1')"` -> `href="/exams/mccqe-1"`, `onclick="openSignup()"` -> `href="#"`. Matches the UK template's use of real hrefs; `mailto:` and `#contact-form` links untouched.

## Things to flag / ambiguous

- **Decorative world-map SVG omitted.** The About page's `<svg class="world-map-svg">` is a single ~8 KB decorative path; replaced with `<!-- decorative world map SVG omitted -->`. The surrounding country-dot labels (US, Canada, UK, South Africa, Philippines, Australia) are retained. No informational content lost.
- **Contact page** uses the UK-style `form_*` fields (name / email / subject-select / message) rather than embedding the raw inline form. Subject options are the CA page's own list (Free trial, Billing, Account access, Question content/error, Technical, Institutional/group licensing, Other). `form_success_html` mirrors the page's success state ("Message sent").
- **Pricing page `content_1`** includes the pricing table shell, but the table body is populated by JS at runtime (`<tbody id="pricing-doctors-tbody">` is empty in source) — no per-row prices exist in the static DOM.
- **No `<meta name="keywords">`** in source; `seo_keywords` on every page was composed from on-page terms (PassMCCQE, MCCQE Part 1, MCC, LMCC, Canadian residency, IMG, CMG, question bank, SBA).
- **Contact/support emails** in the CA site are `support@passmed.com` and `institutions@passmed.com` (note `.com`, not `.ca`) — preserved as-is from source. Legal correspondence also routes to `support@passmed.com` (the CA Terms/Privacy do not use the UK `legal@`/`privacy@` addresses).
- Operator entity: **Passmed Pte. Ltd. (Singapore)**, (c) 2026.
