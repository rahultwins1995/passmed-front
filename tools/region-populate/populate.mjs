#!/usr/bin/env node
/*
 * Generalized CMS seeder for any Passmed region (au | ca | ph | uk | sa | us).
 * Reads payloads from ../<REGION>-populate/{pages,exams,faqs}.payload.json and
 * seeds that region's admin API. Same logic as tools/uk-populate/populate.mjs
 * (pages by slug; exams matched by NAME then updated to force the canonical
 * slug, since /exams/add derives the slug from the name; FAQs by question,
 * portal_type=home). Idempotent.
 *
 * Env:
 *   REGION      required: au | ca | ph | uk | sa | us
 *   API_BASE    override (default https://pm-admin-<REGION>.vercel.app/api)
 *   EMAIL/PASSWORD   admin login (default admin-<REGION>@gmail.com / admin@123456)
 *   TOKEN       bearer to skip login
 *   DRY_RUN     '1' (default) = no writes. '0' = live.
 *   ONLY        'pages' | 'exams' | 'faqs' | 'all' (default 'all')
 *   LIMIT       first N of each type (staged rollout)
 *   UPSERT      '1' (default) match+update; '0' always add.
 *
 * Examples:
 *   REGION=au node populate.mjs                                   # dry-run
 *   REGION=au DRY_RUN=0 ONLY=pages LIMIT=1 node populate.mjs      # one page, live
 *   REGION=au DRY_RUN=0 node populate.mjs                         # everything
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REGION = (process.env.REGION || '').toLowerCase()
if (!REGION) die('Set REGION=au|ca|ph|uk|sa|us')
const PAYDIR = path.join(HERE, '..', `${REGION}-populate`)
if (!fs.existsSync(PAYDIR)) die(`No payload dir: ${PAYDIR}`)

const API = (process.env.API_BASE || `https://pm-admin-${REGION}.vercel.app/api`).replace(/\/+$/, '')
let TOKEN = process.env.TOKEN || ''
const EMAIL = process.env.EMAIL || `admin-${REGION}@gmail.com`
const PASSWORD = process.env.PASSWORD || 'admin@123456'
const DRY = process.env.DRY_RUN !== '0'
const ONLY = process.env.ONLY || 'all'
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity
const SLUG_STYLE = process.env.SLUG_STYLE || 'bare'
const UPSERT = process.env.UPSERT !== '0'
const CUR = { au: 'A$', ca: 'C$', ph: '₱', uk: '£', sa: 'R', us: '$' }[REGION] || '$'

const log = (...a) => console.log(...a)
function die (m) { console.error('✗ ' + m); process.exit(1) }

async function apiCall (method, endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) throw new Error(`${method} ${endpoint} → ${res.status}: ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`)
  return data
}
const rows = r => r?.data?.data || r?.data || r?.rows || []
function pageSlug (raw) { return SLUG_STYLE === 'bare' ? (raw === '/' ? 'home' : raw.replace(/^\//, '')) : raw }

async function login () {
  if (TOKEN) return
  log('▶ Logging in as ' + EMAIL + ' @ ' + API)
  const res = await apiCall('POST', '/login', { email: EMAIL, password: PASSWORD, remember: false })
  TOKEN = res?.token ?? res?.data?.token
  if (!TOKEN) die('login returned no token: ' + JSON.stringify(res).slice(0, 200))
  log('  ✓ authenticated')
}

async function findId (listEndpoint, slug) {
  if (!UPSERT) return null
  try {
    const res = await apiCall('POST', listEndpoint, { search: slug, page: 1, limit: 50 })
    return rows(res).find(x => String(x.slug) === String(slug))?.id ?? null
  } catch { return null }
}

async function upsertPages (pages) {
  log('\n▶ Pages')
  for (const p of pages) {
    const payload = { ...p, slug: pageSlug(p.slug) }
    try {
      const id = await findId('/pages', payload.slug)
      const r = id ? await apiCall('POST', `/pages/update/${id}`, payload) : await apiCall('POST', '/pages/add', payload)
      log(`  ✓ ${payload.slug} ${id ? '(updated ' + id + ')' : '(created ' + (r?.data?.id ?? r?.id ?? '?') + ')'}`)
    } catch (e) { log(`  ✗ ${payload.slug}: ${e.message}`) }
  }
}

const catSlug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
async function listCategories () {
  const res = await apiCall('POST', '/exams-categories/list', { search: '', page: 1, limit: 500 })
  const byName = {}
  for (const c of rows(res)) byName[String(c.name).trim().toLowerCase()] = c.id
  return byName
}
async function resolveCategories (names) {
  let existing = await listCategories()
  const map = {}
  for (const name of names) {
    const key = name.trim().toLowerCase()
    if (existing[key]) { map[name] = existing[key]; continue }
    await apiCall('POST', '/exams-categories/add', { name, slug: catSlug(name), status: 1 })
    existing = await listCategories()
    map[name] = existing[key]
    log(`  + category "${name}" → id ${map[name] ?? '?'}`)
  }
  return map
}

// Exams: /exams/add ignores the slug (derives it from the name), so match on the
// stable NAME, then update — /exams/update DOES respect an explicit slug — to
// force the canonical slug. Idempotent, no duplicates.
async function findExamIdByName (name) {
  if (!UPSERT) return null
  try {
    const res = await apiCall('POST', '/exams/list', { search: name, page: 1, limit: 100 })
    const key = String(name).trim().toLowerCase()
    return rows(res).find(x => String(x.name).trim().toLowerCase() === key)?.id ?? null
  } catch { return null }
}
async function upsertExams (exams) {
  log('\n▶ Categories')
  const catMap = await resolveCategories([...new Set(exams.map(e => e._category))])
  log('\n▶ Exams')
  for (const e of exams) {
    const { _category, ...payload } = e
    payload.exam_category = String(catMap[_category] ?? '0')
    try {
      let id = await findExamIdByName(payload.name)
      if (!id) { await apiCall('POST', '/exams/add', payload); id = await findExamIdByName(payload.name) }
      let note = 'no id — slug not enforced'
      if (id) { await apiCall('POST', `/exams/update/${id}`, payload); note = `id ${id}` }
      log(`  ✓ ${payload.slug} → ${note}`)
    } catch (err) { log(`  ✗ ${payload.slug}: ${err.message}`) }
  }
}

async function upsertFaqs (faqs) {
  log('\n▶ FAQs (portal_type=home)')
  const existing = {}
  if (UPSERT) {
    try {
      const res = await apiCall('POST', '/faqs', { search: '', page: 1, limit: 1000, portal_type: 'home' })
      for (const f of rows(res)) existing[String(f.question).trim()] = f.id
    } catch {}
  }
  for (const f of faqs) {
    const payload = { ...f, portal_type: 'home' }
    try {
      const id = existing[String(f.question).trim()]
      id ? await apiCall('POST', `/faqs/update/${id}`, payload) : await apiCall('POST', '/faqs/add', payload)
      log(`  ✓ [${f.type}] ${f.question.slice(0, 48)} ${id ? '(updated ' + id + ')' : '(added)'}`)
    } catch (e) { log(`  ✗ ${f.question.slice(0, 48)}: ${e.message}`) }
  }
}

async function main () {
  const load = f => { const p = path.join(PAYDIR, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')).slice(0, LIMIT) : [] }
  const pages = load('pages.payload.json'), exams = load('exams.payload.json'), faqs = load('faqs.payload.json')
  log(`REGION=${REGION} Loaded ${pages.length} page(s), ${exams.length} exam(s), ${faqs.length} faq(s). API=${API} DRY_RUN=${DRY} ONLY=${ONLY}`)
  if (DRY) {
    log('\nDRY_RUN — no writes.')
    log('Pages: ' + pages.map(p => pageSlug(p.slug)).join(', '))
    log('Exams: ' + exams.map(e => `${e.slug}[${e._category}] ${CUR}${e.price_1 ?? '—'}/${e.price_3 ?? '—'}/${e.price_6 ?? '—'}/${e.price_12 ?? '—'}`).join(', '))
    log('FAQs: ' + faqs.length + ' — ' + [...new Set(faqs.map(f => f.type))].join(', '))
    return
  }
  await login()
  if (ONLY === 'pages' || ONLY === 'all') await upsertPages(pages)
  if (ONLY === 'exams' || ONLY === 'all') await upsertExams(exams)
  if (ONLY === 'faqs' || ONLY === 'all') await upsertFaqs(faqs)
  log('\nDone.')
}
main().catch(e => die(e.message))
