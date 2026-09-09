// Centralised HTML sanitizer for all backend-supplied content rendered via
// v-html in the STUDENT layer (question stems, vignettes, explanations, FAQ
// answers, flagged-question previews, review text).
//
// Deliberate standalone clone of frontend/app/utils/sanitize.ts — the student
// portal is an independent layer (same reasoning as institute's authApi.ts:
// "a deliberate standalone clone, NOT a reuse... the apps are independent").
// Keeping a local copy means the student layer carries its own defence even if
// the frontend layer is reordered or removed. The implementation is
// intentionally identical to the frontend's so behaviour can't drift apart.
//
// Defence-in-depth: this runs IN ADDITION to (not instead of) the admin-side
// server sanitisation that already cleans the question bank. Its real value is
// guarding any future user-generated content (flag notes, instructor comments,
// support submissions) that might one day reach these same v-html sinks.
//
// Uses isomorphic-dompurify (a root dependency) so the same sanitisation runs
// during SSR (Node) and on the client.
import DOMPurify from 'isomorphic-dompurify'

// Force target="_blank" links to carry rel="noopener noreferrer" so sanitised
// content can't reach back into window.opener. Feature-detect DOM methods
// instead of using `instanceof Element`, which is undefined during SSR (Node).
DOMPurify.addHook('afterSanitizeAttributes', (node: any) => {
  const tag = node?.nodeName?.toLowerCase()
  if (typeof node?.getAttribute !== 'function' || typeof node?.setAttribute !== 'function') return

  if (tag === 'a' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer')
  }

  // Accessibility: an image with no author alt text gets an empty alt so screen
  // readers treat it as decorative (skip) instead of announcing the src URL. Safety
  // net — authors should still supply meaningful alt in the CMS editor.
  if (tag === 'img' && !node.getAttribute('alt')) {
    node.setAttribute('alt', '')
  }
})

/**
 * Sanitise an untrusted HTML string for safe use with v-html.
 * Returns an empty string for null/undefined/non-string/empty input.
 *
 * Allows HTML + inline SVG (question content can include inline <svg> for
 * diagrams/icons), while DOMPurify still strips <script> (including inside
 * SVG), event-handler attributes, javascript: URIs, and dangerous tags
 * (iframe/object/embed). If trusted embeds are ever needed, extend the config
 * with an explicit source allowlist rather than disabling sanitisation at the
 * call site.
 */
export const sanitizeHtml = (dirty?: string | null): string => {
  if (typeof dirty !== 'string' || dirty.length === 0) return ''
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
  })
}

/**
 * True only when `val` is a usable http(s) image URL.
 *
 * `question_image_ids` in the DB holds three kinds of value: a real CDN URL
 * (https://d2vrujxrqm3l5p.cloudfront.net/...), an EMPTY string, or a legacy
 * BoardVitals path (\Images_BoardVitals\default_...). Only the first is
 * renderable — the guard requires an http:// or https:// prefix so the image
 * <div> is skipped entirely for the other two, leaving no empty box behind.
 */
export const isImageUrl = (val?: string | null): boolean => {
  if (typeof val !== 'string') return false
  return /^https?:\/\/\S+/i.test(val.trim())
}
