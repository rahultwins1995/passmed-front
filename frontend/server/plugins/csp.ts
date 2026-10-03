// Per-request Content-Security-Policy with a nonce.
//
// Why this exists (and isn't a static header in nuxt.config.ts):
// Nuxt injects a small inline bootstrap script — `window.__NUXT__.config = …` —
// that the client entry module reads during hydration. A static
// `script-src 'self'` (no 'unsafe-inline') blocks that inline script, so the
// client app never hydrates: no plugins run, the reveal-on-scroll animation
// never adds `.visible`, and every `.reveal` block stays opacity:0 — the page
// renders server-side but shows blank gaps in the browser.
//
// We keep the strict CSP (no 'unsafe-inline') and instead mint a fresh nonce
// per request, set it in `script-src`, and stamp the same nonce onto every
// inline <script> Nuxt emits. A static hash can't be used because the bootstrap
// script embeds a per-build buildId, so its content changes every deploy.
//
// Production only — the dev server needs inline/eval for HMR and applies no CSP.
import { randomBytes } from 'node:crypto'

const buildCsp = (nonce: string, apiOrigin: string): string =>
  [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // 'self' keeps the external entry/vendor module scripts working; the nonce
    // authorises Nuxt's inline bootstrap script. Third-party origins are
    // required by Google Sign-In, Stripe, and Google Analytics (gtag.js).
    // Meta Pixel (connect.facebook.net) + Google Ads (googleadservices /
    // googleads.g.doubleclick.net) load their scripts from these origins; they're
    // only fetched when the Pixel/Ads IDs are configured AND marketing consent is
    // granted, so allowing the origins is harmless when the tags aren't in use.
    `script-src 'self' 'nonce-${nonce}' https://accounts.google.com https://apis.google.com https://*.gstatic.com https://js.stripe.com https://challenges.cloudflare.com https://www.googletagmanager.com https://connect.facebook.net https://www.googleadservices.com https://googleads.g.doubleclick.net`,
    // accounts.google.com serves the Google Identity Services button's own
    // stylesheet (gsi/style) — without it the Sign-In button CSP-blocks its
    // own CSS and renders unstyled.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // img-src is already https:-wide, which covers the Meta Pixel + Google Ads
    // tracking pixels (facebook.com / google.com / doubleclick) with no change.
    "img-src 'self' data: blob: https:",
    // GA4 sends its measurement beacons to the google-analytics / analytics
    // hosts (and googletagmanager for config); allow them so gtag isn't blocked.
    // pagead2.googlesyndication.com is the Google Ads conversion-linker "collect"
    // beacon that gtag's own Ads tag fires on every page view — was missing, so
    // it was blocked (and retried) on every single navigation.
    // Sentry's browser SDK posts every error envelope to the DSN's ingest host
    // (o<org>.ingest.<region>.sentry.io) over fetch, which connect-src governs.
    // It was missing here, so the client plugin initialised fine and then had
    // every report blocked by the browser: only server-side (Nitro) errors ever
    // reached the dashboard. Both region-specific and default ingest hosts are
    // allowed so a DSN moved between Sentry regions keeps working.
    // NEW-92: the Laravel backend origin is taken from RUNTIME CONFIG (apiBase), not
    // hard-coded to api.passmed.com — each market runs on its own API host (api-uk…,
    // api-za…, passamc.org, …) and the old hard-coded host CSP-blocked the DIRECT upload
    // call (large institute/student question imports that bypass Vercel's 4.5MB proxy cap)
    // on every non-US region. Most calls still go through the same-origin /api proxy ('self').
    `connect-src 'self' ${apiOrigin} https://accounts.google.com https://apis.google.com https://www.googleapis.com https://*.stripe.com https://challenges.cloudflare.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://connect.facebook.net https://www.facebook.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.google.com https://pagead2.googlesyndication.com https://*.ingest.de.sentry.io https://*.ingest.sentry.io`,
    "frame-src https://accounts.google.com https://js.stripe.com https://*.stripe.com https://challenges.cloudflare.com https://td.doubleclick.net https://www.google.com",
  ].join('; ')

// Add nonce="…" to inline <script> tags only (those without a src= attribute).
// External module scripts are already allowed via 'self'; data blocks such as
// <script type="application/json"> are not executed, so a nonce on them is inert.
const stampNonce = (chunks: string[], nonce: string): string[] =>
  chunks.map((c) =>
    c.replace(/<script(?![^>]*\ssrc=)/g, `<script nonce="${nonce}"`),
  )

export default defineNitroPlugin((nitroApp) => {
  if (process.env.NODE_ENV !== 'production') return

  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const nonce = randomBytes(16).toString('base64')

    html.head = stampNonce(html.head, nonce)
    html.bodyPrepend = stampNonce(html.bodyPrepend, nonce)
    html.bodyAppend = stampNonce(html.bodyAppend, nonce)

    // NEW-92: derive THIS market's backend origin from runtime config (apiBase) so the
    // CSP connect-src allows the region's own direct-upload host instead of a hard-coded
    // api.passmed.com. Empty/unparseable → just omit it (the same-origin /api proxy still
    // covers normal calls); never hard-code a wrong host.
    // directApiBase (= NUXT_PUBLIC_API_BASE) is THIS market's real Laravel host used by the
    // direct-upload path; apiBase is always the relative '/api' proxy, so it can't be used
    // here. Derive just the origin (scheme + host).
    let apiOrigin = ''
    try {
      const cfg = useRuntimeConfig(event) as any
      const base = String(cfg?.public?.directApiBase || '')
      if (base) apiOrigin = new URL(base).origin
    } catch { /* leave empty */ }

    setResponseHeader(event, 'content-security-policy', buildCsp(nonce, apiOrigin))
  })
})
