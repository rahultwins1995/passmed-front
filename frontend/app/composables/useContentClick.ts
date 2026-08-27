export const useContentClick = () => {
  const router = useRouter()
  const { isLoginOpen, isSignupOpen, isInviteOpen } = useLoginModal()

  // CMS HTML CONTRACT:
  // The composable + page-level wrappers intercept clicks on CMS content
  // using these identifiers (in priority order):
  //
  //   1. `data-action="<action>"`     — preferred, explicit
  //   2. specific class name           — e.g. .browse-exams-btn, .reach-out-btn
  //   3. text-content match            — last-resort fallback
  //
  // Supported actions:
  //   data-action="signup"        → opens signup modal
  //   data-action="login"         → opens login modal
  //   data-action="invite"        → opens invite modal
  //   data-action="browse-exams"  → navigates to /exams (homepage)
  //   data-action="contact"       → navigates to /contact (about-us)
  //
  // CMS editors should prefer the data-action attribute. The text-match
  // fallback exists so existing content keeps working without admin edits.
  const onContentClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target) return

    // === FAQ toggle ===
    const faqTrigger = target.closest('.faq-question')
    if (faqTrigger) {
      const item = faqTrigger.closest('.faq-item')
      if (item) {
        e.preventDefault()
        item.classList.toggle('open')
      }
      return
    }

    // === Anchor handling ===
    const anchor = target.closest('a')
    if (!anchor) return

    // === Action handlers (data-action) ===
    const action = anchor.dataset.action
    if (action) {
      e.preventDefault()
      switch (action) {
        case 'signup': isSignupOpen.value = true; break
        case 'login':  isLoginOpen.value  = true; break
        case 'invite': isInviteOpen.value = true; break
      }
      return
    }

    // === Internal navigation ===
    const href = anchor.getAttribute('href')
    if (!href) return
    if (anchor.target === '_blank' || anchor.hasAttribute('download')) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    if (
      href.startsWith('http://')  ||
      href.startsWith('https://') ||
      href.startsWith('mailto:')  ||
      href.startsWith('tel:')     ||
      href.startsWith('#')
    ) return
    if (
      href.startsWith('javascript:') ||
      href.startsWith('data:')       ||
      href.startsWith('vbscript:')
    ) {
      e.preventDefault()
      return
    }

    e.preventDefault()
    router.push(href)
  }

  return { onContentClick }
}