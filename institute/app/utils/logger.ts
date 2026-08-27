// Centralized client-side logging chokepoint for the institute portal.
//
// WHY: defensive catch-blocks across the institute pages/composables used to
// call console.error / console.warn directly. That dumped raw error objects
// into the browser DevTools console in production every time a user hit a
// failure mode (failed profile fetch, CSV invite error, report generation,
// etc.). Routing everything through here gives us ONE place to:
//   1. silence that noise in production (logs only emit in dev), and
//   2. later forward errors to a real error-tracking service (Sentry, etc.)
//      without touching every call site again.
//
// Drop-in shape: logError(...args) / logWarn(...args) mirror console.* exactly,
// so migrating a call site only means renaming the function.
//
// Auto-imported like the layer's other utils (see authApi.ts) — no import
// statement needed at call sites.

const isDev = import.meta.dev

export function logError(...args: unknown[]): void {
  // Future extension: forward to an error-tracking service here, e.g.
  //   Sentry.captureException(args.find(a => a instanceof Error) ?? args)
  if (isDev) console.error(...args)
}

export function logWarn(...args: unknown[]): void {
  // Future extension: optionally forward warnings to the same service at a lower severity.
  if (isDev) console.warn(...args)
}
