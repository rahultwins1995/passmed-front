# PH (PassPLE) CMS Content Extraction — Summary

Source: rendered frontend HTML `19b8e8fb-passplephfrontend.html`
Region: **PH** · Brand: **PassPLE** · Domain: **passmed.ph** · Single exam: **PLE** (Physician Licensure Examination)
Payloads mirror the UK template schema (`tools/uk-populate/*`).

## Deliverables
| File | Count |
|------|-------|
| `pages.payload.json` | 9 pages |
| `exams.payload.json` | 1 exam |
| `faqs.payload.json` | 28 FAQs |

## Pages (9 slugs, same as UK template)
`/`, `/exams`, `/pricing`, `/faq`, `/about-us`, `/contact`, `/institutions`, `/terms`, `/privacy`

- Content extracted **verbatim** from the rendered DOM by line range (no invented text).
- Home: `content_html` = hero + trust strip; `content_1` = PLE pathway -> how-it-works -> stats -> features -> reviews -> FAQ -> CTA.
- Exams: `content_html` = page hero; `content_1` = exam card panel + comparison table + CTA.
- Pricing & FAQ: `content_html` = page hero only; `content_1` = "" (mirrors UK — pricing table and FAQ list render dynamically / are held separately). The FAQ Q&A live in `faqs.payload.json`.
- About / Institutions / Terms / Privacy: full rendered section markup in `content_html`.
- Contact: hero in `content_html`; `form_*` fields retained (name, email, subject select, message). Subject options match the PH contact form (trial, billing, account, content, technical, institutions, other).
- **Terms & Privacy are PH-specific and copied faithfully** — Philippine **Data Privacy Act of 2012 (R.A. 10173)**, National Privacy Commission (NPC), Consumer Act **R.A. 7394 (DTI)**, BIR record-keeping, Singapore governing law with Philippine consumer rights preserved. Source had stray JS-style `\'` escapes inside the legal copy; these were normalised to real apostrophes so the legal text renders correctly.
- SEO titles/descriptions/keywords written PH-specific (brand PassPLE, PLE, PRC). `canonical_url` uses `https://www.passmed.ph`.

## Exam (single)
- `name` = **"Physician Licensure Examination"** (the PLE proper name from HTML) · `slug` = `ple`
- `_category` = "Medical Licensing" · `type` = "board" · `accent_title` = "teal" · `accent_color` = "#06b6d4" · `status` = 1
- `free_trial` = 1 · `free_trial_duration` = **"7 days"** (7-day free trial stated throughout)
- Question count: **8,300+ MCQs** in the bank (used for `short_description`, hero tags, glance, question-bank blurb). Note: the real exam is 1,200 questions (100 x 12 subjects) — captured in the `content` Details table, distinct from the 8,300+ bank size.
- `content` rich fields built from the page's `EXAMS_DATA.ple` object: overview, exam details (format, 1,200 Qs, 4 days over 2 weekends, PRC Table of Specifications, testing centers, 75% pass mark / no subject < 50%, twice-yearly, refresher after 3 fails), eligibility, and official source `prc.gov.ph`.
- `content_bluehairline` = "Philippine Physician Licensure" · `content_greyhairline` = "Professional Regulation Commission".

## PRICING — gap
**Pricing was NOT present in the rendered/static HTML.** The visible pricing tables (exam-detail and pricing pages) are empty placeholders populated dynamically by JavaScript. Per instructions, `price_1`, `price_3`, `price_6`, `price_12` are all set to **`null`**. Currency for PH is **PHP (PHP)** (USD equivalents shown for reference; charges in PHP incl. 12% VAT).

**Plan durations mentioned in the HTML:** **1 month, 2 months, 3 months, 6 months** (6-month = "Best value"). Note this does not match the UK-schema price fields (1/3/6/12) — there is no 2-month or 12-month field, and no 12-month plan is offered.

> Reviewer note (not seeded): the page's embedded `EXAMS_DATA.ple.pricing` JS array does contain indicative figures — PHP 990 (1mo), PHP 1,690 (2mo), PHP 2,190 (3mo), PHP 2,490 (6mo), with USD refs $16/$27/$36/$40. These were **not** written into the payload because (a) instructions require null prices, and (b) the durations don't map cleanly to the schema's 1/3/6/12 fields. Flagged here for whoever finalises PH pricing.

## FAQs — 28 total
Extracted every FAQ question+answer from the FAQ page (23) + the Institutions page FAQ block (5). Verbatim answers with inline links preserved. `status` = 1, `sort_order` = index.

Type distribution (types restricted to the allowed set; source "general" -> `getting-started`, source "refunds & trials" -> `pricing`):
- `getting-started`: 4
- `pricing`: 8 (includes the 4 refunds/trials items)
- `content`: 4
- `account`: 4
- `institutions`: 8 (3 from FAQ page + 5 from Institutions page)

The home page also shows a 6-item FAQ accordion, but those duplicate FAQ-page content and were not double-counted.

## Notes / ambiguities
- The exams-page PLE card describes a "230-MCQ test" — an apparent authoring artifact inconsistent with the exam-detail spec (1,200 real-exam questions / 8,300+ bank). The authoritative exam-detail figures were used for the exam payload.
- Currency toggle (PHP/USD) and world-map/logo SVGs are decorative and retained verbatim where they fall inside extracted sections.
- `populate.mjs` was not copied; the PH runner (env prefix / admin base) is out of scope for this extraction task. Payloads are shaped to be consumed by the same runner pattern.
