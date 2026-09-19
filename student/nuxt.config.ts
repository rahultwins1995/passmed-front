import { createResolver } from '@nuxt/kit'

const { resolve } = createResolver(import.meta.url)

// Single host for every backend base in this layer. Point all APIs at one server
// by setting NUXT_PUBLIC_API_BASE_ALL=https://api.passmed.com. A trailing slash is
// tolerated: we strip it here so `${API_ALL}/api-student/v1` can never become
// `host//api-student/v1` (a double slash the backend 404s on — this is exactly
// what broke SA onboarding when the Vercel env had a trailing slash).
const API_ALL = (process.env.NUXT_PUBLIC_API_BASE_ALL || '').replace(/\/+$/, '');
// No hardcoded default — a missing value fails the build here instead of silently
// shipping "undefined/..." URLs. Set NUXT_PUBLIC_API_BASE_ALL in .env / Vercel (per-region).
if (!API_ALL) throw new Error('NUXT_PUBLIC_API_BASE_ALL is not set — set it in .env / Vercel env before building the student layer.');

// Static hardening headers (mirror the marketing layer), applied to every route in
// production. This authenticated dashboard renders sanitized CMS/user HTML and exposes
// account-deletion, and must NEVER be framable (clickjacking). A stricter script-src CSP
// is deliberately avoided here — it would break Nuxt hydration / Stripe / Google; the
// clickjacking + defense-in-depth directives below are the safe, high-value part.
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
};

export default defineNuxtConfig({
  pages: true,  // enable file-based routing for this layer

  // Student portal is for authenticated users — SSR provides no SEO value
  // here, and in dev the Laravel session cookie lives on api.passmed.com
  // which the Nuxt SSR context cannot read. Rendering client-only avoids the
  // "flash to /login then back to /student" bounce on hard refresh.
  routeRules: {
    '/student/**': { ssr: false },
    // Security headers on every route (production only). Added HERE (not just the
    // marketing layer) because this dashboard was otherwise framable with no CSP.
    ...(process.env.NODE_ENV === 'production' ? { '/**': { headers: securityHeaders } } : {}),
  },

  app: {
    head: {
      title: 'Passmed Student Panel',
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      ],
    },
  },

  // Server-only runtime config — the browser never sees `laravelApiStudent`.
  // Override per environment via NUXT_LARAVEL_API_STUDENT.
  runtimeConfig: {
    laravelApiStudent: `${API_ALL}/api-student/v1`,
    public: {
      // ── DEV PROXY TOGGLE (single source of truth for this layer) ──────────
      // directApi=true  → dev browser hits Laravel DIRECTLY (real URL in Network)
      // directApi=false → dev uses the '/api/student' proxy (like prod).
      // Production ALWAYS uses the proxy (import.meta.dev guard in the code).
      // Safe default: PROXY. Opt into direct API hits only in dev by setting
      // NUXT_PUBLIC_DIRECT_API=true in local .env. Even if set, every call site
      // still gates on import.meta.dev, so production ALWAYS uses the proxy — this
      // default just removes the footgun if a guard is ever dropped in a refactor.
      directApi: process.env.NUXT_PUBLIC_DIRECT_API === 'true',   // dev-only opt-in; default false = proxy
      // Unique key per layer — Nuxt merges all layers' public config into ONE object,
      // so a shared 'directApiBase' key would collide (frontend would win).
      directStudentApiBase: `${API_ALL}/api-student/v1`,
    },
  },

  imports: {
    dirs: [resolve('./app/composables')],
  },

  vite: {
    assetsInclude: ['**/*.css?raw'],
  },
})