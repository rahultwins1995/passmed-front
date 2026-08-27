#!/usr/bin/env node
/*
 * One-off: populate the Passmed UK CMS (pages + exams) via the admin API.
 * Self-contained — reads the two payload JSON files next to it. Safe to delete
 * after the UK content is seeded. Same runner as tools/sa-populate; only the
 * env-var prefix (UK_) and default admin base differ.
 *
 * Endpoints (Laravel admin API, same one PM-Admin-UK uses):
 *   POST /login                      → { token }
 *   POST /pages           (list)     GET /pages/details/{id}
 *   POST /pages/add | /pages/update/{id}
 *   POST /exams/list                 POST /exams/add | /exams/update/{id}
 *   POST /exams-categories/list | /exams-categories/add
 * Auth: Authorization: Bearer <token>
 *
 * Env:
 *   UK_API_BASE   default https://pm-admin-uk.vercel.app/api  (the admin's /api proxy)
 *   UK_EMAIL / UK_PASSWORD   admin login (or UK_TOKEN to skip login)
 *   UK_TOKEN      admin bearer token (overrides login)
 *   DRY_RUN       '1' (default) = no writes. '0' = live.
 *   ONLY          'pages' | 'exams' | 'faqs' | 'all' (default 'all')
 *   LIMIT         only first N of each type (staged rollout)
 *   SLUG_STYLE    'bare' (default; 'pricing','home' — matches the frontend's getpage/{slug}) | 'path' ('/pricing', '/')
 *   UPSERT        '1' (default) look up by slug and update if present, else add. '0' = always add.
 *
 * Examples:
 *   node populate.mjs                                              # offline dry-run
 *   UK_EMAIL=… UK_PASSWORD=… DRY_RUN=0 ONLY=pages LIMIT=1 node populate.mjs   # one page, live
 *   UK_EMAIL=… UK_PASSWORD=… DRY_RUN=0 node populate.mjs                      # everything
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = (process.env.UK_API_BASE || 'https://pm-admin-uk.vercel.app/api').replace(/\/+$/, '')
let TOKEN = process.env.UK_TOKEN || ''
const EMAIL = process.env.UK_EMAIL || ''
const PASSWORD = process.env.UK_PASSWORD || ''
const DRY = process.env.DRY_RUN !== '0'
const ONLY = process.env.ONLY || 'all'
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity
const SLUG_STYLE = process.env.SLUG_STYLE || 'bare'
const UPSERT = process.env.UPSERT !== '0'

const log = (...a) => console.log(...a)
const die = m => { console.error('✗ ' + m); process.exit(1) }

async function apiCall (method, endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) throw new Error(`${method} ${endpoint} → ${res.status}: ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`)
  return data
}
const rows = r => r?.data?.data || r?.data || r?.rows || []

function pageSlug (raw) {
  if (SLUG_STYLE === 'bare') return raw === '/' ? 'home' : raw.replace(/^\//, '')
  return raw
}

async function login () {
  if (TOKEN) return
  if (!EMAIL || !PASSWORD) die('Set UK_TOKEN, or UK_EMAIL + UK_PASSWORD')
  log('▶ Logging in as ' + EMAIL)
  const res = await apiCall('POST', '/login', { email: EMAIL, password: PASSWORD, remember: false })
  TOKEN = res?.token ?? res?.data?.token
  if (!TOKEN) die('login returned no token: ' + JSON.stringify(res).slice(0, 200))
  log('  ✓ authenticated')
}

async function findId (listEndpoint, slug) {
  if (!UPSERT) return null
  try {
    const res = await apiCall('POST', listEndpoint, { search: slug, page: 1, limit: 50 })
    const hit = rows(res).find(x => String(x.slug) === String(slug))
    return hit?.id ?? null
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
  // The list endpoint only returns ACTIVE (status:1) categories.
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
    // Must send status:1 — the API defaults new categories to status:0, which the
    // list endpoint hides, so they'd be invisible and re-created on every run. The
    // add response carries no id ({status,msg} only), so re-list to resolve it.
    await apiCall('POST', '/exams-categories/add', { name, slug: catSlug(name), status: 1 })
    existing = await listCategories()
    map[name] = existing[key]
    log(`  + category "${name}" → id ${map[name] ?? '?'}`)
  }
  return map
}

// Exams are matched by NAME, not slug: the /exams/add endpoint IGNORES the
// slug field and derives the slug from the name (e.g. "MRCP Part 1" → "mrcp-part-1"),
// so a slug lookup never matches what was stored and every run would create a
// duplicate. The name is stable, so we match on it. Crucially, /exams/update DOES
// respect an explicit slug — so after an add we immediately update by the new id to
// force the canonical slug (the sheet's "Exam Key (slug)"), which the frontend and
// resources-uk.ts links depend on.
async function findExamIdByName (name) {
  if (!UPSERT) return null
  try {
    const res = await apiCall('POST', '/exams/list', { search: name, page: 1, limit: 100 })
    const key = String(name).trim().toLowerCase()
    const hit = rows(res).find(x => String(x.name).trim().toLowerCase() === key)
    return hit?.id ?? null
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
      if (!id) {
        // add ignores slug (derives from name); resolve the new id by name…
        await apiCall('POST', '/exams/add', payload)
        id = await findExamIdByName(payload.name)
      }
      // …then update to force the canonical slug (update respects it).
      let note = 'no id — slug not enforced'
      if (id) { await apiCall('POST', `/exams/update/${id}`, payload); note = `id ${id}` }
      log(`  ✓ ${payload.slug} → ${note}`)
    } catch (err) { log(`  ✗ ${payload.slug}: ${err.message}`) }
  }
}

async function upsertFaqs (faqs) {
  log("\n▶ FAQs")
  const existing = {}
  if (UPSERT) {
    try {
      const res = await apiCall("POST", "/faqs", { search: "", page: 1, limit: 1000 })
      for (const f of rows(res)) existing[String(f.question).trim()] = f.id
    } catch {}
  }
  for (const f of faqs) {
    try {
      const id = existing[String(f.question).trim()]
      const r = id ? await apiCall("POST", `/faqs/update/${id}`, f) : await apiCall("POST", "/faqs/add", f)
      log(`  ✓ [${f.type}] ${f.question.slice(0, 48)} ${id ? "(updated " + id + ")" : "(added)"}`)
    } catch (e) { log(`  ✗ ${f.question.slice(0, 48)}: ${e.message}`) }
  }
}

async function main () {
  const pages = JSON.parse(fs.readFileSync(path.join(HERE, 'pages.payload.json'), 'utf8')).slice(0, LIMIT)
  const exams = JSON.parse(fs.readFileSync(path.join(HERE, 'exams.payload.json'), 'utf8')).slice(0, LIMIT)
  const faqsPath = path.join(HERE, 'faqs.payload.json')
  const faqs = fs.existsSync(faqsPath) ? JSON.parse(fs.readFileSync(faqsPath, 'utf8')).slice(0, LIMIT) : []
  log(`Loaded ${pages.length} page(s), ${exams.length} exam(s), ${faqs.length} faq(s). API=${API} DRY_RUN=${DRY} ONLY=${ONLY} UPSERT=${UPSERT} SLUG_STYLE=${SLUG_STYLE}`)

  if (DRY) {
    log('\nDRY_RUN — no writes. Pages: ' + pages.map(p => pageSlug(p.slug)).join(', '))
    log('Exams: ' + exams.map(e => `${e.slug}[${e._category}] £${e.price_1}/${e.price_12}`).join(', '))
    log('FAQs: ' + faqs.length + ' item(s) — ' + [...new Set(faqs.map(f => f.type))].join(', '))
    log('\nSet DRY_RUN=0 with UK_EMAIL + UK_PASSWORD to write.')
    return
  }
  await login()
  if (ONLY === 'pages' || ONLY === 'all') await upsertPages(pages)
  if (ONLY === 'exams' || ONLY === 'all') await upsertExams(exams)
  if (ONLY === 'faqs' || ONLY === 'all') await upsertFaqs(faqs)
  log('\nDone.')
}
main().catch(e => die(e.message))
