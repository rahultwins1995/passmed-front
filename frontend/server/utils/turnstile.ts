/**
 * Cloudflare Turnstile server-side verification (auto-imported into server routes).
 *
 * Optional by design: if NUXT_TURNSTILE_SECRET is not set, verification is skipped
 * so the feature ships inert and activates once the secret is configured (matching
 * TurnstileWidget.vue, which only renders when a site key is set). This is the
 * layer that actually stops bots POSTing the endpoints directly.
 */
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Returns true if the token is valid, or if verification is not configured (no-op). */
export async function verifyTurnstile (token: string, remoteip?: string): Promise<boolean> {
  const secret = process.env.NUXT_TURNSTILE_SECRET
  if (!secret) return true // not configured → don't block

  if (!token) return false
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (remoteip) body.set('remoteip', remoteip)
    const res: any = await $fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    return !!res?.success
  } catch (e) {
    console.error('turnstile verify failed', e)
    return false
  }
}
