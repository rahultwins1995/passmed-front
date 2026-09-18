import { handleImpersonateEnter } from '../utils/impersonate'

/**
 * GET /api/impersonate-enter — fallback for when the handoff arrives as a GET
 * (older admin build that uses a link/redirect instead of a form POST, or a proxy
 * that converts the POST to a GET). Token is read from the ?token= query. Same logic
 * as the POST handler (impersonate-enter.post.ts) via handleImpersonateEnter.
 */
export default defineEventHandler(handleImpersonateEnter)
