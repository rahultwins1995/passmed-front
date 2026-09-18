<!--
  Opportunities board — "Courses, jobs & events".

  Reads this site's PUBLISHED listings from /api/listings (multitenant: the server
  picks the Airtable base + region from the deployment, so the page sends no base id)
  and lets people browse them as a card list or a month calendar, open a detail modal,
  and post a new listing (→ /api/post-listing, lands as Pending review).

  Design ported from the approved design-reference.html. All CSS is namespaced under
  .opps (variables included) so nothing leaks into the rest of the site and the two
  v-html'd surfaces (the calendar grid) are styled too. The board only changes at the
  monthly ingest+approval, so the read endpoint is CDN-cached and the page is ISR.
-->
<script setup lang="ts">
import type { Listing } from '~/composables/useOpportunities'

const region = useRegion()
// "Resident" has no meaning in UK/SA postgraduate training — both use "doctors in training".
const audienceWord = (region === 'UK' || region === 'SA') ? 'doctors in training' : 'residents'

usePageSeo({
  title: 'Courses, jobs & events · Passmed',
  description:
    `A curated board of courses, jobs and events, hand-picked for ${audienceWord} and medical students. Free to browse, free to list.`,
})

const { isLoggedIn, user } = useAuth()

const { data, pending, error } = useListings()
const listings = computed<Listing[]>(() => data.value?.listings ?? [])

/* ---------- category config (order: Jobs, Events, Courses, Exams) ---------- */
const CATS = [
  { key: 'job', label: 'Jobs', emoji: '💼' },
  { key: 'event', label: 'Events', emoji: '📅' },
  { key: 'course', label: 'Courses', emoji: '📚' },
  { key: 'exam', label: 'Exams', emoji: '🎓' },
] as const
const CAT_LABEL: Record<string, string> = { job: 'Job', course: 'Course', event: 'Event', exam: 'Exam' }
const catLabel = (c: string) => CAT_LABEL[c] || c

/* ---------- filter / sort state ---------- */
const selectedCats = ref<Set<string>>(new Set()) // empty = All
const q = ref('')
const format = ref('')
// Default the country filter to this site's own market (audit PM-25: the shared
// UK/SA/AU board otherwise opens on "All countries", so a UK visitor's first
// screen included SA/AU-priced listings). PH is deliberately excluded — its board
// intentionally mixes Philippines listings with international pathway listings
// (see server/utils/opportunities.ts), so it must never default to a single
// country. The dropdown still lets anyone broaden back to "All countries".
const REGION_DEFAULT_COUNTRY: Record<string, string> = {
  US: 'United States', CA: 'Canada', UK: 'United Kingdom', SA: 'South Africa', AU: 'Australia',
}
const country = ref(REGION_DEFAULT_COUNTRY[useRegion()] || '')
const sort = ref<'featured' | 'soonest' | 'az'>('featured')
const view = ref<'list' | 'calendar'>('list')

function toggleCat (key: string) {
  const s = new Set(selectedCats.value)
  s.has(key) ? s.delete(key) : s.add(key)
  if (s.size === CATS.length) s.clear() // all four ≡ All
  selectedCats.value = s
}
// Chip counts should reflect the active search/country/format filters (just not
// the category filter itself) — otherwise the "All" chip shows the full board
// total while the result line below shows a much smaller filtered count.
const preCategoryFiltered = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return listings.value.filter((l) => {
    if (format.value && l.format !== format.value) return false
    if (country.value && countryBucket(l) !== country.value) return false
    if (needle) {
      const h = `${l.title} ${l.org} ${l.location} ${l.tags.join(' ')} ${l.description}`.toLowerCase()
      if (!h.includes(needle)) return false
    }
    return true
  })
})
const catCount = (key: string) => preCategoryFiltered.value.filter(l => l.category === key).length

/* ---------- small helpers ---------- */
const esc = (s: unknown) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const p2 = (n: number) => String(n).padStart(2, '0')
const isEmailClient = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim())
const initials = (o: string) => (o || '?').replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
const isFree = (l: Listing) => (l.cost || '').trim().toLowerCase() === 'free'

/* ---------- logo quality gate ----------
   Ingested logos vary wildly (favicons, cropped wordmarks, tiny sprites). Show a
   logo only if it loads AND is big enough and roughly square-ish; anything that
   fails, is tiny, or is a wide/tall wordmark falls back to clean org initials so
   the grid never shows a distorted image. */
const badLogos = ref<Set<string>>(new Set())
function markBadLogo (id: string) { if (!badLogos.value.has(id)) badLogos.value = new Set(badLogos.value).add(id) }
const logoOk = (l: Listing) => !!l.logo && !badLogos.value.has(l.id)
function evalLogo (el: HTMLImageElement, id: string) {
  const w = el.naturalWidth, h = el.naturalHeight
  if (!w || !h) { markBadLogo(id); return }
  const ratio = w / h
  if (w < 32 || h < 32 || ratio > 2 || ratio < 0.5) markBadLogo(id) // too small or too wide/tall → initials
}
// Directive (not just @load): an image cached/decoded before hydration never fires
// `load`, so we also evaluate `el.complete` on mount — otherwise a bad logo would
// slip past the gate on fast/repeat loads.
const vLogo = {
  mounted (el: HTMLImageElement, binding: { value: string }) {
    const id = binding.value
    if (el.complete) { if (el.naturalWidth) evalLogo(el, id); else markBadLogo(id) }
    el.addEventListener('load', () => evalLogo(el, id))
    el.addEventListener('error', () => markBadLogo(id))
  },
}

/* Strip ingest boilerplate (e.g. Adzuna apply links) from a description for display. */
function cleanDescription (d: string) {
  return String(d || '')
    // "→ View the full job post and apply: https://…adzuna…" → "View the full job post and apply below:"
    .replace(/(?:→\s*)?(view the full job post and apply)\s*:?\s*https?:\/\/\S+/gi, '$1 below:')
    // strip any other stray Adzuna URL
    .replace(/https?:\/\/\S*adzuna\S*/gi, '')
    // tidy leftover arrows and doubled whitespace
    .replace(/→/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
const applyLabel = (l: Listing) => l.category === 'job' ? 'View & apply' : l.category === 'course' ? 'View course' : l.category === 'exam' ? 'View exam' : 'View event'
const jobClosing = (l: Listing) => l.rolling ? 'Rolling — open until filled' : (l.closing || '—')

/* Country a listing belongs to. Prefer the authoritative Airtable Region (so a
   Canadian "Toronto, ON" is never mis-read as a US "City, ST"); fall back to a
   location guess only for Remote/Global or unlabelled rows. */
const REGION_TO_COUNTRY: Record<string, string> = {
  'United States': 'United States', 'Canada': 'Canada',
  'United Kingdom': 'United Kingdom', 'UK': 'United Kingdom',
  'South Africa': 'South Africa', 'Australia': 'Australia', 'New Zealand': 'New Zealand',
}
function countryOf (loc: string) {
  const s = (loc || '').toLowerCase()
  if (/\b(uk|united kingdom|england|scotland|wales|london|manchester|edinburgh|birmingham)\b/.test(s)) return 'United Kingdom'
  if (/\b(south africa|johannesburg|cape town|durban|pretoria|gauteng)\b/.test(s)) return 'South Africa'
  if (/\b(new zealand|auckland|wellington|christchurch)\b/.test(s)) return 'New Zealand'
  if (/\b(australia|sydney|melbourne|brisbane|perth|adelaide)\b/.test(s)) return 'Australia'
  if (/\b(canada|toronto|vancouver|montreal|ottawa|calgary|edmonton|winnipeg|halifax|,\s*(on|bc|qc|ab|mb|sk|ns|nb|nl|pe))\b/.test(s)) return 'Canada'
  if (/,\s*[a-z]{2}\b/.test(s) || /\b(usa|united states|\bus\b)\b/.test(s)) return 'United States'
  if (/online|remote|virtual|test center|anywhere/.test(s)) return 'Remote / Online'
  return 'Other'
}
function countryBucket (l: Listing) {
  if (REGION_TO_COUNTRY[l.region]) return REGION_TO_COUNTRY[l.region]
  if (l.region === 'Remote / Global' || l.region === 'Remote') return 'Remote / Online'
  return countryOf(l.location)
}
const countryOptions = computed(() => {
  const seen = new Set(listings.value.map(countryBucket))
  const order = ['United States', 'Canada', 'United Kingdom', 'South Africa', 'Australia', 'New Zealand', 'Remote / Online', 'Other']
  return order.filter(c => seen.has(c))
})

/* Country → major medical-hub cities, for the "Post a listing" location pickers. */
const CITY_MAP: Record<string, string[]> = {
  'United States': ['New York, NY', 'Boston, MA', 'Chicago, IL', 'Los Angeles, CA', 'San Francisco, CA', 'Houston, TX', 'Philadelphia, PA', 'Washington, DC', 'Atlanta, GA', 'Dallas, TX', 'Miami, FL', 'Phoenix, AZ', 'Seattle, WA', 'Baltimore, MD', 'Cleveland, OH', 'Detroit, MI', 'Minneapolis, MN', 'Pittsburgh, PA', 'Nationwide'],
  'Canada': ['Toronto, ON', 'Vancouver, BC', 'Montreal, QC', 'Calgary, AB', 'Ottawa, ON', 'Edmonton, AB', 'Winnipeg, MB', 'Halifax, NS', 'Quebec City, QC', 'London, ON', 'Nationwide'],
  'United Kingdom': ['London', 'Manchester', 'Birmingham', 'Leeds', 'Liverpool', 'Bristol', 'Sheffield', 'Newcastle', 'Nottingham', 'Edinburgh', 'Glasgow', 'Cardiff', 'Belfast', 'Nationwide'],
  'South Africa': ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Gqeberha (Port Elizabeth)', 'Bloemfontein', 'Nationwide'],
  'Australia': ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra', 'Gold Coast', 'Nationwide'],
  'New Zealand': ['Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Dunedin', 'Nationwide'],
}
// Countries offered in the post form: the ones this site serves, else all we know, + Remote.
const postCountries = computed(() => {
  const served = [...new Set((data.value?.regions || []).filter(r => !['Remote / Global', 'Remote', 'UK'].includes(r)))]
  const base = served.length ? served : Object.keys(CITY_MAP)
  return [...base, 'Remote / Online']
})
const cityOptions = computed(() => CITY_MAP[form.country] || [])

/* ---------- date parsing (human `dates` strings → ISO sessions, for the calendar) ----------
   Handles "13–15 Oct 2026", "19 Aug – 21 Oct 2026", "Oct 5–6, 2026", "Oct 12, 2026",
   and multiple sessions joined by "; ". Display everywhere else uses the raw `dates`
   string; only the calendar needs machine dates. */
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
function parsePart (str: string) {
  const s = String(str || '')
  const ym = s.match(/\b(\d{4})\b/)
  const rest = s.replace(/\b\d{4}\b/, ' ')
  const mm = rest.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/)
  const dm = rest.match(/\b(\d{1,2})\b/)
  return { y: ym ? +ym[1] : null, m: mm ? MONTHS[mm[1]] : null, d: dm ? +dm[1] : null }
}
const isoOf = (y: number, m: number, d: number) => `${y}-${p2(m + 1)}-${p2(d)}`
interface Session { start: string; end: string }
function parseOneRange (seg: string): Session | null {
  const parts = seg.split(/\s*[–—-]\s*/).filter(Boolean)
  const thisYear = new Date().getFullYear()
  if (parts.length === 1) {
    const p = parsePart(parts[0])
    if (p.m == null || p.d == null) return null
    const iso = isoOf(p.y || thisYear, p.m, p.d)
    return { start: iso, end: iso }
  }
  const L = parsePart(parts[0]), R = parsePart(parts[parts.length - 1])
  const year = R.y || L.y || thisYear
  const sM = L.m != null ? L.m : R.m, eM = R.m != null ? R.m : L.m
  if (sM == null || L.d == null || eM == null || R.d == null) return null
  return { start: isoOf(L.y || year, sM, L.d), end: isoOf(R.y || year, eM, R.d) }
}
function parseSessions (datesStr: string): Session[] {
  if (!datesStr) return []
  return String(datesStr).split(';').map(s => s.trim()).filter(Boolean)
    .map(parseOneRange).filter((s): s is Session => !!s)
}
// id → sessions, computed once per data change (the calendar reads this repeatedly)
const sessionMap = computed<Record<string, Session[]>>(() => {
  const m: Record<string, Session[]> = {}
  for (const l of listings.value) m[l.id] = l.category === 'job' ? [] : parseSessions(l.dates)
  return m
})
const sessionsFor = (l: Listing) => sessionMap.value[l.id] || []
const isAnytime = (l: Listing) => l.category !== 'job' && sessionsFor(l).length === 0
const isoLocal = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
function listingDays (l: Listing) {
  const days: string[] = []
  for (const s of sessionsFor(l)) {
    const e = new Date(s.end + 'T00:00')
    for (const d = new Date(s.start + 'T00:00'); d <= e; d.setDate(d.getDate() + 1)) days.push(isoLocal(d))
  }
  return days
}

/* ---------- filtered + sorted list ---------- */
function sortKey (l: Listing) {
  if (l.category === 'job') return l.rolling || !l.closing ? Infinity : (Date.parse(l.closing) || Infinity)
  const days = listingDays(l)
  return days.length ? new Date(days[0] + 'T00:00').getTime() : Infinity
}
const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase()
  let out = listings.value.filter((l) => {
    if (selectedCats.value.size && !selectedCats.value.has(l.category)) return false
    if (format.value && l.format !== format.value) return false
    if (country.value && countryBucket(l) !== country.value) return false
    if (needle) {
      const h = `${l.title} ${l.org} ${l.location} ${l.tags.join(' ')} ${l.description}`.toLowerCase()
      if (!h.includes(needle)) return false
    }
    return true
  })
  out = [...out]
  if (sort.value === 'az') out.sort((a, b) => a.title.localeCompare(b.title))
  else if (sort.value === 'soonest') out.sort((a, b) => sortKey(a) - sortKey(b))
  return out
})
const calendarListings = computed(() => filtered.value.filter(l => l.category !== 'job'))
const resultText = computed(() => {
  const n = view.value === 'calendar' ? calendarListings.value.length : filtered.value.length
  return `${n} listing${n !== 1 ? 's' : ''}`
})

/* ---------- pagination (list view, 50 per page) ---------- */
const PAGE_SIZE = 50
const page = ref(1)
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const pagedListings = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
// reset to page 1 whenever the filtered set changes shape
watch([q, format, country, sort, selectedCats], () => { page.value = 1 })
watch(pageCount, (n) => { if (page.value > n) page.value = n })
function gotoPage (p: number) {
  page.value = Math.min(Math.max(1, p), pageCount.value)
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}
// compact page-number strip: 1 … (p-1) p (p+1) … last
const pageItems = computed<(number | '…')[]>(() => {
  const n = pageCount.value, p = page.value
  if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const lo = Math.max(2, p - 1), hi = Math.min(n - 1, p + 1)
  if (lo > 2) out.push('…')
  for (let i = lo; i <= hi; i++) out.push(i)
  if (hi < n - 1) out.push('…')
  out.push(n)
  return out
})

/* ---------- card location, prefixed with country ---------- */
function locationLabel (l: Listing) {
  const c = countryBucket(l)
  const loc = (l.location || '').trim()
  if (c === 'Remote / Online') return loc || 'Remote / Online'
  if (!loc || loc.toLowerCase() === c.toLowerCase()) return c
  return `${c} · ${loc}`
}

/* ---------- footer line on a card ---------- */
function footInfo (l: Listing) {
  if (l.category === 'job') return l.rolling ? 'Rolling' : l.closing ? `Closes <b>${esc(l.closing)}</b>` : 'Open now'
  if (isAnytime(l)) return 'Start any time'
  return esc(l.dates)
}

/* ---------- detail modal ---------- */
const detail = ref<Listing | null>(null)
function openDetail (l: Listing) { detail.value = l }
function closeDetail () { detail.value = null }

/* ---------- board calendar view (v-html, ported from the reference) ---------- */
const cv = reactive<{ y: number | null; m: number | null }>({ y: null, m: null })
function cvInit () {
  const today = isoLocal(new Date())
  let min: string | null = null
  for (const l of listings.value) for (const iso of listingDays(l)) if (iso >= today && (!min || iso < min)) min = iso
  const d = min ? new Date(min + 'T00:00') : new Date()
  cv.y = d.getFullYear(); cv.m = d.getMonth()
}
function setView (v: 'list' | 'calendar') {
  view.value = v
  if (v === 'calendar' && cv.y == null) cvInit()
}
function cvNav (dir: number) {
  let m = (cv.m as number) + dir, y = cv.y as number
  if (m < 0) { m = 11; y-- } if (m > 11) { m = 0; y++ }
  cv.m = m; cv.y = y
}
function cvToday () { const t = new Date(); cv.y = t.getFullYear(); cv.m = t.getMonth() }

const calendarHtml = computed(() => {
  if (cv.y == null || cv.m == null) return ''
  const y = cv.y, m = cv.m
  const out = calendarListings.value
  const startDow = new Date(y, m, 1).getDay(), dim = new Date(y, m + 1, 0).getDate()
  const gridStart = new Date(y, m, 1); gridStart.setDate(1 - startDow)
  const weeks = Math.ceil((startDow + dim) / 7), todayIso = isoLocal(new Date())
  const dayNo = (iso: string) => Math.round((+new Date(iso + 'T00:00') - +gridStart) / 864e5)
  let undated = 0; for (const l of out) if (!listingDays(l).length) undated++
  let weeksHtml = ''
  for (let w = 0; w < weeks; w++) {
    const wStart = new Date(gridStart); wStart.setDate(gridStart.getDate() + w * 7)
    const wStartIso = isoLocal(wStart); const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 6); const wEndIso = isoLocal(wEnd)
    let bg = ''
    for (let i = 0; i < 7; i++) {
      const d = new Date(wStart); d.setDate(wStart.getDate() + i); const iso = isoLocal(d)
      bg += `<div class="cvd${d.getMonth() === m ? '' : ' pad'}${iso === todayIso ? ' today' : ''}"><span class="cv-dnum">${d.getDate()}</span></div>`
    }
    let bars = ''
    for (const l of out) {
      for (const s of sessionsFor(l)) {
        if (s.end < wStartIso || s.start > wEndIso) continue
        const a = s.start < wStartIso ? wStartIso : s.start, b = s.end > wEndIso ? wEndIso : s.end
        const c1 = dayNo(a) - w * 7 + 1, c2 = dayNo(b) - w * 7 + 2, contL = s.start < wStartIso, contR = s.end > wEndIso
        bars += `<button class="cv-bar ${l.category}${contL ? ' cont-l' : ''}${contR ? ' cont-r' : ''}" style="grid-column:${c1}/${c2}" title="${esc(l.title)} · ${esc(l.org)}" data-open="${esc(l.id)}">${esc(l.title)}</button>`
      }
    }
    weeksHtml += `<div class="cvw"><div class="cvw-bg">${bg}</div><div class="cvw-bars">${bars}</div></div>`
  }
  const monthName = new Date(y, m, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(x => `<div class="cv-dow">${x}</div>`).join('')
  const legend = `<div class="cv-legend"><span><i class="cv-dot" style="background:var(--amber)"></i>Course</span><span><i class="cv-dot" style="background:var(--navy)"></i>Event</span><span><i class="cv-dot" style="background:var(--exam)"></i>Exam</span></div>`
  const onlyJobs = selectedCats.value.size === 1 && selectedCats.value.has('job')
  const foot = onlyJobs
    ? `<div class="cv-foot">Jobs don't appear on the calendar — switch to <b>List</b> view to browse roles.</div>`
    : (undated ? `<div class="cv-foot">${undated} self-paced listing${undated !== 1 ? 's' : ''} without fixed dates ${undated !== 1 ? 'aren\'t' : 'isn\'t'} shown — switch to List to see ${undated !== 1 ? 'them' : 'it'}.</div>` : '')
  return `<div class="cv"><div class="cv-head"><button class="cv-nav" data-cvnav="-1" aria-label="Previous month">‹</button><div class="cv-mo">${monthName}</div><button class="cv-nav" data-cvnav="1" aria-label="Next month">›</button><button class="cv-today" data-cvnav="today">Today</button>${legend}</div><div class="cv-scroll"><div class="cv-dowrow">${dows}</div>${weeksHtml}</div>${foot}</div>`
})
function onCalClick (e: MouseEvent) {
  const t = e.target as HTMLElement
  const nav = t.closest('[data-cvnav]') as HTMLElement | null
  if (nav) {
    const v = nav.dataset.cvnav
    if (v === 'today') cvToday(); else cvNav(Number(v))
    return
  }
  const bar = t.closest('[data-open]') as HTMLElement | null
  if (bar) { const l = listings.value.find(x => x.id === bar.dataset.open); if (l) openDetail(l) }
}

/* ---------- post a listing ---------- */
const postOpen = ref(false)
const postSent = ref(false)
const posting = ref(false)
const postErr = ref('')
const turnstileToken = ref('')
const turnstileRef = ref<{ reset: () => void } | null>(null)
const form = reactive({
  type: 'course' as 'course' | 'job' | 'event',
  format: 'On-site',
  title: '', org: '', country: '', city: '', enquiriesEmail: '', cost: '',
  description: '', link: '', submitterEmail: '',
  rolling: false, closing: '',
  requireCV: true, requireCover: false,
  hp: '', // honeypot
})
const dateRanges = ref<{ start: string; end: string; label: string }[]>([])
const newStart = ref(''); const newEnd = ref('')

function fmtRange (startISO: string, endISO: string) {
  const S = new Date(startISO + 'T00:00'), E = new Date(endISO + 'T00:00')
  const mo = (d: Date) => d.toLocaleString('en-US', { month: 'short' })
  if (startISO === endISO) return `${mo(S)} ${S.getDate()}, ${S.getFullYear()}`
  if (S.getMonth() === E.getMonth() && S.getFullYear() === E.getFullYear()) return `${mo(S)} ${S.getDate()}–${E.getDate()}, ${S.getFullYear()}`
  return `${mo(S)} ${S.getDate()} – ${mo(E)} ${E.getDate()}, ${E.getFullYear()}`
}
function addDate () {
  if (!newStart.value) return
  let start = newStart.value, end = newEnd.value || newStart.value
  if (end < start) [start, end] = [end, start]
  dateRanges.value.push({ start, end, label: fmtRange(start, end) })
  newStart.value = ''; newEnd.value = ''
}
function removeDate (i: number) { dateRanges.value.splice(i, 1) }

function openPost () {
  form.type = 'course'; form.format = 'On-site'
  form.title = ''; form.org = ''; form.country = ''; form.city = ''; form.enquiriesEmail = ''; form.cost = ''
  form.description = ''; form.link = ''; form.submitterEmail = ''
  form.rolling = false; form.closing = ''; form.requireCV = true; form.requireCover = false; form.hp = ''
  dateRanges.value = []; newStart.value = ''; newEnd.value = ''
  postErr.value = ''; postSent.value = false; posting.value = false
  turnstileToken.value = ''; turnstileRef.value?.reset()
  postOpen.value = true
}
function closePost () { postOpen.value = false }

async function submitPost () {
  postErr.value = ''
  if (!form.title.trim() || !form.org.trim()) { postErr.value = 'Please add a title and organization.'; return }
  if (!form.country) { postErr.value = 'Please choose a country.'; return }
  if (form.country !== 'Remote / Online' && !form.city) { postErr.value = 'Please choose a city.'; return }
  if (!isEmailClient(form.submitterEmail)) { postErr.value = 'Please add a valid confirmation email.'; return }
  posting.value = true
  try {
    await postListing({
      type: form.type,
      format: form.format,
      title: form.title.trim(),
      org: form.org.trim(),
      country: form.country,
      city: form.city,
      enquiriesEmail: form.enquiriesEmail.trim(),
      cost: form.type === 'job' ? '' : form.cost.trim(),
      description: form.description.trim(),
      link: form.link.trim(),
      website: form.link.trim(),
      submitterEmail: form.submitterEmail.trim(),
      company_website_hp: form.hp,
      turnstileToken: turnstileToken.value,
      requireCV: form.requireCV,
      requireCover: form.requireCover,
      rolling: form.type === 'job' ? form.rolling : false,
      closing: form.type === 'job' && !form.rolling ? form.closing : '',
      dates: form.type === 'job' ? '' : dateRanges.value.map(r => r.label).join('; '),
    })
    postSent.value = true
  } catch (e: any) {
    postErr.value = e?.data?.statusMessage || 'Could not submit. Please try again.'
    turnstileToken.value = ''; turnstileRef.value?.reset() // token is single-use
  } finally {
    posting.value = false
  }
}

/* accessible modals: focus trap (Esc + Tab-cycle + focus restore) and scroll lock */
const detailModalEl = ref<HTMLElement | null>(null)
const postModalEl = ref<HTMLElement | null>(null)
const detailOpen = computed(() => !!detail.value)
const { lock, unlock } = useScrollLock()
useFocusTrap(detailModalEl, detailOpen, { onEscape: closeDetail })
useFocusTrap(postModalEl, postOpen, { onEscape: closePost })
watch(detailOpen, open => open ? lock('opps-detail') : unlock('opps-detail'))
watch(postOpen, open => open ? lock('opps-post') : unlock('opps-post'))
</script>

<template>
  <div class="opps">
    <!-- HERO -->
    <section class="ob-hero">
      <div class="ob-hero-inner">
        <span class="eyebrow">Passmed Community</span>
        <h1>Courses, jobs &amp; <span>events</span></h1>
        <p class="sub">A curated board of courses, jobs and events, hand-picked for {{ audienceWord }} and medical students. Free to browse. Free to list.</p>
        <div class="searchbar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="#7a95ad" stroke-width="2" /><path d="M20 20l-3-3" stroke="#7a95ad" stroke-width="2" stroke-linecap="round" /></svg>
          <input v-model="q" type="search" aria-label="Search listings" placeholder="Search courses, jobs, events, cities…">
        </div>
        <div class="tabs">
          <button class="tab" :aria-pressed="selectedCats.size === 0" :class="{ active: selectedCats.size === 0 }" @click="selectedCats = new Set()">
            All <span class="count">{{ preCategoryFiltered.length }}</span>
          </button>
          <button
            v-for="c in CATS" :key="c.key"
            class="tab" :aria-pressed="selectedCats.has(c.key)" :class="{ active: selectedCats.has(c.key) }"
            @click="toggleCat(c.key)"
          ><span aria-hidden="true">{{ c.emoji }}</span> {{ c.label }} <span class="count">{{ catCount(c.key) }}</span></button>
          <span class="tab-spacer" />
          <button class="suggest-btn" @click="openPost">＋ Post a listing</button>
        </div>
      </div>
    </section>

    <!-- BOARD -->
    <div class="wrap">
      <div class="toolbar">
        <div class="viewseg" role="group" aria-label="View">
          <button :class="{ on: view === 'list' }" :aria-pressed="view === 'list'" @click="setView('list')"><span aria-hidden="true">☰</span> List</button>
          <button :class="{ on: view === 'calendar' }" :aria-pressed="view === 'calendar'" @click="setView('calendar')"><span aria-hidden="true">📅</span> Calendar</button>
        </div>
        <select v-if="countryOptions.length > 1" v-model="country" class="sel" aria-label="Filter by country">
          <option value="">All countries</option>
          <option v-for="c in countryOptions" :key="c" :value="c">{{ c }}</option>
        </select>
        <select v-model="format" class="sel" aria-label="Filter by format">
          <option value="">All formats</option>
          <option>On-site</option><option>Remote</option><option>Hybrid</option>
        </select>
        <select v-show="view === 'list'" v-model="sort" class="sel" aria-label="Sort by">
          <option value="featured">Featured</option>
          <option value="soonest">Soonest date</option>
          <option value="az">A–Z</option>
        </select>
        <span class="result" role="status" aria-live="polite">{{ resultText }}</span>
      </div>

      <p v-if="pending" class="state">Loading listings…</p>
      <p v-else-if="error" class="state">Couldn't load listings right now. Please try again shortly.</p>

      <template v-else>
        <!-- LIST VIEW -->
        <div v-show="view === 'list'" class="grid">
          <button v-for="l in pagedListings" :key="l.id" class="card" :class="l.category" @click="openDetail(l)">
            <div class="card-top">
              <div class="card-id">
                <img v-if="logoOk(l)" v-logo="l.id" class="logo-img" :src="l.logo" :alt="`${l.org} logo`" referrerpolicy="no-referrer" decoding="async">
                <span v-else class="logo-tile" :class="l.category">{{ initials(l.org) }}</span>
                <span class="pill" :class="l.category">{{ catLabel(l.category) }}</span>
              </div>
              <div class="badges">
                <span v-if="isFree(l)" class="badge free">Free</span>
              </div>
            </div>
            <div>
              <div class="title">{{ l.title }}</div>
              <div class="org">{{ l.org }}</div>
            </div>
            <div class="meta">
              <span><span aria-hidden="true">📍</span> {{ locationLabel(l) }}</span>
              <span v-if="l.type"><span aria-hidden="true">🏷️</span> {{ l.type }}</span>
              <span v-if="l.category !== 'job' && l.cost"><span aria-hidden="true">🪙</span> {{ l.cost }}</span>
              <span v-else-if="l.category === 'job' && l.salary"><span aria-hidden="true">💵</span> {{ l.salary }}</span>
            </div>
            <div v-if="l.description" class="desc">{{ cleanDescription(l.description) }}</div>
            <div v-if="l.tags.length" class="tags">
              <span v-for="t in l.tags" :key="t" class="tag">{{ t }}</span>
            </div>
            <div class="card-foot">
              <span class="close" v-html="footInfo(l)" />
              <span class="cta">{{ applyLabel(l) }} →</span>
            </div>
          </button>
          <div v-if="!filtered.length" class="empty">
            <h3>No listings match yet</h3>
            <p>Try clearing a filter — or post one to help the community.</p>
          </div>
        </div>

        <!-- PAGINATION (list view) -->
        <nav v-if="view === 'list' && pageCount > 1" class="pager" aria-label="Pagination">
          <button class="pg" :disabled="page === 1" @click="gotoPage(page - 1)">‹ Prev</button>
          <button
            v-for="(it, i) in pageItems" :key="i"
            class="pg num" :class="{ on: it === page, gap: it === '…' }"
            :disabled="it === '…'"
            @click="typeof it === 'number' && gotoPage(it)"
          >{{ it }}</button>
          <button class="pg" :disabled="page === pageCount" @click="gotoPage(page + 1)">Next ›</button>
        </nav>

        <!-- CALENDAR VIEW -->
        <div v-show="view === 'calendar'" class="calview" @click="onCalClick" v-html="calendarHtml" />
      </template>
    </div>

    <!-- BOTTOM CTA -->
    <section class="cta-wrap">
      <div class="cta-inner">
        <div class="cta-copy">
          <h2>Know of a course, job or event? Share it with the community.</h2>
          <p>Every listing is curated and hand-checked by the Passmed team — and it's completely free to post. Inquiries come straight to your inbox. Send us the details and we'll get it live, usually within a day.</p>
        </div>
        <div class="cta-actions">
          <button class="btn-primary" @click="openPost">Post a listing</button>
        </div>
      </div>
    </section>

    <!-- DETAIL MODAL -->
    <div class="overlay" :class="{ open: !!detail }" @click.self="closeDetail">
      <div v-if="detail" ref="detailModalEl" class="modal" role="dialog" aria-modal="true" aria-labelledby="opps-detail-title">
        <div class="m-head">
          <button class="m-x" aria-label="Close" @click="closeDetail">✕</button>
          <div class="m-id">
            <img v-if="logoOk(detail)" v-logo="detail.id" class="logo-img lg" :src="detail.logo" :alt="`${detail.org} logo`" referrerpolicy="no-referrer">
            <span v-else class="logo-tile lg" :class="detail.category">{{ initials(detail.org) }}</span>
            <span class="pill" :class="detail.category">{{ catLabel(detail.category) }}</span>
          </div>
          <h2 id="opps-detail-title">{{ detail.title }}</h2>
          <div class="org">{{ detail.org }}</div>
        </div>
        <div class="m-body">
          <div class="m-meta">
            <div><span class="k">Location</span><span class="v">{{ locationLabel(detail) }}</span></div>
            <div><span class="k">Format</span><span class="v">{{ detail.format || '—' }}</span></div>
            <div><span class="k">Type</span><span class="v">{{ detail.type || '—' }}</span></div>
            <template v-if="detail.category === 'job'">
              <div><span class="k">Closing</span><span class="v">{{ jobClosing(detail) }}</span></div>
              <div v-if="detail.salary"><span class="k">Salary</span><span class="v">{{ detail.salary }}</span></div>
            </template>
            <template v-else>
              <div><span class="k">Cost</span><span class="v">{{ detail.cost || '—' }}</span></div>
              <div style="grid-column:1/-1">
                <span class="k">Available dates</span>
                <span class="v">{{ detail.dates || 'Start any time (self-paced)' }}</span>
              </div>
            </template>
          </div>

          <template v-if="detail.category === 'job' && (detail.requiresCV || detail.requiresCover)">
            <h3>Applicants should send</h3>
            <div class="tags">
              <span v-if="detail.requiresCV" class="tag">CV / résumé</span>
              <span v-if="detail.requiresCover" class="tag">Cover letter</span>
            </div>
          </template>

          <h3>About this {{ catLabel(detail.category).toLowerCase() }}</h3>
          <p class="m-detail">{{ cleanDescription(detail.description) || 'No description provided.' }}</p>

          <template v-if="detail.tags.length">
            <h3>Tags</h3>
            <div class="tags"><span v-for="t in detail.tags" :key="t" class="tag">{{ t }}</span></div>
          </template>
        </div>
        <div class="m-foot">
          <a v-if="detail.link" class="btn-primary" :href="detail.link" target="_blank" rel="noopener">{{ applyLabel(detail) }} ↗</a>
          <a
            v-else-if="detail.enquiriesEmail" class="btn-primary"
            :href="`mailto:${detail.enquiriesEmail}?subject=${encodeURIComponent('Inquiry: ' + detail.title)}`"
          >Email to apply ↗</a>
          <button class="cta-outline dark" @click="closeDetail">Close</button>
          <span class="m-note">Curated by Passmed</span>
        </div>
      </div>
    </div>

    <!-- POST A LISTING MODAL -->
    <div class="overlay" :class="{ open: postOpen }" @click.self="closePost">
      <div v-if="postOpen" ref="postModalEl" class="modal" role="dialog" aria-modal="true" aria-labelledby="opps-post-title">
        <template v-if="!postSent">
          <div class="m-head">
            <button class="m-x" aria-label="Close" @click="closePost">✕</button>
            <h2 id="opps-post-title">Post a listing</h2>
            <div class="org">Free to post · we review and publish, usually within a day</div>
          </div>
          <div class="m-body">
            <div class="post-as" :class="isLoggedIn ? 'member' : 'guest'">
              <span class="pa-icon" aria-hidden="true">{{ isLoggedIn ? '✓' : '👤' }}</span>
              <span v-if="isLoggedIn">Posting as <b>{{ user?.name || 'your account' }}</b> — we'll confirm to your email below.</span>
              <span v-else>Posting as a <b>guest</b> — leave your email below so we can confirm once it's live.</span>
            </div>

            <div class="form">
              <div class="fld">
                <label for="pl-type">Listing type</label>
                <select id="pl-type" v-model="form.type">
                  <option value="course">Course</option>
                  <option value="job">Job</option>
                  <option value="event">Event</option>
                </select>
              </div>
              <div class="fld">
                <label for="pl-format">Format</label>
                <select id="pl-format" v-model="form.format"><option>On-site</option><option>Remote</option><option>Hybrid</option></select>
              </div>
              <div class="fld full"><label for="pl-title">Title</label><input id="pl-title" v-model="form.title" aria-required="true" placeholder="e.g. ACLS Certification — 1-Day Provider Course"></div>
              <div class="fld full"><label for="pl-org">Organization</label><input id="pl-org" v-model="form.org" aria-required="true" placeholder="Hospital, school or provider"></div>
              <div class="fld">
                <label for="pl-country">Country</label>
                <select id="pl-country" v-model="form.country" aria-required="true" @change="form.city = ''">
                  <option value="" disabled>Select a country</option>
                  <option v-for="c in postCountries" :key="c" :value="c">{{ c }}</option>
                </select>
              </div>
              <div class="fld">
                <label for="pl-city">City</label>
                <select id="pl-city" v-model="form.city" :disabled="!form.country || form.country === 'Remote / Online'">
                  <option value="" disabled>{{ form.country === 'Remote / Online' ? 'Online — no city' : 'Select a city' }}</option>
                  <option v-for="c in cityOptions" :key="c" :value="c">{{ c }}</option>
                  <option v-if="cityOptions.length" value="Other">Other / elsewhere</option>
                </select>
              </div>
              <div class="fld full"><label for="pl-enq">Where should inquiries go? <span class="opt">(optional)</span></label><input id="pl-enq" v-model="form.enquiriesEmail" placeholder="poster@example.com"></div>

              <!-- non-job: cost + available dates -->
              <template v-if="form.type !== 'job'">
                <div class="fld"><label for="pl-cost">Cost <span class="opt">(optional)</span></label><input id="pl-cost" v-model="form.cost" placeholder="e.g. Free or $249"></div>
                <div class="fld full">
                  <label id="pl-dates-label">Available date(s) <span class="opt">(optional)</span></label>
                  <div class="daterow" role="group" aria-labelledby="pl-dates-label">
                    <input v-model="newStart" type="date" aria-label="Start date">
                    <span class="dto">to</span>
                    <input v-model="newEnd" type="date" aria-label="End date (optional)">
                    <button type="button" class="add-date" @click="addDate">Add</button>
                  </div>
                  <div v-if="dateRanges.length" class="dchips">
                    <span v-for="(r, i) in dateRanges" :key="i" class="dchip">{{ r.label }}<button type="button" :aria-label="`Remove ${r.label}`" @click="removeDate(i)">✕</button></span>
                  </div>
                  <div class="hint">Add a single day (leave “to” blank) or a range. Add as many sessions as you need.</div>
                </div>
              </template>

              <!-- job: closing date + requirements -->
              <template v-else>
                <div class="fld full">
                  <label for="pl-closing">Closing date</label>
                  <label class="chk" style="margin-bottom:8px"><input v-model="form.rolling" type="checkbox"> Rolling — accept applications until filled</label>
                  <input id="pl-closing" v-model="form.closing" type="date" :disabled="form.rolling">
                </div>
                <div class="toggle-row">
                  <div class="tr-head">What should applicants send?</div>
                  <label class="chk"><input v-model="form.requireCV" type="checkbox"> Require a <b>CV / résumé</b></label>
                  <label class="chk"><input v-model="form.requireCover" type="checkbox"> Require a <b>cover letter</b></label>
                </div>
              </template>

              <div class="fld full"><label for="pl-desc">Description</label><textarea id="pl-desc" v-model="form.description" placeholder="A couple of sentences on what it is and who it's for…" /></div>
              <div class="fld full"><label for="pl-link">Link <span class="opt">(optional)</span></label><input id="pl-link" v-model="form.link" placeholder="https://…"></div>
              <div class="fld full"><label for="pl-email">Your email (so we can confirm)</label><input id="pl-email" v-model="form.submitterEmail" type="email" aria-required="true" :aria-describedby="postErr ? 'pl-err' : undefined" placeholder="you@example.com"></div>

              <!-- honeypot: real users never see or fill this -->
              <input v-model="form.hp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp">

              <div class="fld full"><TurnstileWidget ref="turnstileRef" v-model="turnstileToken" /></div>

              <div v-if="postErr" id="pl-err" class="fld full form-err" role="alert">{{ postErr }}</div>
            </div>
          </div>
          <div class="m-foot">
            <button class="btn-primary" :disabled="posting" @click="submitPost">{{ posting ? 'Submitting…' : 'Submit for review' }}</button>
            <button class="cta-outline dark" @click="closePost">Cancel</button>
          </div>
        </template>

        <template v-else>
          <div class="m-head">
            <button class="m-x" aria-label="Close" @click="closePost">✕</button>
            <h2 id="opps-post-title">Post a listing</h2>
          </div>
          <div class="thanks">
            <div class="thanks-check">✓</div>
            <h3>Thank you — we've got it.</h3>
            <p>Your listing will be reviewed by the Passmed team and, once approved, published to the board — usually within a day. Inquiries will land straight in the inbox you gave us.</p>
          </div>
          <div class="m-foot"><button class="btn-primary" @click="closePost">Done</button></div>
        </template>
      </div>
    </div>
  </div>
</template>

<!--
  Non-scoped on purpose: the calendar is rendered with v-html and scoped CSS can't
  reach it. Everything is namespaced under .opps (variables included) so it stays
  contained. Site chrome (header/footer) comes from the default layout.
-->
<style>
.opps {
  --teal:#06b6d4; --teal-mid:#0891b2; --teal-light:#e0f9fd; --teal-pale:#f0feff; --teal-border:#67e8f9;
  --amber:#d97706; --amber-pale:#fffbeb; --yellow-pale:#fefce8;
  --navy:#0b3d5c; --navy-pale:#e9eff4;
  --exam:#7c3aed; --exam-pale:#f3edfe;
  --ink:#0f1f2e; --ink-mid:#374f65; --ink-dim:#7a95ad;
  --border:#e2edf4; --border-hi:#c8dce8; --surface:#f7fbfd; --surface-hi:#eef6fa; --white:#fff;
  --shadow-sm:0 1px 4px rgba(6,182,212,.1),0 2px 14px rgba(0,0,0,.06);
  --shadow:0 4px 22px rgba(6,182,212,.13),0 10px 36px rgba(0,0,0,.07);
  --shadow-lg:0 14px 52px rgba(6,182,212,.16),0 28px 72px rgba(0,0,0,.09);
  --shadow-teal:0 8px 32px rgba(6,182,212,.38);
  --r:14px; --r-lg:22px; --r-xl:32px;
  color:var(--ink); background:var(--white); line-height:1.5; -webkit-font-smoothing:antialiased;
}
.opps *{box-sizing:border-box}
.opps a{color:inherit;text-decoration:none}

/* category accents */
.opps .card.job,.opps .cv-bar.job{--accent:var(--teal)}
.opps .card.course{--accent:var(--amber)} .opps .card.event{--accent:var(--navy)} .opps .card.exam{--accent:var(--exam)}

/* hero */
.opps .ob-hero{padding:60px 5% 38px;background:var(--surface);border-bottom:1px solid var(--border);position:relative;overflow:hidden}
.opps .ob-hero::before{content:"";position:absolute;inset:0;background-image:radial-gradient(circle,#67e8f9 1px,transparent 1px);background-size:30px 30px;opacity:.18;-webkit-mask-image:radial-gradient(ellipse 60% 80% at 85% 40%,#000 10%,transparent 75%);mask-image:radial-gradient(ellipse 60% 80% at 85% 40%,#000 10%,transparent 75%)}
.opps .ob-hero-inner{max-width:1100px;margin:0 auto;position:relative;z-index:1}
.opps .eyebrow{display:inline-flex;align-items:center;gap:7px;color:var(--ink);font-weight:800;font-size:0.67rem;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:18px}
.opps .eyebrow::before{content:"";width:14px;height:2px;background:currentColor;border-radius:1px;flex-shrink:0}
.opps .ob-hero h1{font-family:'Figtree',sans-serif;font-size:clamp(2.2rem,3.5vw,3.2rem);line-height:1.05;letter-spacing:-1.2px;font-weight:800;max-width:820px}
.opps .ob-hero h1 span{color:var(--teal)}
.opps .sub{margin-top:16px;font-size:18px;color:var(--ink-mid);max-width:640px}
.opps .searchbar{margin-top:26px;background:#fff;border:1px solid var(--border-hi);border-radius:14px;box-shadow:var(--shadow-sm);display:flex;align-items:center;gap:10px;padding:10px 16px;max-width:680px}
.opps .searchbar input{flex:1;border:none;outline:none;font:inherit;font-size:16px;color:var(--ink);background:transparent}
.opps .searchbar input::placeholder{color:var(--ink-dim)}
.opps .tabs{margin-top:22px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.opps .tab{display:inline-flex;align-items:center;gap:8px;cursor:pointer;background:#fff;border:1px solid var(--border-hi);color:var(--ink-mid);font:inherit;font-weight:600;font-size:14px;padding:9px 16px;border-radius:100px;transition:.15s}
.opps .tab:hover{border-color:var(--teal-border)}
.opps .tab.active{background:var(--ink);border-color:var(--ink);color:#fff}
.opps .count{background:var(--surface-hi);color:var(--ink-dim);font-size:12px;font-weight:700;padding:1px 8px;border-radius:100px}
.opps .tab.active .count{background:rgba(255,255,255,.18);color:#fff}
.opps .tab-spacer{flex:1}
.opps .suggest-btn{background:var(--teal);color:#fff;border:none;cursor:pointer;font:inherit;font-weight:700;font-size:14px;padding:10px 18px;border-radius:10px;box-shadow:0 2px 0 rgba(8,145,178,.4);transition:.2s}
.opps .suggest-btn:hover{filter:brightness(.96);transform:translateY(-2px)}

/* board */
.opps .wrap{max-width:1100px;margin:0 auto;padding:40px 5% 80px}
.opps .toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:22px}
.opps select.sel{appearance:none;font:inherit;font-size:14px;font-weight:500;color:var(--ink-mid);background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a95ad' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 12px center;border:1px solid var(--border-hi);border-radius:10px;padding:9px 34px 9px 14px;cursor:pointer}
.opps select.sel:hover{border-color:var(--teal-border)}
.opps .result{margin-left:auto;color:var(--ink-dim);font-size:14px;font-weight:500}
.opps .state{color:var(--ink-dim);font-size:15px;padding:30px 0}
.opps .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(330px,100%),1fr));gap:18px;min-width:0}
.opps .card{text-align:left;font:inherit;cursor:pointer;background:#fff;border:1px solid var(--border);border-radius:var(--r-lg);padding:22px;display:flex;flex-direction:column;gap:14px;transition:.16s;min-width:0}
/* long unbreakable tokens (URLs, long words) must wrap, not force the card wide */
.opps .card .title,.opps .card .org,.opps .card .desc,.opps .card .tag,.opps .card .meta span,.opps .card .close,.opps .m-detail,.opps .m-meta .v{overflow-wrap:anywhere}
.opps .card:hover{transform:translateY(-3px);box-shadow:var(--shadow);border-color:var(--teal-border)}
.opps .card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.opps .card-id{display:flex;align-items:center;gap:12px}
.opps .logo-tile{width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:#fff;flex-shrink:0}
.opps .logo-tile.lg{width:52px;height:52px;font-size:19px}
.opps .logo-tile.job{background:var(--teal)} .opps .logo-tile.course{background:var(--amber)} .opps .logo-tile.event{background:var(--navy)} .opps .logo-tile.exam{background:var(--exam)}
.opps .logo-img{width:46px;height:46px;border-radius:12px;object-fit:contain;padding:5px;background:#fff;border:1px solid var(--border);flex-shrink:0}
.opps .logo-img.lg{width:52px;height:52px}
.opps .pill{display:inline-flex;align-items:center;font-size:12px;font-weight:700;padding:5px 10px;border-radius:8px}
.opps .pill.job{background:var(--teal-light);color:var(--teal-mid)} .opps .pill.course{background:var(--amber-pale);color:var(--amber)} .opps .pill.event{background:var(--navy-pale);color:var(--navy)} .opps .pill.exam{background:var(--exam-pale);color:var(--exam)}
.opps .badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.opps .badge{font-size:11px;font-weight:700;padding:4px 9px;border-radius:7px;text-transform:uppercase;letter-spacing:.03em}
.opps .badge.free{background:var(--teal-light);color:var(--teal-mid)}
.opps .title{font-size:17px;font-weight:700;letter-spacing:-.01em;line-height:1.28}
.opps .org{color:var(--ink-mid);font-size:14px;font-weight:500;margin-top:2px}
.opps .meta{display:flex;flex-wrap:wrap;gap:14px;color:var(--ink-mid);font-size:13.5px}
.opps .desc{color:var(--ink-mid);font-size:14px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.opps .tags{display:flex;flex-wrap:wrap;gap:7px}
.opps .tag{font-size:12px;font-weight:600;color:var(--ink-mid);background:var(--surface);border:1px solid var(--border);padding:4px 10px;border-radius:7px}
.opps .card-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:2px;padding-top:14px;border-top:1px solid var(--border)}
.opps .close{font-size:13px;color:var(--ink-dim);font-weight:500}
.opps .close b{color:var(--ink-mid)}
.opps .cta{font-size:13.5px;font-weight:700;color:var(--teal)}
.opps .empty{grid-column:1/-1;text-align:center;padding:70px 20px;color:var(--ink-dim)}
.opps .empty h3{color:var(--ink-mid);font-size:18px;margin-bottom:6px}

/* bottom cta */
.opps .cta-wrap{padding:0 5% 80px}
.opps .cta-inner{max-width:1100px;margin:0 auto;background:var(--ink);border-radius:var(--r-xl);padding:40px 44px;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:30px;flex-wrap:wrap;position:relative;overflow:hidden}
.opps .cta-inner::before{content:"";position:absolute;right:-60px;top:-60px;width:260px;height:260px;background:radial-gradient(circle,rgba(6,182,212,.45),transparent 70%)}
.opps .cta-copy{position:relative;z-index:1;max-width:580px}
.opps .cta-copy h2{font-size:26px;letter-spacing:-.02em;line-height:1.2;color:#fff}
.opps .cta-copy p{color:rgba(255,255,255,.72);margin-top:10px;font-size:15.5px}
.opps .cta-actions{position:relative;z-index:1;display:flex;gap:12px;flex-wrap:wrap}

/* shared buttons */
.opps .btn-primary{background:var(--teal);color:#fff!important;font:inherit;font-weight:700;border-radius:9px;padding:11px 20px;transition:.2s;box-shadow:0 2px 0 rgba(8,145,178,.5);border:none;cursor:pointer;font-size:14px;display:inline-flex;align-items:center;justify-content:center}
.opps .btn-primary:hover{background:var(--teal-mid);box-shadow:var(--shadow-teal);transform:translateY(-2px)}
.opps .btn-primary:disabled{opacity:.6;cursor:default;transform:none;box-shadow:none}
.opps .cta-outline{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.3);font:inherit;font-weight:700;font-size:14px;padding:10px 18px;border-radius:10px;cursor:pointer;transition:.2s}
.opps .cta-outline:hover{border-color:#fff}
.opps .cta-outline.dark{color:var(--ink-mid);border-color:var(--border-hi)}
.opps .cta-outline.dark:hover{border-color:var(--teal);color:var(--teal)}

/* modal */
.opps .overlay{position:fixed;inset:0;background:rgba(15,31,46,.5);backdrop-filter:blur(3px);z-index:200;display:none;align-items:center;justify-content:center;padding:24px}
.opps .overlay.open{display:flex}
.opps .modal{background:#fff;border-radius:var(--r-lg);max-width:640px;width:100%;max-height:90vh;box-shadow:var(--shadow-lg);animation:oppspop .2s ease;display:flex;flex-direction:column;overflow:hidden}
@keyframes oppspop{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}
.opps .m-head{padding:26px 28px 22px;border-bottom:1px solid var(--border);position:relative;flex-shrink:0}
.opps .m-x{position:absolute;top:20px;right:22px;width:34px;height:34px;border-radius:9px;border:1px solid var(--border);background:#fff;cursor:pointer;font-size:16px;color:var(--ink-mid)}
.opps .m-x:hover{background:var(--surface)}
.opps .m-id{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.opps .m-head h2{font-size:22px;letter-spacing:-.02em;line-height:1.25;padding-right:40px}
.opps .m-body{padding:24px 28px;overflow-y:auto;flex:1 1 auto;min-height:0}
.opps .m-meta{display:grid;grid-template-columns:1fr 1fr;gap:14px 18px;margin-bottom:22px}
.opps .m-meta .k{display:block;font-size:12px;font-weight:700;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.04em}
.opps .m-meta .v{display:block;font-size:15px;font-weight:600;color:var(--ink);margin-top:3px}
.opps .m-body h3{font-size:14px;font-weight:700;margin:18px 0 8px}
.opps .m-detail{color:var(--ink-mid);font-size:15px;line-height:1.6;white-space:pre-line}
.opps .m-foot{padding:20px 28px;border-top:1px solid var(--border);display:flex;gap:12px;align-items:center;background:var(--surface);flex-shrink:0;flex-wrap:wrap}
.opps .m-note{margin-left:auto;font-size:13px;color:var(--ink-dim)}

/* post-as banner */
.opps .post-as{display:flex;align-items:center;gap:10px;border-radius:12px;padding:12px 14px;margin-bottom:18px;font-size:13.5px}
.opps .post-as.guest{background:var(--surface);border:1px solid var(--border);color:var(--ink-mid)}
.opps .post-as.member{background:var(--teal-pale);border:1px solid var(--teal-light);color:var(--teal-mid)}
.opps .pa-icon{width:32px;height:32px;border-radius:50%;background:var(--surface-hi);display:flex;align-items:center;justify-content:center;flex-shrink:0}

/* form */
.opps .form{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.opps .form .full{grid-column:1/-1}
.opps .fld label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
.opps .fld .opt{color:var(--ink-dim);font-weight:500}
.opps .fld input,.opps .fld textarea,.opps .fld select{width:100%;font:inherit;font-size:14.5px;color:var(--ink);border:1px solid var(--border-hi);border-radius:10px;padding:10px 12px;outline:none;background:#fff}
.opps .fld input:focus,.opps .fld textarea:focus,.opps .fld select:focus{border-color:var(--teal)}
.opps .fld input:disabled{background:var(--surface);color:var(--ink-dim)}
.opps .fld textarea{resize:vertical;min-height:88px}
.opps .daterow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.opps .daterow input{flex:1;min-width:130px}
.opps .daterow .dto{color:var(--ink-dim);font-size:13px}
.opps .add-date{background:var(--surface-hi);border:1px solid var(--border-hi);border-radius:10px;font:inherit;font-weight:600;font-size:13px;color:var(--ink-mid);padding:9px 16px;cursor:pointer}
.opps .add-date:hover{border-color:var(--teal-border);color:var(--teal-mid)}
.opps .dchips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.opps .dchip{display:inline-flex;align-items:center;gap:8px;background:var(--teal-light);color:var(--teal-mid);font-size:13px;font-weight:600;border-radius:8px;padding:6px 10px}
.opps .dchip button{border:none;background:none;color:var(--teal-mid);cursor:pointer;font-size:15px;line-height:1;padding:0}
.opps .hint{font-size:12.5px;color:var(--ink-dim);margin-top:8px}
.opps .toggle-row{grid-column:1/-1;display:flex;flex-direction:column;gap:10px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px}
.opps .toggle-row .tr-head{font-size:13px;font-weight:700;color:var(--ink)}
.opps .chk{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:500;color:var(--ink-mid);cursor:pointer}
.opps .chk input{width:auto;accent-color:var(--teal)}
.opps .hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.opps .form-err{color:#b91c1c;font-size:13.5px;font-weight:600}

/* thanks */
.opps .thanks{padding:44px 28px;text-align:center;overflow-y:auto;flex:1 1 auto;min-height:0}
.opps .thanks-check{width:56px;height:56px;border-radius:50%;background:var(--teal-light);color:var(--teal-mid);font-size:26px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 18px}
.opps .thanks h3{font-size:20px;margin-bottom:8px}
.opps .thanks p{color:var(--ink-mid);font-size:15px;max-width:420px;margin:0 auto}

/* calendar view */
.opps .viewseg{display:inline-flex;background:var(--surface-hi);border-radius:10px;padding:3px;gap:3px}
.opps .viewseg button{border:none;background:transparent;font:inherit;font-size:13px;font-weight:600;color:var(--ink-mid);padding:7px 13px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.opps .viewseg button.on{background:#fff;color:var(--ink);box-shadow:var(--shadow-sm)}
.opps .cv{border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;background:#fff}
.opps .cv-head{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.opps .cv-mo{font-size:17px;font-weight:800;letter-spacing:-.01em;min-width:172px}
.opps .cv-nav{width:32px;height:32px;border:1px solid var(--border-hi);border-radius:9px;background:#fff;cursor:pointer;color:var(--ink-mid);font-size:16px}
.opps .cv-nav:hover{border-color:var(--teal-border);color:var(--teal-mid)}
.opps .cv-today{border:1px solid var(--border-hi);background:#fff;border-radius:9px;font:inherit;font-size:13px;font-weight:600;color:var(--ink-mid);padding:7px 12px;cursor:pointer}
.opps .cv-today:hover{border-color:var(--teal-border);color:var(--teal-mid)}
.opps .cv-legend{margin-left:auto;display:flex;gap:14px;flex-wrap:wrap;font-size:12px;font-weight:600;color:var(--ink-mid)}
.opps .cv-legend span{display:inline-flex;align-items:center;gap:6px}
.opps .cv-dot{width:9px;height:9px;border-radius:3px;display:inline-block}
.opps .cv-scroll{overflow-x:auto}
.opps .cv-dowrow{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
.opps .cv-dow{padding:8px 6px;text-align:center;font-size:11px;font-weight:700;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);background:var(--surface)}
.opps .cv-dnum{font-size:12.5px;font-weight:700;color:var(--ink-mid);min-width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:7px;padding:0 4px}
/* .cvw-bg (the day-number cells) and .cvw-bars (the event bars) are two
   independent 7-column grids stacked into the SAME cell of .cvw via
   grid-area:1/1, rather than .cvw-bars being position:absolute+overflow:
   hidden over a fixed-height row. That old approach clipped any day with
   more events than the 118px row could show, with no way to reveal the
   rest (audit: mobile calendar cards cut off, unscrollable). Grid rows
   size to their tallest item by default, so the shared row now genuinely
   grows to fit however many event bars a day has — days pack in tighter
   just don't need the extra height. */
.opps .cvw{display:grid}
.opps .cvw-bg{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-area:1/1}
.opps .cvd{min-height:118px;border-bottom:1px solid var(--border);border-right:1px solid var(--border);padding:6px}
.opps .cvd:nth-child(7n){border-right:none}
.opps .cvd.pad{background:var(--surface)}
.opps .cvd.today .cv-dnum{background:var(--teal);color:#fff}
.opps .cvw-bars{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-auto-rows:23px;row-gap:4px;padding:32px 0 6px;pointer-events:none;grid-area:1/1}
.opps .cv-bar{pointer-events:auto;margin:0 3px;border:none;text-align:left;font:inherit;font-size:11.5px;font-weight:600;line-height:1;height:22px;display:flex;align-items:center;padding:0 8px;border-radius:6px;cursor:pointer;white-space:nowrap;overflow:hidden;color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.12)}
.opps .cv-bar.course{background:var(--amber)} .opps .cv-bar.event{background:var(--navy)} .opps .cv-bar.exam{background:var(--exam)}
.opps .cv-bar.cont-l{border-top-left-radius:0;border-bottom-left-radius:0;margin-left:0}
.opps .cv-bar.cont-r{border-top-right-radius:0;border-bottom-right-radius:0;margin-right:0}
.opps .cv-bar:hover{filter:brightness(.94)}
.opps .cv-foot{padding:12px 18px;border-top:1px solid var(--border);font-size:13px;color:var(--ink-dim)}
@media(max-width:640px){.opps .cv-dowrow,.opps .cvw-bg,.opps .cvw-bars{min-width:620px}}

/* pagination */
.opps .pager{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;margin-top:28px}
.opps .pg{min-width:38px;height:38px;padding:0 12px;border:1px solid var(--border-hi);background:#fff;border-radius:10px;font:inherit;font-size:14px;font-weight:600;color:var(--ink-mid);cursor:pointer;transition:.15s}
.opps .pg:hover:not(:disabled){border-color:var(--teal-border);color:var(--teal-mid)}
.opps .pg.on{background:var(--ink);border-color:var(--ink);color:#fff}
.opps .pg.gap{border:none;background:none;cursor:default;min-width:20px;padding:0}
.opps .pg:disabled{opacity:.45;cursor:default}

@media(max-width:768px){
  .opps .m-meta,.opps .form{grid-template-columns:1fr}
  .opps .cta-inner{padding:30px 24px}
  .opps .wrap{padding:28px 5% 64px}
  .opps .toolbar .result{margin-left:0;width:100%;order:5}
  .opps select.sel{flex:1;min-width:120px}
}
@media(max-width:560px){
  .opps .ob-hero{padding:40px 5% 28px}
  .opps .ob-hero h1{font-size:clamp(1.9rem,7vw,2.4rem)}
  .opps .sub{font-size:16px}
  .opps .searchbar{margin-top:20px}
  .opps .tabs{gap:6px;margin-top:18px}
  .opps .tab{font-size:13px;padding:8px 12px}
  .opps .suggest-btn{width:100%;order:9;margin-top:4px}
  .opps .tab-spacer{display:none}
  .opps .grid{grid-template-columns:1fr;gap:14px}
  .opps .card{padding:18px}
  .opps .meta{gap:10px;font-size:13px}
  .opps .overlay{padding:0;align-items:flex-end}
  .opps .modal{max-width:none;max-height:94vh;border-radius:var(--r-lg) var(--r-lg) 0 0}
  .opps .m-head,.opps .m-body,.opps .m-foot{padding-left:18px;padding-right:18px}
  .opps .m-foot{flex-direction:column;align-items:stretch}
  .opps .m-foot .btn-primary,.opps .m-foot .cta-outline{width:100%}
  .opps .m-note{margin:6px 0 0;text-align:center}
  .opps .cta-inner{padding:26px 20px}
  .opps .cta-copy h2{font-size:22px}
  .opps .cta-actions{width:100%}
  .opps .cta-actions .btn-primary{width:100%}
}
</style>
