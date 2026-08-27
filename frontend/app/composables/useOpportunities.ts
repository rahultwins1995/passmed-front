/**
 * Opportunities board data helpers (client).
 *
 * `Listing` mirrors the JSON contract returned by GET /api/listings. It is declared
 * here (not imported from server/utils) so the client bundle never pulls in a server
 * module across the Nuxt-layer boundary — the shape is kept in sync with
 * server/utils/opportunities.ts by hand.
 *
 * useListings() SSR-fetches the current site's published board once and caches it
 * (the endpoint is CDN-cached ~30 days); postListing() submits the "Post a listing" form.
 */
export interface Listing {
  id: string
  title: string
  category: string
  region: string
  org: string
  location: string
  format: string
  type: string
  cost: string
  dates: string
  closing: string
  rolling: boolean
  requiresCV: boolean
  requiresCover: boolean
  description: string
  tags: string[]
  link: string
  enquiriesEmail: string
  salary: string
  logo: string
}

export interface ListingsResponse {
  count: number
  regions: string[]
  listings: Listing[]
}

export function useListings() {
  // SSR + cached; the endpoint is CDN-cached ~30 days so this is cheap.
  return useFetch<ListingsResponse>('/api/listings', { key: 'opportunities-listings' })
}

export interface PostListingPayload {
  type: 'course' | 'job' | 'event'
  format?: string
  title: string
  org: string
  location?: string
  country?: string
  city?: string
  enquiriesEmail?: string
  cost?: string
  description?: string
  link?: string
  website?: string
  submitterEmail: string
  requireCV?: boolean
  requireCover?: boolean
  rolling?: boolean
  closing?: string
  dates?: string
  company_website_hp?: string // honeypot — leave empty
  turnstileToken?: string
}

export function postListing(payload: PostListingPayload) {
  return $fetch<{ ok: true }>('/api/post-listing', { method: 'POST', body: payload })
}
