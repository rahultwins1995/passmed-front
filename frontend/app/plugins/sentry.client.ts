// Client-side Sentry error monitoring.
//
// Fully gated on NUXT_PUBLIC_SENTRY_DSN (runtimeConfig.public.sentryDsn): when
// it's unset the SDK is never even imported, so a build without a DSN pays zero
// runtime cost and captures nothing. Set the DSN per Vercel project to activate.
//
// One shared Sentry project works for all six markets — the current market is
// attached as a `region` tag (from useRegion(), host-derived), so you can filter
// and alert per region. Sampling is tuned for the free tier: errors only, no
// performance traces or session replay.
export default defineNuxtPlugin(async (nuxtApp) => {
  const config = useRuntimeConfig()
  const dsn = config.public.sentryDsn as string
  if (!dsn) return

  const Sentry = await import('@sentry/vue')

  Sentry.init({
    app: nuxtApp.vueApp,
    dsn,
    environment: (config.public.sentryEnv as string) || 'production',
    // Free tier: capture errors, skip performance + replay quota.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Don't send events for benign network blips / cancelled navigations.
    ignoreErrors: [
      'Navigation cancelled',
      'AbortError',
      /Load failed/i,
      /NetworkError/i,
      /Failed to fetch/i,
      // Stale-chunk-after-deploy errors (a tab left open across a deploy lazy-loads
      // a chunk the new build no longer has). These are BENIGN and self-healing:
      // plugins/chunk-error.client.ts catches them and hard-reloads onto the new
      // build. The raw throw still reaches Sentry's global handler before that
      // reload, so filter it here to kill the noise. Message-gated to chunk-import
      // failures ONLY (iOS "Importing a module script failed", Chrome "Failed to
      // fetch dynamically imported module", Firefox "error loading…") — never
      // unrelated app errors. Keep in sync with the CHUNK_ERR regex in that plugin.
      /importing a module script failed/i,
      /failed to fetch dynamically imported module/i,
      /error loading dynamically imported module/i,
      /not a valid javascript mime type/i,
      /unable to preload css/i,
      // Native mobile-app WebView bridge noise (iOS WKWebView / Android / RN WebView) —
      // the embedding app injects these APIs; they are NOT the web app's own code.
      /webkit\.messageHandlers/i,
      /window\.webkit/i,
      /ReactNativeWebView/i,
      /Can't find variable: webkit/i,
      /undefined is not an object.*webkit/i,
      // Facebook / Android in-app-browser bridge noise. When a link is opened
      // inside the Facebook (or similar) app's in-app browser, FB injects its own
      // instrumentation (iabjs://…, sendDataToNative) that fails talking to the
      // native layer: "Error invoking postMessage: Java exception was raised
      // during method invocation" (Sentry PASSMED-N). That is FB's own code, not
      // ours. denyUrls below drops it by origin; this also catches it by message.
      /Java exception was raised during method invocation/i,
    ],
    // Drop anything thrown from third-party injected in-app-browser scripts —
    // their own URL scheme (Facebook's `iabjs://`) is never our code, so any
    // error originating there is external noise regardless of its message.
    denyUrls: [
      /iabjs:\/\//i,
      /navigation_performance_logger/i,
    ],
    // Drop deliberate 4xx app states — they are correct responses, not faults.
    // Pages throw createError({ statusCode: 404, ... }) for a genuinely missing
    // exam/article (a bad or old slug, a crawler probing, a stub exam with no
    // pricing): that renders the right not-found page and is NOT a bug. On the
    // client these reach Sentry via Vue's error handler (Sentry PASSMED-B/G/…
    // "Exam not found", "Article not found") and would bury real 5xx issues.
    // This MIRRORS the server plugin (server/plugins/sentry.ts), which already
    // skips 4xx — the client just lacked the same guard. 5xx (incl. real backend
    // outages surfaced as "Unable to load this exam right now") still reports.
    beforeSend(event, hint) {
      // Non-Error promise rejections carrying a DOM Event (CustomEvent is an Event
      // subclass) — these come from browser extensions / third-party embeds on Safari
      // (Sentry PASSMED-W "Event `CustomEvent` … captured as promise rejection"),
      // have no app stack, and are unactionable. Real app errors are Error instances,
      // never Event instances, so this never hides a genuine bug.
      const ex = hint?.originalException as unknown
      if (typeof Event !== 'undefined' && ex instanceof Event) return null
      // Chunk-import failures (stale-chunk-after-deploy) reach Sentry via BOTH the
      // unhandledrejection global handler AND Vue's error handler; drop by message
      // here so suppression doesn't depend on ignoreErrors matching a particular
      // capture path. chunk-error.client.ts already hard-reloads onto the new build.
      const exMsg = (ex as { message?: string } | undefined)?.message
        ?? (typeof ex === 'string' ? ex : '')
      const msg = `${exMsg} ${event?.exception?.values?.[0]?.value ?? ''}`
      if (/importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module|not a valid javascript mime type|unable to preload css/i.test(msg)) return null
      const status = (hint?.originalException as { statusCode?: number } | undefined)?.statusCode
      if (typeof status === 'number' && status >= 400 && status < 500) return null
      return event
    },
  })

  try {
    Sentry.setTag('region', useRegion())
  } catch { /* useRegion needs a request scope; safe to skip if unavailable */ }
})
