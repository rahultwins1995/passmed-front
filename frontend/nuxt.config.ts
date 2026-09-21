import { createResolver } from '@nuxt/kit'

// Resolver that's anchored to THIS layer's folder, not the project root.
const { resolve } = createResolver(import.meta.url)

// Static hardening headers, applied to every route in production only.
//
// NOTE: Content-Security-Policy is intentionally NOT here. Nuxt emits a small
// inline bootstrap script (window.__NUXT__.config) that the client entry reads
// during hydration; a static `script-src 'self'` (no 'unsafe-inline') blocks
// it, which breaks hydration so no client plugins run (e.g. the reveal
// animation never fires and `.reveal` content stays opacity:0 — a blank page).
// A static nonce can't work because the bootstrap script's content changes per
// build, so CSP is set per-request with a fresh nonce in
// server/plugins/csp.ts, which also stamps that nonce onto the inline scripts.
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

// Default browser-tab title per market (NUXT_PUBLIC_REGION is set per build).
// usePageSeo overrides this on pages that provide their own title — and, since
// it resolves region per-request rather than at build time, is what actually
// saves UK/CA/AU/PH from the US fallback below when NUXT_PUBLIC_REGION isn't
// set on that Vercel project (the common case — see the Pixel ID note below).
// These four are filled in anyway as defense-in-depth for the rare case a page
// renders before usePageSeo runs, or the env var is set correctly.
const REGION_TITLES: Record<string, string> = {
  US: 'Passmed US — Pass Your Boards with Confidence',
  SA: 'Passmed — Pass Your CMSA & HPCSA Exams with Confidence',
  UK: 'Passmed UK — Pass Your Royal College Exams with Confidence',
  CA: 'Passmed Canada — Pass the MCCQE Part 1 with Confidence',
  AU: 'Passmed Australia — Pass the AMC MCQ with Confidence',
  PH: 'Passmed — Pass the PLE with Confidence',
}
const REGION_TITLE = REGION_TITLES[(process.env.NUXT_PUBLIC_REGION || '').toUpperCase()] || REGION_TITLES.US

const GTAG_ID = process.env.NUXT_PUBLIC_GTAG_ID || ''
// NOTE: per-market Meta Pixel IDs and facebook-domain-verification tokens are
// resolved at RUNTIME from the request host (see app/composables/useRegion.ts +
// app/plugins/domain-verify.ts), NOT here — because NUXT_PUBLIC_REGION is not set
// on the Vercel projects, so a build-time lookup would render empty.

export default defineNuxtConfig({


     routeRules: process.env.NODE_ENV === 'production'? {

      // Security headers on every route (merged with the per-route ISR rules below)
      '/**':           { headers: securityHeaders },

      '/about-us':     { isr: true },
      '/terms':        { isr: true },
      '/privacy':      { isr: true },
      '/institutions': { isr: true },
      '/contact':      { isr: true },
      '/faq':          { isr: true },
      '/img-pathways': { isr: true },
      '/opportunities':{ isr: true },
      // isr: <seconds> so a newly published exam / accent-colour change appears
      // within the window instead of being cached indefinitely (isr:true) until the
      // next deploy. 300s = up to 5 min; stale is served while it regenerates.
      '/exams':        { isr: 300 },
      '/pricing':      { isr: 300 },
      // Resources are static local content (change only on deploy), so cache
      // until the next deploy like the other static marketing pages.
      '/resources':    { isr: true },
      '/resources/**': { isr: true },

      // Dynamic exam slugs — cached, regenerated at most every 5 min.
      '/exam/**':      { isr: 300 },
      '/':             { isr: 300 },

  }: {},

  // ssr: true,
  app: {
    baseURL: '/', // frontend app

    head: {
      title: REGION_TITLE,
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      ],
      link: [
        // Favicon / app-icon set (assets live in the repo-root public/).
        { rel: 'icon',             type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon',             type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'icon',             type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'icon',             type: 'image/png', sizes: '192x192', href: '/android-chrome-192x192.png' },
        { rel: 'icon',             type: 'image/png', sizes: '512x512', href: '/android-chrome-512x512.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
        // Preconnect ONLY to the two font origins (the critical, render-blocking
        // ones). Keep preconnects to <=2–3 — too many hurts. gtag is async/low
        // priority, so a dns-prefetch is enough for it.
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'dns-prefetch', href: 'https://www.googletagmanager.com' },
        {
          // Weights trimmed to the ones actually used in CSS (dropped normal
          // 300/900 and italic 300 — zero usages) to cut font download + render-block.
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600;1,800&family=JetBrains+Mono:wght@400;500&display=swap',
        },
      ],
      script: [
        // Google tag (gtag.js). The Measurement ID comes from
        // NUXT_PUBLIC_GTAG_ID — when unset, both tags render with an empty id
        // and gtag silently no-ops (safe in dev / unconfigured environments).
        // Always loaded unconditionally, never gated on consent state or on
        // which hostname served the request (Consent Mode v2 advanced mode —
        // see the 'consent default' block below for why).
        {
          async: true,
          src: `https://www.googletagmanager.com/gtag/js?id=${GTAG_ID}`,
        },
        {
          innerHTML: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            // Consent Mode v2, advanced mode — gtag.js always loads and sends
            // cookieless pings while denied, so Google can model the gap for
            // visitors who never interact with the banner. Storage only
            // switches to granted via gtag('consent','update',...) from the
            // cookie banner (useCookieConsent).
            gtag('consent', 'default', {
              ad_storage: 'denied',
              ad_user_data: 'denied',
              ad_personalization: 'denied',
              analytics_storage: 'denied',
              functionality_storage: 'granted',
              security_storage: 'granted',
              wait_for_update: 500
            });
            // Keeps gclid usable for attribution while ad_storage is denied:
            // url_passthrough carries it through navigations without a cookie,
            // ads_data_redaction strips ad-click identifiers from what's sent.
            gtag('set', 'url_passthrough', true);
            gtag('set', 'ads_data_redaction', true);
            // send_page_view:false — page_view is fired from plugins/gtag.client.ts
            // instead (initial load + every SPA route change), so every page_view
            // carries the same params (region, …) as the rest of the funnel and
            // SPA navigations aren't missed. No 'linker' config: these regional
            // domains are independent, so GA4 cross-domain linking stays OFF.
            gtag('config', '${GTAG_ID}', { send_page_view: false });
          `,
        },
      ],
    },
  },

  pages: true,

  devtools: { enabled: false },

  plugins: [],

  runtimeConfig: {
    // Server-only: where Laravel actually lives. The browser never sees this.
    // Override in deployment via NUXT_LARAVEL_API env var.
    laravelApi: process.env.NUXT_PUBLIC_API_BASE,

    // Opportunities board (server-only). Which Airtable base + region a site shows
    // is decided per Vercel project from these; server/utils/opportunities.ts falls
    // back to a host map when they're unset. The token needs data.records:read +
    // data.records:write on the base(s) this project serves. Never exposed to the browser.
    airtableToken: process.env.NUXT_AIRTABLE_TOKEN || '',

    // On-call staff maintenance-mode bypass secret (server-only). Read in
    // server/middleware/maintenance.ts. Set NUXT_MAINTENANCE_BYPASS_TOKEN per
    // deployment (Vercel) and in local .env; empty disables the bypass.
    maintenanceBypassToken: process.env.NUXT_MAINTENANCE_BYPASS_TOKEN || '',
    opportunitiesBase: process.env.NUXT_OPPORTUNITIES_BASE || '',
    defaultRegion: process.env.NUXT_DEFAULT_REGION || '',
    opportunitiesRegions: process.env.NUXT_OPPORTUNITIES_REGIONS || '',
    listingsStatus: process.env.NUXT_LISTINGS_STATUS || '',

    public: {
      // The ONLY base the browser uses. Always '/api' — points at our own
      // Nuxt server routes (server/api/*), NOT directly at Laravel.
      // Hardcoded so no env var can override it back to api.passmed.com.
      apiBase: '/api',

      // ── DEV PROXY TOGGLE (single source of truth for this layer) ──────────
      // directApi=true  → dev browser hits Laravel DIRECTLY (real URL in Network)
      // directApi=false → dev uses the '/api' proxy (like prod).
      // Production ALWAYS uses the proxy (import.meta.dev guard in the code).
      // Override at runtime via NUXT_PUBLIC_DIRECT_API=false if needed.
      // Safe default: PROXY. Opt into direct API hits only in dev by setting
      // NUXT_PUBLIC_DIRECT_API=true in local .env. Even if set, every call site
      // still gates on import.meta.dev, so production ALWAYS uses the proxy — this
      // default just removes the footgun if a guard is ever dropped in a refactor.
      directApi: process.env.NUXT_PUBLIC_DIRECT_API === 'true',   // dev-only opt-in; default false = proxy
      directApiBase:  process.env.NUXT_PUBLIC_API_BASE,
      stripePublishableKey: process.env.NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL,
      googleAuthKey: process.env.NUXT_PUBLIC_GOOGLE_AUTH_KEY,
      // NOTE: the Cloudflare Turnstile site key is NOT exposed here anymore. All
      // markets use one shared widget hardcoded in app/components/TurnstileWidget.vue
      // (the per-project NUXT_PUBLIC_TURNSTILE_SITE_KEY envs had drifted to
      // different, mis-configured widgets). That env var is now unused and safe to
      // delete from the Vercel projects.
      // Settings key for CMS-driven header/footer chrome (useSiteChrome). When
      // unset, the footer uses hardcoded constant defaults (no network call).
      chromeSettingsKey: process.env.NUXT_PUBLIC_CHROME_SETTINGS_KEY,
      // GA4 Measurement ID — read by plugins/gtag.client.ts to fire page_view
      // on SPA route changes. Empty when unset, in which case the plugin no-ops.
      // Set per regional deployment (domain → ID map in .env.example).
      gtagId: GTAG_ID,
      // Meta (Facebook) Pixel ID — when set AND the user grants MARKETING consent,
      // plugins/marketing.client.ts loads the Pixel and useAnalytics fires the
      // matching standard events (ViewContent/AddToCart/InitiateCheckout/
      // AddPaymentInfo/Purchase). Empty → Pixel never loads (safe no-op).
      // Optional OVERRIDE only. The per-market default Pixel ID is resolved at
      // runtime from the host in useAnalytics/marketing (REGION_META_PIXEL).
      metaPixelId: process.env.NUXT_PUBLIC_META_PIXEL_ID || '',
      // Google Ads conversion tag. `googleAdsId` is the account (AW-XXXXXXXXX);
      // `googleAdsPurchaseLabel` is the purchase conversion label. Both required to
      // fire the Ads conversion on `purchase`. Empty → no Ads conversion (safe).
      googleAdsId: process.env.NUXT_PUBLIC_GOOGLE_ADS_ID || '',
      googleAdsPurchaseLabel: process.env.NUXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL || '',
      // Region code for the deployment (US/SA/UK/CA/AU/PH). Attached to every
      // GA4 event as the `region` param (→ Region custom dimension) and selects
      // the ISO currency for ecommerce events. Falls back to hostname-based
      // detection in useAnalytics when unset.
      region: process.env.NUXT_PUBLIC_REGION || '',
      // Sentry error monitoring. The DSN is public by design, so the shared
      // project DSN is baked in as the default to activate all six markets at
      // once; the current market is attached as a `region` tag so one Sentry
      // project covers them all. Override per Vercel project with
      // NUXT_PUBLIC_SENTRY_DSN (set it empty to disable). sentryEnv defaults to
      // the Vercel environment.
      sentryDsn: process.env.NUXT_PUBLIC_SENTRY_DSN
        || 'https://bfb9efd6d78c54f2e873f351a0c582f8@o4511851658215424.ingest.de.sentry.io/4511852709281872',
      sentryEnv: process.env.NUXT_PUBLIC_SENTRY_ENV || process.env.VERCEL_ENV || 'production',
    }
  },

  typescript: {
    strict: true
  },

  imports: {
    dirs: [
      resolve('./app/composables')
    ]
  }
})