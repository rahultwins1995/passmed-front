/**
 * Shared Brevo (Sendinblue) API v3 helper for the server routes that talk to Brevo
 * (img-subscribe, img-request-destination). Auto-imported into server routes.
 *
 * The API key is NEVER placed in runtimeConfig — it is read from process.env only
 * inside the routes and passed in here, so it never reaches the client bundle.
 */
export const BREVO_BASE = 'https://api.brevo.com/v3'

// Verified Passmed sender defaults (overridable via env in the calling route).
export const BREVO_DEFAULT_SENDER_EMAIL = 'noreply@mail.passmed.com'
export const BREVO_DEFAULT_SENDER_NAME = 'Passmed'

/**
 * Call the Brevo API. Returns the parsed JSON body ({} on 204). Throws on a
 * non-2xx response EXCEPT a "contact already exists" 400, which callers rely on
 * for idempotent upserts (updateEnabled handles the merge).
 */
export async function brevo (path: string, apiKey: string, body?: unknown, method = 'POST') {
  const res = await fetch(BREVO_BASE + path, {
    method,
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok && res.status !== 204) {
    const txt = await res.text()
    if (!/duplicate_parameter|Contact already exist/i.test(txt)) {
      throw new Error(`Brevo ${path} ${res.status}: ${txt}`)
    }
  }
  return res.status === 204 ? {} : res.json().catch(() => ({}))
}
