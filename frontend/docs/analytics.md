# GA4 Analytics — regional tracking

This frontend is deployed once per region from the **same codebase**. GA4
tracking is identical across every deployment; only two env vars differ per
build:

| Env var               | What it does                                                        |
| --------------------- | ------------------------------------------------------------------- |
| `NUXT_PUBLIC_GTAG_ID` | GA4 Measurement ID for this deployment (never hardcoded).           |
| `NUXT_PUBLIC_REGION`  | Region code (`US/SA/UK/CA/AU/PH`); sets the `region` param + currency.|
| `NUXT_PUBLIC_META_PIXEL_ID` | *(optional)* Meta Pixel ID. Blank → Pixel never loads.        |
| `NUXT_PUBLIC_GOOGLE_ADS_ID` / `…_PURCHASE_LABEL` | *(optional)* Google Ads account + purchase conversion label. Both blank → no Ads conversion. |

Everything else lives in the shared hub so all regions behave identically:

- **`app/composables/useAnalytics.ts`** — the single place events are fired.
  Auto-attaches `region` to every event, derives the ISO currency per region,
  builds the ecommerce `items` array, and exposes typed helpers.
- **`app/plugins/gtag.client.ts`** — fires `page_view` on initial load + every
  SPA route change.
- **`app/composables/useCookieConsent.ts`** — Consent Mode v2 (`consent update`).
- **`nuxt.config.ts`** — loads gtag.js unconditionally with the env
  Measurement ID and sets the Consent Mode v2 **advanced mode** defaults (all
  four consent signals `denied`, `functionality_storage` /
  `security_storage` `granted`, `url_passthrough` + `ads_data_redaction`).

## Domain → Measurement ID → region → currency

| Domain              | Region | Measurement ID | Currency |
| ------------------- | ------ | -------------- | -------- |
| www.passmed.com     | US     | G-QGK4J5NGCL   | USD      |
| www.passmed.co.za   | SA     | G-80L1Y09M9Q   | ZAR      |
| www.passmed.uk      | UK     | G-BRYENT61EJ   | GBP      |
| www.mccqeprep.com   | CA     | G-F2JLP3DE1G   | CAD      |
| www.passamc.org     | AU     | G-7JWYC4Y9NS   | AUD      |
| www.passmed.ph      | PH     | G-5SZJYN35C2   | PHP      |

Set both env vars per deployment (see `.env.example`). If `NUXT_PUBLIC_REGION`
is missing, `useAnalytics` detects the region from the hostname as a fallback.

> **No cross-domain linking.** These are independent regional sites, so GA4
> cross-domain linking (`linker`) is intentionally NOT configured. All sites
> still report into one GA4 property and are split by the `region` dimension.

## Event schema (GA4 recommended names)

Every event also carries `region` (added automatically).

| Event            | When it fires                                          | Meta Pixel | Params |
| ---------------- | ------------------------------------------------------ | ---------- | ------ |
| `page_view`      | Initial load **and** every SPA route change            | `PageView` (on Pixel load) | `page_path, page_title, page_location, region` |
| `view_item_list` | The pricing list renders (per audience + duration)     | —          | `item_list_name, items[], region` |
| `view_item`      | A single plan/exam viewed                              | `ViewContent` | `currency, value, items[], region` |
| `select_item`    | A plan chosen from a list (pricing "Get started")      | —          | `item_list_name, items[], region` |
| `sign_up`        | A **completed free-trial signup** (account created)    | `CompleteRegistration` | `method, plan:'trial', exam, region` |
| `login`          | A completed login                                      | —          | `method, region` |
| `add_to_cart`    | A **paid** plan selected/added before checkout         | `AddToCart` | `currency, value, items[], region` |
| `begin_checkout` | A **paid** checkout starts (advance past plan select)  | `InitiateCheckout` | `currency, value, items[], plan, exam, region` |
| `add_payment_info`| The **payment step** is reached (card entry shown)    | `AddPaymentInfo` | `currency, value, coupon, items[], plan, exam, region` |
| `purchase`       | A **real paid (non-trial)** purchase                   | `Purchase` (+ Google Ads conversion) | `transaction_id, currency, value, coupon, plan, exam, items[], region` |
| `cookie_consent` | Consent Mode decision (banner accept/reject)           | —          | `consent, analytics, marketing, region` |
| `plan_selected`  | Extra custom event — plan picked (any plan)            | —          | `plan, exam, value, region` |
| `exam_selected`  | Extra custom event — exam picked on /exams             | —          | `exam, exam_name, audience, region` |

> **`begin_checkout` moved.** It now fires when a **paid** checkout *starts*
> (the user commits to a paid plan and advances past plan selection), and the new
> `add_payment_info` marks reaching the card-entry step — matching GA4 semantics.
> Each fires at most once per modal session (guarded), so re-entering a step
> (back/forward, refresh-restore) never double-counts.

`plan_selected` / `exam_selected` are kept as **extra** custom events — they do
**not** replace the standard ecommerce events above.

### Ecommerce `items` array

`add_to_cart`, `begin_checkout`, and `purchase` send a proper items array:

```js
items: [{
  item_id:       '<stripe price id, or `${exam}_${plan}`>',
  item_name:     '<plan label, e.g. "3 Month subscription">',
  item_category: '<exam slug>',   // the Exam custom dimension
  price:         <numeric>,
  quantity:      1,
}]
```

`value` and `price` are numeric and in the region's ISO currency (`currency`).

### Custom dimensions

- **Exam** ← `exam` / `item_category`
- **Plan** ← `plan`
- **Region** ← `region` *(register this new dimension in GA4 Admin →
  Custom definitions, scope: Event, param `region`)*

### `transaction_id`

`purchase.transaction_id` is the **Stripe PaymentIntent id** — unique and stable
per order, so GA4 de-duplicates correctly. A 100%-off coupon skips Stripe (no
PaymentIntent) and is therefore not counted as a paid purchase.

## Ad platforms — Meta Pixel + Google Ads (optional, consent-gated)

Both are **off unless their env IDs are set** per region, and both are gated by
**marketing** consent (see below). `useAnalytics` fires the matching events
automatically alongside the GA4 events (the "Meta Pixel" column above), so call
sites don't change. Wiring:

- **`app/plugins/marketing.client.ts`** — injects the Meta Pixel base script
  **only after** marketing consent is granted, then `fbq('init')` + `PageView`.
  Google Ads is `gtag('config', AW-…)` on the already-loaded gtag.js (Consent
  Mode holds ad cookies until consent).
- **Google Ads conversion** fires on `purchase` via `gtag('event','conversion', {
  send_to: '<AW-ID>/<PURCHASE_LABEL>', value, currency, transaction_id })`.
- **CSP** (`server/plugins/csp.ts`) allows `connect.facebook.net`,
  `googleadservices.com`, `googleads.g.doubleclick.net` (+ frames/pixels) — inert
  until the tags load.

## Consent Mode v2 + marketing category

`gtag` runs in **advanced mode**: gtag.js is loaded unconditionally (not gated
on the banner), with all four consent signals **denied** by default (in
`nuxt.config.ts`): `analytics_storage`, `ad_storage`, `ad_user_data`,
`ad_personalization` (`functionality_storage` / `security_storage` stay
`granted`, `url_passthrough` + `ads_data_redaction` are set so `gclid`
survives navigation while `ad_storage` is denied). This means denied visitors
still send cookieless pings that Google uses to model the conversions basic
mode would have made invisible. The cookie banner (`useCookieConsent`) has
**two** granular categories:

- **analytics** → grants `analytics_storage` (Google Analytics).
- **marketing** → grants `ad_storage` / `ad_user_data` / `ad_personalization`
  **and** grants Meta `fbq` consent + loads the Pixel.

`Accept all` grants both; `Reject all` denies both; "See details" exposes
per-category toggles. Existing (pre-marketing) stored decisions default
`marketing = denied` — the compliant default — until the user revisits **Cookie
settings**. We deliberately did **not** bump `COOKIE_POLICY_VERSION`, to avoid
re-prompting every user; bump it if you want to actively re-collect marketing
consent.

## Checkout URL step-state (`?checkout=`)

The checkout modal reflects its step in the URL — `?checkout=plan|details|payment`
— via `router.replace` while open (no history spam), cleared on close. This makes
steps shareable, keeps the step on refresh, and is the foundation for the resume
link (Objective B). `/pricing?checkout=<step>[&exam=<slug>&plan=<slug>]` auto-opens
the modal at that step when the exam + paid plan are known (falls back to plan
selection otherwise). See `SignupForm.vue` (`STEP_TO_SLUG`/`SLUG_TO_STEP`) and
`pages/pricing.vue` (deep-link `onMounted`).

## QA — verifying events in GA4

A dev console warning fires if `NUXT_PUBLIC_GTAG_ID` is missing, so a misbuilt
deployment is obvious immediately.

### DebugView (recommended)

1. Set both env vars and run the deployment (or `npm run dev` with them set).
2. Enable debug mode — either install the **GA Debugger** Chrome extension, or
   append `?_dbg=1` and run `gtag('set', { debug_mode: true })` in the console.
3. GA4 → **Admin → DebugView**. Pick the device and watch events stream in.
4. Click each event to confirm its params (`region`, `currency`, `items`,
   `transaction_id`, …).

### Realtime

GA4 → **Reports → Realtime** shows events within ~30s (no debug flag needed).
Use the "Event count by Event name" card to confirm names.

### Flows to QA (old name → new name)

| Flow         | Trigger                                   | Event (old → new)                 |
| ------------ | ----------------------------------------- | --------------------------------- |
| Page nav     | Load site, click around                   | `page_view` (now fires on initial load + each SPA nav, all with `region`) |
| Signup       | Complete a **free-trial** signup          | `sign_up_started` (open modal) → **removed**; `sign_up` now fires on account creation |
| Login        | Log in (Google or password)               | `login_completed` → `login`       |
| Plan select  | Pick a **paid** plan in the signup modal  | `plan_selected` (kept) **+ new** `add_to_cart` |
| Checkout     | Reach the payment step                    | `checkout_started` → `begin_checkout` (now with `items`) |
| Purchase     | Complete a **paid** subscription          | `purchase_completed` → `purchase` (now with `items`, Stripe `transaction_id`) |
| Cookie banner| Accept/reject cookies                     | `cookie_consent` (unchanged)      |

### Call sites changed

- `app/composables/useAnalytics.ts` — rewritten as the DRY hub (region/currency,
  item builder, typed helpers).
- `app/plugins/gtag.client.ts` — initial + per-nav `page_view`, dev guard.
- `nuxt.config.ts` — `send_page_view:false`, `region` runtime config.
- `app/components/SignupForm.vue` — `sign_up_started` removed; `add_to_cart`
  added on paid plan select; `checkout_started` → `begin_checkout`;
  `purchase_completed` → `purchase`; `sign_up` on completed trial signup.
- `app/components/LoginForm.vue` — `login_completed` → `login` (×2).
- `app/composables/useCookieConsent.ts` / `app/pages/exams.vue` — unchanged
  names; now also carry `region` automatically.
