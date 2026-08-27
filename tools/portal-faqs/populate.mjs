#!/usr/bin/env node
/*
 * Seed the Passmed STUDENT / INSTITUTE portal FAQs for a region.
 *
 * These are the same /faqs admin resource as the marketing FAQs, distinguished
 * by a `portal_type` field: 'home' (marketing), 'student', 'institute'. The admin
 * FAQ screen has one tab per portal_type; each portal's own /faqs endpoint returns
 * only its portal_type group. So a student FAQ is just a /faqs row with
 * portal_type='student'. add/update/list all take portal_type.
 *
 * Env:
 *   REGION      'sa' | 'uk'         (selects backend + default admin email)
 *   PORTAL      'student' | 'institute'   (which payload + portal_type)
 *   API_BASE    override backend    (default https://pm-admin-<REGION>.vercel.app/api)
 *   EMAIL / PASSWORD                 admin login (default admin-<REGION>@gmail.com / admin@123456)
 *   TOKEN       bearer to skip login
 *   DRY_RUN     '1' (default) = no writes. '0' = live.
 *   LIMIT       only first N (staged rollout)
 *   UPSERT      '1' (default) match by question within portal_type and update; '0' always add.
 *
 * Examples:
 *   REGION=uk PORTAL=student node populate.mjs                         # dry-run
 *   REGION=uk PORTAL=student DRY_RUN=0 LIMIT=1 node populate.mjs       # one, live
 *   REGION=uk PORTAL=student DRY_RUN=0 node populate.mjs               # all, live
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REGION = (process.env.REGION || '').toLowerCase()
const PORTAL = (process.env.PORTAL || '').toLowerCase()
if (!['sa', 'uk', 'au', 'ca', 'ph'].includes(REGION)) die('Set REGION=sa|uk|au|ca|ph')
if (!['student', 'institute'].includes(PORTAL)) die("Set PORTAL=student|institute")

const API = (process.env.API_BASE || `https://pm-admin-${REGION}.vercel.app/api`).replace(/\/+$/, '')
let TOKEN = process.env.TOKEN || ''
const EMAIL = process.env.EMAIL || `admin-${REGION}@gmail.com`
const PASSWORD = process.env.PASSWORD || 'admin@123456'
const DRY = process.env.DRY_RUN !== '0'
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity
const UPSERT = process.env.UPSERT !== '0'

const log = (...a) => console.log(...a)
function die (m) { console.error('✗ ' + m); process.exit(1) }

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

async function login () {
  if (TOKEN) return
  log('▶ Logging in as ' + EMAIL + ' @ ' + API)
  const res = await apiCall('POST', '/login', { email: EMAIL, password: PASSWORD, remember: false })
  TOKEN = res?.token ?? res?.data?.token
  if (!TOKEN) die('login returned no token: ' + JSON.stringify(res).slice(0, 200))
  log('  ✓ authenticated')
}

async function upsertFaqs (faqs) {
  log(`\n▶ ${PORTAL} FAQs (portal_type=${PORTAL})`)
  const existing = {}
  if (UPSERT) {
    try {
      const res = await apiCall('POST', '/faqs', { search: '', page: 1, limit: 1000, portal_type: PORTAL })
      for (const f of rows(res)) existing[String(f.question).trim()] = f.id
    } catch (e) { log('  (could not list existing: ' + e.message + ')') }
  }
  for (const f of faqs) {
    const payload = { ...f, portal_type: PORTAL }
    try {
      const id = existing[String(f.question).trim()]
      id ? await apiCall('POST', `/faqs/update/${id}`, payload) : await apiCall('POST', '/faqs/add', payload)
      log(`  ✓ [${f.type}] ${f.question.slice(0, 52)} ${id ? '(updated ' + id + ')' : '(added)'}`)
    } catch (e) { log(`  ✗ ${f.question.slice(0, 52)}: ${e.message}`) }
  }
}

async function main () {
  const file = path.join(HERE, `${PORTAL}-${REGION}.payload.json`)
  const faqs = JSON.parse(fs.readFileSync(file, 'utf8')).slice(0, LIMIT)
  log(`Loaded ${faqs.length} ${PORTAL} faq(s) for ${REGION.toUpperCase()}. API=${API} DRY_RUN=${DRY} UPSERT=${UPSERT}`)
  if (DRY) {
    log(`\nDRY_RUN — no writes. Questions:`)
    for (const f of faqs) log(`  [${f.type}] ${f.question}`)
    log('\nSet DRY_RUN=0 to write.')
    return
  }
  await login()
  await upsertFaqs(faqs)
  log('\nDone.')
}
main().catch(e => die(e.message))
