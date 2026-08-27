export default defineNuxtPlugin((nuxtApp) => {
  const STAGGER_SELECTOR =
    '.step-card,.feat,.proof-card,.path-card,.plan-card,.exam-category'

  // Plugin-scope observer — survives re-init
  let obs: IntersectionObserver | null = null

  const animateChildren = (target: Element) => {
    const kids = target.querySelectorAll<HTMLElement>(STAGGER_SELECTOR)
    kids.forEach((k, i) => {
      k.style.transitionDelay = `${i * 0.07}s`
      k.style.opacity = '0'
      k.style.transform = 'translateY(18px)'
      setTimeout(() => {
        k.style.transition =
          'opacity 0.5s cubic-bezier(0.16,1,0.3,1), transform 0.5s cubic-bezier(0.16,1,0.3,1)'
        k.style.opacity = '1'
        k.style.transform = 'none'
      }, 20 + i * 70)
    })
  }

  const initReveal = () => {
    // Tear down previous observer before creating a new one
    if (obs) {
      obs.disconnect()
      obs = null
    }

    // Respect user's motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'))
      return
    }

    obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return
          if (e.target.querySelectorAll(STAGGER_SELECTOR).length) {
            animateChildren(e.target)
          }
          e.target.classList.add('visible')
          obs?.unobserve(e.target)
        })
      },
      // threshold 0 = reveal as soon as ANY part of the element enters the viewport.
      // (0.05 required 5% of the element's height to be visible, which a very tall
      //  CMS section can never reach — so it stayed blank/opacity:0 until far scrolled.)
      // rootMargin lifts the trigger 40px early for a slightly smoother reveal.
      { threshold: 0, rootMargin: '0px 0px -40px 0px' }
    )

    document.querySelectorAll('.reveal').forEach((el) => {
      el.classList.remove('visible')
      const rect = el.getBoundingClientRect()
      if (rect.top < window.innerHeight) {
        el.classList.add('visible')
      } else {
        obs!.observe(el)
      }
    })
  }

  // Final cleanup when the app unmounts
  const teardown = () => {
    if (obs) {
      obs.disconnect()
      obs = null
    }
  }

  // Run the FIRST reveal pass only AFTER hydration is fully settled.
  // Previously this ran on `app:mounted` + nextTick, which — because the home
  // page component is async (top-level `await useAsyncData`, wrapped in Suspense)
  // — could fire while those `.reveal` sections were still hydrating. Adding the
  // `visible` class to a node mid-hydration makes the live DOM diverge from what
  // Vue expects to hydrate, producing "Hydration completed but contains
  // mismatches." onNuxtReady defers to after hydration + browser idle, so the
  // server HTML and the client's first render are identical.
  onNuxtReady(() => initReveal())
  // Subsequent client-side navigations aren't hydration, so reveal normally —
  // but guard against the initial load, where page:finish can also fire while
  // `isHydrating` is still true.
  nuxtApp.hook('page:finish', () => { if (!nuxtApp.isHydrating) nextTick(initReveal) })
  nuxtApp.hook('app:beforeMount', teardown)

  // No window.initReveal — that was debug leftover
})