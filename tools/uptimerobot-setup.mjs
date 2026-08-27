#!/usr/bin/env node
/**
 * Create one UptimeRobot KEYWORD monitor per market (free tier: 50 monitors,
 * 5-minute checks, email/Slack/webhook alerts).
 *
 * Why keyword, not a plain HTTP ping: the site has a maintenance mode that
 * returns HTTP 200 while showing an "Under maintenance" overlay instead of the
 * real page. A plain ping would read that as "up". A keyword monitor set to
 * alert when "Under maintenance" is PRESENT means a market only counts as up
 * when it's actually serving real content — and it still reports down on the
 * usual 5xx / timeout / DNS failures. Flip DIRECTION below if you'd rather
 * assert a positive string is present (see KEYWORD).
 *
 * Usage:
 *   UPTIMEROBOT_API_KEY=u1234567-xxxx node tools/uptimerobot-setup.mjs          # create
 *   UPTIMEROBOT_API_KEY=... DRY=1 node tools/uptimerobot-setup.mjs              # preview only
 *   UPTIMEROBOT_API_KEY=... VERCEL=1 node tools/uptimerobot-setup.mjs           # monitor .vercel.app aliases instead of custom domains
 *
 * The API key is your account "Main API Key" (UptimeRobot → Settings → API).
 * Idempotent: skips any monitor whose friendly name already exists.
 *
 * IMPORTANT: each market's custom domain below must actually resolve, or the
 * monitor will (correctly) report it down. If a market isn't on its custom
 * domain yet, run with VERCEL=1 to monitor the .vercel.app alias instead, or
 * edit that market's `domain` inline.
 */
const API = 'https://api.uptimerobot.com/v2'
const KEY = process.env.UPTIMEROBOT_API_KEY
const DRY = process.env.DRY === '1'
const USE_VERCEL = process.env.VERCEL === '1'

// All six markets treated as live. `domain` = canonical production URL users
// hit; `vercel` = the project's .vercel.app alias (used when VERCEL=1, or as a
// fallback for any market not yet on its custom domain).
const MARKETS = [
  { name: 'Passmed US', domain: 'https://passmed.com',    vercel: 'https://pm-frontend-us.vercel.app' },
  { name: 'Passmed SA', domain: 'https://passmed.co.za',  vercel: 'https://pm-frontend-sa.vercel.app' },
  { name: 'Passmed UK', domain: 'https://passmed.uk',     vercel: 'https://pmfrontend-uk.vercel.app'  },
  { name: 'Passmed CA', domain: 'https://passmed.ca',     vercel: 'https://pm-frontend-ca.vercel.app' },
  { name: 'Passmed AU', domain: 'https://passamc.org',    vercel: 'https://pm-frontend-au.vercel.app' },
  { name: 'Passmed PH', domain: 'https://passmed.ph',     vercel: 'https://pm-frontend-ph.vercel.app' },
]

// Keyword logic. DIRECTION 'down_when_present' → the monitor goes DOWN when
// KEYWORD is found on the page (our maintenance overlay). Switch to
// 'down_when_absent' with a positive KEYWORD (e.g. 'Get Started') if you'd
// rather assert real content is present.
const KEYWORD = 'Under maintenance'
const DIRECTION = 'down_when_present'
// UptimeRobot: keyword_type 1 = alert when keyword EXISTS, 2 = alert when it does NOT exist.
const KEYWORD_TYPE = DIRECTION === 'down_when_present' ? '1' : '2'

if (!KEY) { console.error('Set UPTIMEROBOT_API_KEY (your account Main API Key).'); process.exit(1) }

const post = async (ep, params) => {
  const body = new URLSearchParams({ api_key: KEY, format: 'json', ...params })
  const r = await fetch(`${API}/${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' }, body })
  return r.json()
}

const run = async () => {
  console.log(`Mode: keyword monitor — down when "${KEYWORD}" ${DIRECTION === 'down_when_present' ? 'is present' : 'is absent'}. URLs: ${USE_VERCEL ? '.vercel.app aliases' : 'custom domains'}.\n`)

  // 1) alert contacts → attach all so you actually get notified (add more in the
  //    UptimeRobot dashboard: email, Slack, webhook, SMS…).
  const ac = await post('getAlertContacts', {})
  const contacts = (ac.alert_contacts || []).filter(c => String(c.status) === '2') // 2 = active
  const alertParam = contacts.map(c => `${c.id}_0_0`).join('-') // id_threshold_recurrence
  console.log(`Alert contacts: ${contacts.map(c => c.friendly_name || c.value).join(', ') || '(none — add one in the dashboard!)'}`)

  // 2) existing monitors (skip duplicates)
  const existing = await post('getMonitors', {})
  const have = new Set((existing.monitors || []).map(m => m.friendly_name))

  for (const m of MARKETS) {
    const url = USE_VERCEL ? m.vercel : m.domain
    if (have.has(m.name)) { console.log(`= ${m.name} already exists — skipped`); continue }
    if (DRY) { console.log(`+ would create ${m.name} → ${url} (5-min keyword check, down when "${KEYWORD}" ${KEYWORD_TYPE === '1' ? 'present' : 'absent'})`); continue }
    const res = await post('newMonitor', {
      friendly_name: m.name,
      url,
      type: '2',                 // 2 = Keyword
      keyword_type: KEYWORD_TYPE,
      keyword_value: KEYWORD,
      keyword_case_type: '0',    // 0 = case sensitive
      interval: '300',           // 5 minutes (free-tier minimum)
      timeout: '30',
      ...(alertParam ? { alert_contacts: alertParam } : {}),
    })
    console.log(res.stat === 'ok' ? `+ created ${m.name} → ${url} (monitor ${res.monitor?.id})` : `✗ ${m.name}: ${JSON.stringify(res.error || res)}`)
  }
  console.log('\nDone. Manage alerts + integrations at https://dashboard.uptimerobot.com')
  console.log('Note: markets currently in maintenance mode (e.g. AU/PH) will report DOWN until you lift maintenance — that is the monitor correctly flagging they are not serving real content yet.')
}
run().catch(e => { console.error('ERROR', e.message); process.exit(1) })
