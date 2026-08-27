#!/usr/bin/env node
/*
 * Reclassify specific marketing (portal_type=home) FAQs into the student/institute
 * portals by updating their portal_type (and remapping `type` to fit the destination
 * portal's filter chips). Idempotent: matches by exact question; safe to re-run.
 *
 * Env: DRY_RUN=1 (default) | 0 ; REGIONS="uk,sa" (default both)
 */
const REGIONS = (process.env.REGIONS || 'uk,sa').split(',').map(s => s.trim()).filter(Boolean)
const DRY = process.env.DRY_RUN !== '0'

// question → { to: 'student'|'institute', type: <destination category> }
const MOVES = {
  // → Institute (institute portal help.vue ignores type; use 'other' to match its set)
  'Can you support exam accommodations, such as extra time?':            { to: 'institute', type: 'other' },
  'Can programme directors see trainee performance data?':               { to: 'institute', type: 'other' },
  'Can programme directors assign questions or quizzes to trainees?':    { to: 'institute', type: 'other' },
  'How does billing work for institutions?':                             { to: 'institute', type: 'other' },
  'Can our training programme get group access?':                        { to: 'institute', type: 'other' },
  // → Student (student portal chips: account | questions | billing | technical | other)
  'Is my performance shared with my programme or school?':               { to: 'student', type: 'account' },
  // SA marketing set uses region-specific wording (test/registrar/university):
  'Can you support test accommodations, such as extra time?':            { to: 'institute', type: 'other' },
  'Can programme directors see registrar performance data?':             { to: 'institute', type: 'other' },
  'Can programme directors assign questions or quizzes to registrars?':  { to: 'institute', type: 'other' },
  'Is my performance shared with my programme or university?':           { to: 'student', type: 'account' },
  'I found an error in a question. How do I report it?':                 { to: 'student', type: 'questions' },
  'How is my score calculated, and is there negative marking?':          { to: 'student', type: 'questions' },
  'How do I provide feedback on a question?':                            { to: 'student', type: 'questions' },
  'Can I save Passmed content to my hard drive or print it?':            { to: 'student', type: 'technical' },
  'Can I temporarily suspend my subscription?':                          { to: 'student', type: 'billing' },
}

async function call (API, method, ep, tok, body) {
  const res = await fetch(`${API}${ep}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await res.text(); let d; try { d = JSON.parse(t) } catch { d = t }
  if (!res.ok) throw new Error(`${method} ${ep} → ${res.status}: ${(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 200)}`)
  return d
}
const rows = r => r?.data?.data || r?.data || r?.rows || []

// portal_type is fixed at creation — /faqs/update can't change it (it scopes the
// lookup by the portal_type in the body). So a "move" is: add a copy under the
// target portal_type, then delete the home copy. Add-first so a mid-run failure
// never loses content. Idempotent: re-runs skip already-moved questions.
for (const region of REGIONS) {
  const API = `https://pm-admin-${region}.vercel.app/api`
  console.log(`\n===== ${region.toUpperCase()} (${API}) DRY_RUN=${DRY} =====`)
  const tok = (await call(API, 'POST', '/login', '', { email: `admin-${region}@gmail.com`, password: 'admin@123456', remember: false })).token
  const home = rows(await call(API, 'POST', '/faqs', tok, { search: '', page: 1, limit: 500, portal_type: 'home' }))
  const targetQs = {}
  for (const pt of ['student', 'institute']) {
    targetQs[pt] = new Set(rows(await call(API, 'POST', '/faqs', tok, { search: '', page: 1, limit: 500, portal_type: pt })).map(x => String(x.question).trim()))
  }
  for (const [q, m] of Object.entries(MOVES)) {
    const f = home.find(x => String(x.question).trim() === q.trim())
    if (!f) { console.log(`  · not in home (already moved?): ${q.slice(0, 50)}`); continue }
    if (DRY) { console.log(`  → ${m.to.padEnd(9)} [${m.type}] ${q.slice(0, 50)} (id ${f.id}, add+del)`); continue }
    if (!targetQs[m.to].has(q.trim())) {
      await call(API, 'POST', '/faqs/add', tok, { question: f.question, answer: f.answer, type: m.type, status: f.status ?? 1, sort_order: f.sort_order ?? 0, portal_type: m.to })
    }
    await call(API, 'POST', `/faqs/delete/${f.id}`, tok, { portal_type: 'home' })
    console.log(`  ✓ ${m.to.padEnd(9)} [${m.type}] ${q.slice(0, 50)} (was id ${f.id})`)
  }
}
