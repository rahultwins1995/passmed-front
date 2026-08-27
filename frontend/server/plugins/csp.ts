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

const buildCsp = (nonce: string): string =>
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
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // img-src is already https:-wide, which covers the Meta Pixel + Google Ads
    // tracking pixels (facebook.com / google.com / doubleclick) with no change.
    "img-src 'self' data: blob: https:",
    // GA4 sends its measurement beacons to the google-analytics / analytics
    // hosts (and googletagmanager for config); allow them so gtag isn't blocked.
    // api.passmed.com is the Laravel backend. Most calls go through the same-origin
    // /api proxy ('self'), but large file uploads (institute/student question import)
    // hit the backend DIRECTLY to bypass Vercel's 4.5MB proxy body cap — that direct
    // cross-origin call needs api.passmed.com whitelisted here, or the browser blocks
    // it (the "Import failed to start" with no server reason).
    "connect-src 'self' https://api.passmed.com https://accounts.google.com https://apis.google.com https://www.googleapis.com https://*.stripe.com https://challenges.cloudflare.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://connect.facebook.net https://www.facebook.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.google.com",
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

    setResponseHeader(event, 'content-security-policy', buildCsp(nonce))
  })
})
