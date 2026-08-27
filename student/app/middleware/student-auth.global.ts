// Global route middleware for /student/* and /institute/*.
//
// The rules now live in ONE place: frontend/app/utils/portalGuard.ts. This file
// and the institute layer's institute-auth.global.ts used to hold byte-identical
// copies of the same logic. Both layers still ship a middleware file (so the
// guard registers even if a layer is loaded on its own) but neither owns the
// rules any more.
//
// Edit portalGuard.ts, not this file.
import { runPortalGuard } from '../../../frontend/app/utils/portalGuard'

export default defineNuxtRouteMiddleware(async (to) => runPortalGuard(to))
