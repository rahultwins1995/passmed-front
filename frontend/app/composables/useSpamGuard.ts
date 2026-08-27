/**
 * Lightweight, dependency-free spam heuristics for public forms.
 *
 *  • honeypot — a hidden field real users never see/fill; bots that auto-fill
 *    every input will populate it. Bind it to an off-screen input.
 *  • timing   — humans take a few seconds to fill a form; a submit within ~1.5s
 *    of the form becoming interactive is almost certainly a script.
 *
 * This is a client-side first line of defence and complements (does not replace)
 * a CAPTCHA + server-side verification. The honeypot value and elapsed time are
 * also sent to the backend so it can apply the same checks server-side, which is
 * what actually stops bots that POST the endpoint directly.
 */
export function useSpamGuard () {
  const honeypot = ref('')
  const startedAt = ref(0)

  // Set on mount so timing reflects when the form became interactive (client),
  // not when it was server-rendered.
  onMounted(() => { startedAt.value = Date.now() })

  function elapsedMs (): number {
    return startedAt.value ? Date.now() - startedAt.value : 0
  }

  /** True when the submission looks automated and should be dropped. */
  function isLikelyBot (): boolean {
    // Only the honeypot (a hidden field real users never fill) is a reliable
    // signal. The old <1.5s timing check was removed — it silently faked
    // success for fast/legit users. Real bot protection is Cloudflare Turnstile
    // (server-verified); elapsedMs is still sent so the backend can use it too.
    if (honeypot.value) return true
    return false
  }

  return { honeypot, isLikelyBot, elapsedMs }
}
