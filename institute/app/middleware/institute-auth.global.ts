// Global route middleware for /institute/* and /student/*.
//
// The rules now live in ONE place: frontend/app/utils/portalGuard.ts. This file
// and the student layer's student-auth.global.ts used to hold byte-identical
// copies of the same logic, with comments asking future editors to keep them in
// sync. Both layers still ship a middleware file (so the guard registers even if
// a layer is loaded on its own) but neither owns the rules any more.
//
// Both are registered globally and both run on every navigation — that was
// already true, and the guard is idempotent, so it stays harmless.
//
// Edit portalGuard.ts, not this file.
import { runPortalGuard } from '../../../frontend/app/utils/portalGuard'

export default defineNuxtRouteMiddleware(async (to) => runPortalGuard(to))
