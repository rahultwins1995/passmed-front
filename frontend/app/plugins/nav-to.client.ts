// Intentionally a no-op.
//
// This plugin used to set a `window.navTo(slug)` global so CMS HTML could call
// it from inline onclick handlers. That polluted the global namespace, and the
// HTML sanitizer (utils/sanitize.ts) now strips inline event handlers, so such
// calls no longer fire regardless.
//
// CMS links should use normal relative hrefs (e.g. <a href="/contact">), which
// the shared useContentClick delegation routes through the Vue router. No global
// is needed. Left as an empty plugin because the file can't be deleted here;
// safe to remove from the repo.
export default defineNuxtPlugin(() => {})
