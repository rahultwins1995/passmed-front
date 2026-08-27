// Centralised HTML sanitizer for all CMS-supplied content rendered via v-html.
//
// Every v-html sink in this layer (page.content, exam.content_*, the
// announcement banner, etc.) passes through sanitizeHtml() so that admin- or
// backend-supplied HTML cannot inject <script>, on*= event handlers,
// javascript: URIs, or other active content into a user's session.
//
// Defence-in-depth: this runs in addition to (not instead of) backend
// sanitisation and the Content-Security-Policy header set in nuxt.config.ts.
//
// Uses isomorphic-dompurify so the same sanitisation runs during SSR (Node)
// and on the client. Requires the dependency in the host app:
//   npm install isomorphic-dompurify
import DOMPurify from 'isomorphic-dompurify'

// Force target="_blank" links to carry rel="noopener noreferrer" so sanitised
// content can't reach back into window.opener.
// Note: don't use `instanceof Element` here — the global Element doesn't exist
// during SSR (Node), which throws "Element is not defined". Feature-detect the
// DOM methods on the node instead.
DOMPurify.addHook('afterSanitizeAttributes', (node: any) => {
  const tag = node?.nodeName?.toLowerCase()
  if (typeof node?.getAttribute !== 'function' || typeof node?.setAttribute !== 'function') return

  // Force target="_blank" links to carry rel="noopener noreferrer".
  if (tag === 'a' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer')
  }

  // Lazy-load CMS images. Every <img> here lives inside body/content blocks
  // (the page heroes are component-rendered inline SVG, not CMS <img>), so
  // deferring them improves LCP and saves mobile bandwidth. Respect an
  // explicit loading="eager" from the CMS author for a known above-the-fold
  // image; otherwise default to lazy + async decode.
  if (tag === 'img' && !node.getAttribute('loading')) {
    node.setAttribute('loading', 'lazy')
    if (!node.getAttribute('decoding')) node.setAttribute('decoding', 'async')
  }
})

/**
 * Sanitise an untrusted HTML string for safe use with v-html.
 * Returns an empty string for null/undefined/non-string input.
 *
 * Allows HTML + inline SVG (the CMS content uses inline <svg> icons), while
 * DOMPurify still strips <script> (including inside SVG), event-handler
 * attributes, javascript: URIs, and dangerous tags (iframe/object/embed).
 * Note: the `html` profile alone removes SVG, which blanks out CMS icons — so
 * `svg`/`svgFilters` are included here. If trusted embeds (e.g. video iframes)
 * are ever needed, extend the config with an explicit source allowlist rather
 * than disabling sanitisation at the call site.
 */
export const sanitizeHtml = (dirty?: string | null): string => {
  if (typeof dirty !== 'string' || dirty.length === 0) return ''
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
  })
}
