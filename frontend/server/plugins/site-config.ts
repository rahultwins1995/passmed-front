/**
 * Per-request site URL for @nuxtjs/sitemap (built on nuxt-site-config).
 *
 * nuxt.config.ts sets `site.url` once at Nuxt boot from NUXT_PUBLIC_REGION, which
 * is belt-and-braces at best: if that env var is missing or wrong on a given
 * Vercel project, every URL sitemap.xml emits inherits the wrong domain for the
 * lifetime of the deploy. That's exactly what happened on the UK project — its
 * sitemap.xml listed the pmfrontend-uk.vercel.app deployment origin instead of
 * https://www.passmed.uk, so Search Console discovered zero pages from it.
 *
 * This was first attempted as a `server/middleware/site-config.ts` calling
 * updateSiteConfig() directly — deployed, and still wrong live. Root cause:
 * nuxt-site-config's OWN init middleware (which runs on every request,
 * regardless of ours) unconditionally re-pushes nuxt.config's boot-time
 * `site.url` as its "runtimeEnv" stack entry, at the same priority tier as an
 * unscoped updateSiteConfig() call. Stack entries are merged low-to-high
 * priority with later-same-priority-wins, and that internal push always runs
 * AFTER a plain middleware's, so it always clobbered our override — confirmed
 * by reading nuxt-site-config's own runtime source (dist/runtime/server/
 * middleware/init.js in the published package), which also carries an explicit
 * warning that server/middleware is not a supported place to customise site
 * config. The `site-config:init` Nitro hook is: it fires from inside that same
 * init middleware, after every built-in stack push has already happened, so a
 * push made here is always the last (and therefore winning) word.
 *
 * Resolved from the Host header against a fixed allowlist of live custom
 * domains (never trusting an arbitrary Host directly), so an unset or wrong
 * env var can no longer poison the sitemap.
 *
 * SITE_URL_BY_HOST duplicates routes/robots.txt.ts (which duplicates
 * app/composables/useSiteUrl.ts) rather than importing it: Nuxt-app composables
 * rely on auto-imports that don't exist inside the Nitro bundle. Keep all three
 * in sync.
 */
import { defineNitroPlugin } from 'nitropack/runtime'

const SITE_URL_BY_HOST: Record<string, string> = {
  'passmed.com':       'https://www.passmed.com',
  'www.passmed.com':   'https://www.passmed.com',
  'passmed.co.za':     'https://www.passmed.co.za',
  'www.passmed.co.za': 'https://www.passmed.co.za',
  'passmed.uk':        'https://www.passmed.uk',
  'www.passmed.uk':    'https://www.passmed.uk',
  'passmed.ca':        'https://www.passmed.ca',
  'www.passmed.ca':    'https://www.passmed.ca',
  'mccqeprep.com':     'https://www.passmed.ca',
  'www.mccqeprep.com': 'https://www.passmed.ca',
  'passamc.org':       'https://www.passamc.org',
  'www.passamc.org':   'https://www.passamc.org',
  'passmed.ph':        'https://www.passmed.ph',
  'www.passmed.ph':    'https://www.passmed.ph',
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('site-config:init', ({ event, siteConfig }) => {
    const host = String(getRequestHeader(event, 'host') || '').toLowerCase().split(':')[0]
    const url = SITE_URL_BY_HOST[host]
    if (url) siteConfig.push({ _context: 'per-request-host', url })
  })
})
