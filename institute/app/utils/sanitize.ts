// Centralised HTML sanitizer for the INSTITUTE layer. The portal deliberately
// avoids v-html everywhere except the Help/FAQ page (help.vue), whose answers
// are admin-authored rich HTML (bold, links, lists) served by /faqs. Rendering
// that raw is an XSS sink — a crafted answer could run script in every staff
// member's browser. Everything routed through sanitizeHtml() is cleaned first:
// DOMPurify strips <script>, event-handler attributes, javascript: URIs and
// dangerous tags (iframe/object/embed) while keeping normal formatting.
//
// Deliberate standalone clone of the student/frontend sanitize.ts — the three
// Nuxt apps are independent layers, so each carries its own defence rather than
// importing across app boundaries. Uses isomorphic-dompurify (root dependency),
// so the same sanitisation runs during SSR (Node) and on the client.
//
// Auto-imported by Nuxt (utils/), so templates can call sanitizeHtml(...) directly.
import DOMPurify from 'isomorphic-dompurify'

// Force target="_blank" links to carry rel="noopener noreferrer" so sanitised
// content can't reach back into window.opener. Feature-detect DOM methods
// instead of `instanceof Element`, which is undefined during SSR (Node).
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
 */
export const sanitizeHtml = (dirty?: string | null): string => {
  if (typeof dirty !== 'string' || dirty.length === 0) return ''
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
  })
}
