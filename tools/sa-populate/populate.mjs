#!/usr/bin/env node
/*
 * One-off: populate the Passmed SA CMS (pages + exams) via the admin API.
 * Self-contained — reads the two payload JSON files next to it. Safe to delete
 * after the SA content is seeded.
 *
 * Endpoints (Laravel admin API, same one PM-Admin-SA uses):
 *   POST /login                      → { token }
 *   POST /pages           (list)     GET /pages/details/{id}
 *   POST /pages/add | /pages/update/{id}
 *   POST /exams/list                 POST /exams/add | /exams/update/{id}
 *   POST /exams-categories/list | /exams-categories/add
 * Auth: Authorization: Bearer <token>
 *
 * Env:
 *   SA_API_BASE   default https://pm-admin-sa.vercel.app/api  (the admin's /api proxy)
 *   SA_EMAIL / SA_PASSWORD   admin login (or SA_TOKEN to skip login)
 *   SA_TOKEN      admin bearer token (overrides login)
 *   DRY_RUN       '1' (default) = no writes. '0' = live.
 *   ONLY          'pages' | 'exams' | 'faqs' | 'all' (default 'all')
 *   LIMIT         only first N of each type (staged rollout)
 *   SLUG_STYLE    'bare' (default; 'pricing','home' — matches the frontend's getpage/{slug}) | 'path' ('/pricing', '/')
 *   UPSERT        '1' (default) look up by slug and update if present, else add. '0' = always add.
 *
 * Examples:
 *   node populate.mjs                                              # offline dry-run
 *   SA_EMAIL=… SA_PASSWORD=… DRY_RUN=0 ONLY=pages LIMIT=1 node populate.mjs   # one page, live
 *   SA_EMAIL=… SA_PASSWORD=… DRY_RUN=0 node populate.mjs                      # everything
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = (process.env.SA_API_BASE || 'https://pm-admin-sa.vercel.app/api').replace(/\/+$/, '')
let TOKEN = process.env.SA_TOKEN || ''
const EMAIL = process.env.SA_EMAIL || ''
const PASSWORD = process.env.SA_PASSWORD || ''
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
  if (!EMAIL || !PASSWORD) die('Set SA_TOKEN, or SA_EMAIL + SA_PASSWORD')
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

async function upsertExams (exams) {
  log('\n▶ Categories')
  const catMap = await resolveCategories([...new Set(exams.map(e => e._category))])
  log('\n▶ Exams')
  for (const e of exams) {
    const { _category, ...payload } = e
    payload.exam_category = String(catMap[_category] ?? '0')
    try {
      const id = await findId('/exams/list', payload.slug)
      const r = id ? await apiCall('POST', `/exams/update/${id}`, payload) : await apiCall('POST', '/exams/add', payload)
      log(`  ✓ ${payload.slug} ${id ? '(updated ' + id + ')' : '(created ' + (r?.data?.id ?? r?.id ?? '?') + ')'}`)
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
    log('Exams: ' + exams.map(e => `${e.slug}[${e._category}] R${e.price_1}/${e.price_12}`).join(', '))
    log('FAQs: ' + faqs.length + ' item(s) — ' + [...new Set(faqs.map(f => f.type))].join(', '))
    log('\nSet DRY_RUN=0 with SA_EMAIL + SA_PASSWORD to write.')
    return
  }
  await login()
  if (ONLY === 'pages' || ONLY === 'all') await upsertPages(pages)
  if (ONLY === 'exams' || ONLY === 'all') await upsertExams(exams)
  if (ONLY === 'faqs' || ONLY === 'all') await upsertFaqs(faqs)
  log('\nDone.')
}
main().catch(e => die(e.message))
