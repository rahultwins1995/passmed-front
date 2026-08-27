// Centralised logging facade for the STUDENT layer.
//
// Why this exists: the composables and pages do a lot of *defensive* logging in
// catch blocks (transient 401s during background polls, brief network drops,
// best-effort syncs). Logging those directly via `console.warn`/`console.error`
// spams the browser DevTools in production every time a user hits a benign
// failure mode — it looks unfinished and helps no one.
//
// Routing every such call through `log.*` gives us:
//   • DEV-only console output (silent in production builds), and
//   • a single choke point to forward to an error-tracking service later
//     (Sentry/Bugsnag) without touching every call site again.
//
// Usage:
//   log.warn('flagged', 'fetchCategories failed', err)
//   log.error('completeSession', 'POST /complete failed', err)
//
// Auto-imported (app/utils is in Nuxt's auto-import scan), so no import needed.

function format(scope: string, msg: string): string {
  return `[${scope}] ${msg}`
}

export const log = {
  warn(scope: string, msg: string, err?: unknown): void {
    if (!import.meta.dev) return
    // Future (prod): forward to error tracking, e.g. Sentry.captureMessage(format(scope, msg), { level: 'warning', extra: { err } })
    if (err !== undefined) console.warn(format(scope, msg), err)
    else console.warn(format(scope, msg))
  },

  error(scope: string, msg: string, err?: unknown): void {
    if (!import.meta.dev) return
    // Future (prod): forward to error tracking, e.g. Sentry.captureException(err, { tags: { scope }, extra: { msg } })
    if (err !== undefined) console.error(format(scope, msg), err)
    else console.error(format(scope, msg))
  },
}
