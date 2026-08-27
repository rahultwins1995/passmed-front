import { createResolver } from '@nuxt/kit'

const { resolve } = createResolver(import.meta.url)

// Single host for every backend base in this layer. Point all APIs at one server
// by setting NUXT_PUBLIC_API_BASE_ALL=https://api.passmed.com. A trailing slash is
// tolerated: we strip it here so `${API_ALL}/api-institute/v1` can never become
// `host//api-institute/v1` (a double slash the backend 404s on).
const API_ALL = (process.env.NUXT_PUBLIC_API_BASE_ALL || '').replace(/\/+$/, '')
// No hardcoded default — a missing value fails the build here instead of silently
// shipping "undefined/..." URLs. Set NUXT_PUBLIC_API_BASE_ALL in .env / Vercel (per-region).
if (!API_ALL) throw new Error('NUXT_PUBLIC_API_BASE_ALL is not set — set it in .env / Vercel env before building the institute layer.') 

export default defineNuxtConfig({
  // NOTE: When used as a layer (extended from frontend/), app.baseURL must
  // NOT be set here — it would override the host's baseURL. Routes are
  // namespaced via the folder structure (pages/institute/*).
  app: {
    head: {
      title: 'Passmed Institute Panel',
      htmlAttrs: { lang: 'en' },
    },
  },

  pages: true,

  // Institute portal is authenticated — same reasoning as the student layer
  // (mirror of student/nuxt.config.ts). SSR provides no SEO value here and
  // in dev the Laravel session cookie lives on api.passmed.com which the
  // Nuxt SSR context cannot read. Without this rule, hitting /institute
  // while logged-out caused a half-rendered SSR pass that broke the
  // /login?redirect=/institute view (form invisible, only the announcement
  // banner rendered).
  routeRules: {
    '/institute/**': { ssr: false },
  },

  // IMPORTANT: CSS path fix
   //css: [resolve('./app/assets/css/style.css')], // injected css from student layout

  devtools: { enabled: false },

  // OPTIONAL: remove if not needed
  plugins: [],

  runtimeConfig: {
    // Server-only: where the institute Laravel API lives.
    // Override in deployment via NUXT_INSTITUTE_LARAVEL_API env var.
    instituteApi: `${API_ALL}/api-institute/v1`,
    public: {
      // The ONLY base the browser uses for institute API calls (proxy mode).
      // Always '/api/institute' — same-origin path to our Nuxt server proxy,
      // NOT a full URL. Do NOT prefix with a host.
      instituteApiBase: '/api/institute',

      // ── DEV PROXY TOGGLE (single source of truth for this layer) ──────────
      // directApi=true  → dev browser hits Laravel DIRECTLY (real URL in Network)
      // directApi=false → dev uses the '/api/institute' proxy (like prod).
      // Production ALWAYS uses the proxy (import.meta.dev guard in the code).
      directApi: true,   // ← flip: true = direct (real URL in Network), false = proxy
      // Unique key per layer — Nuxt merges all layers' public config into ONE object,
      // so a shared 'directApiBase' key would collide (frontend would win).
      directInstituteApiBase: `${API_ALL}/api-institute/v1`,
      // Shared auth actions (forgot/reset password) use the frontend auth base.
      directAuthApiBase: `${API_ALL}/frontend/v1`,
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