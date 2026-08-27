export default defineNuxtPlugin((nuxtApp) => {
  // Cloudflare's email-protection algorithm:
  // first byte is XOR key, remaining bytes are key-XOR'd ASCII chars.
  const decodeCfEmail = (encoded: string): string => {
    if (!encoded || encoded.length < 4 || encoded.length % 2 !== 0) return ''
    const key = parseInt(encoded.substring(0, 2), 16)
    let decoded = ''
    for (let i = 2; i < encoded.length; i += 2) {
      decoded += String.fromCharCode(parseInt(encoded.substring(i, i + 2), 16) ^ key)
    }
    return decoded
  }

  const decodeAll = () => {
    // 1. Decode the visible span text
    document.querySelectorAll<HTMLSpanElement>('span.__cf_email__[data-cfemail]').forEach(span => {
      const encoded = span.getAttribute('data-cfemail')
      if (!encoded) return
      const email = decodeCfEmail(encoded)
      if (!email || !email.includes('@')) return

      span.textContent = email
      span.removeAttribute('data-cfemail')
      span.classList.remove('__cf_email__')

      // 2. Fix the parent <a> href if it's a /cdn-cgi/... placeholder
      const link = span.closest('a')
      if (link) {
        const href = link.getAttribute('href') || ''
        if (href.includes('/cdn-cgi/l/email-protection')) {
          // Preserve a subject hint after the # if you've encoded one — but
          // your existing markup doesn't, so this is just `mailto:address`.
          link.setAttribute('href', `mailto:${email}`)
        }
      }
    })

    // 2. Pattern C — the anchor itself carries the class + data-cfemail (no nested
    //    span). Seen in CMS-rendered legal pages (privacy, terms). Without this
    //    handler the user sees the literal "[email protected]" placeholder.
    document.querySelectorAll<HTMLAnchorElement>('a.__cf_email__[data-cfemail]').forEach(link => {
      const encoded = link.getAttribute('data-cfemail')
      if (!encoded) return
      const email = decodeCfEmail(encoded)
      if (!email || !email.includes('@')) return

      link.textContent = email
      link.setAttribute('href', `mailto:${email}`)
      link.removeAttribute('data-cfemail')
      link.classList.remove('__cf_email__')
    })

    // 3. Some Cloudflare markup wraps the entire <a> with the encoded value
    //    in href hash (e.g. "/cdn-cgi/l/email-protection#abc...") and uses
    //    the link text itself as the placeholder. Catch those too.
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/cdn-cgi/l/email-protection"]').forEach(link => {
      const href = link.getAttribute('href') || ''
      const hash = href.split('#')[1]
      if (!hash) return
      const email = decodeCfEmail(hash)
      if (!email || !email.includes('@')) return

      link.setAttribute('href', `mailto:${email}`)
      // Replace the placeholder link text only if it's still the placeholder
      const text = link.textContent?.trim() || ''
      if (/^\[email[\s\u00a0]+protected\]$/i.test(text)) {
        link.textContent = email
      }
    })
  }

  // Observe future DOM mutations to catch late-mounted CMS content (e.g. legal pages
  // loaded via useAsyncData that resolve after page:finish fires).
  if (typeof window !== 'undefined' && 'MutationObserver' in window) {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue // ELEMENT_NODE
          const el = node as HTMLElement
          // Cheap pre-check: does any addedNode contain a cf email pattern?
          if (
            el.querySelector?.('span.__cf_email__, a.__cf_email__, a[href*="/cdn-cgi/l/email-protection"]') ||
            el.matches?.('span.__cf_email__, a.__cf_email__, a[href*="/cdn-cgi/l/email-protection"]')
          ) {
            decodeAll()
            return
          }
        }
      }
    })
    // Wait for body to exist before observing.
    const startObserving = () => {
      if (document.body) observer.observe(document.body, { childList: true, subtree: true })
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserving, { once: true })
    } else {
      startObserving()
    }
  }

  // Run on every navigation, after Suspense + async data resolve.
  nuxtApp.hook('page:finish', () => {
    nextTick(decodeAll)
  })

  // Also run on initial hydration.
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', decodeAll, { once: true })
    } else {
      decodeAll()
    }
  }
})