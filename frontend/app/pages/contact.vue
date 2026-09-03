<script setup>
const route = useRoute()
const rc = useRegionContent()
const region = useRegion()
const enquiriesWord = (region === 'UK' || region === 'SA') ? 'enquiries' : 'inquiries'

/* === SSR-safe page fetch (for SEO data from API) === */
const { data: page } = await useAsyncData(
  `page-${route.path}`,
  async () => {
    const res = await $fetch(getApiPath(`getpage${route.path}`), { method: 'GET' })
    if (res.status === 'success') return res.data
    return null
  }
)

/* === SEO — uses API data, falls back to static === */
usePageSeo({
  title: page.value?.seo_title,
  description: page.value?.seo_description || page.value?.short_description,
})

/* === Form state === */
const form = reactive({
  name: '',
  email: '',
  subject: '',
  message: '',
})

/* === Per-field errors and submission state === */
const errors = reactive({
  name: '',
  email: '',
  subject: '',
  message: '',
})
const submitting = ref(false)
const submitError = ref('')
const submitted = ref(false)

/* === Anti-spam: honeypot + timing + Cloudflare Turnstile === */
const spam = useSpamGuard()
const turnstileToken = ref('')
const turnstileRef = ref(null)

const subjects = [
  { value: 'trial',        label: 'Free trial question' },
  { value: 'billing',      label: 'Billing or subscription' },
  { value: 'account',      label: 'Account access' },
  { value: 'content',      label: 'Question content or error' },
  { value: 'technical',    label: 'Technical issue' },
  { value: 'institutions', label: 'Institutional / group licensing' },
  { value: 'waitlist',     label: 'Medical students waitlist' },
  { value: 'other',        label: 'Other' },
]

// Deep links (e.g. /contact?subject=waitlist from the "join the waitlist" CTAs)
// pre-select the matching subject.
if (typeof route.query.subject === 'string' && subjects.some(s => s.value === route.query.subject)) {
  form.subject = route.query.subject
}

const validate = () => {
  errors.name = errors.email = errors.subject = errors.message = ''
  let ok = true

  if (!form.name.trim()) {
    errors.name = 'Please enter your name.'
    ok = false
  }
  if (!form.email.trim()) {
    errors.email = 'Please enter your email.'
    ok = false
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'Please enter a valid email address.'
    ok = false
  }
  if (!form.subject) {
    errors.subject = 'Please choose a subject.'
    ok = false
  }
  if (!form.message.trim()) {
    errors.message = 'Please write a message.'
    ok = false
  } else if (form.message.trim().length < 10) {
    errors.message = 'Please write at least 10 characters.'
    ok = false
  }

  return ok
}

const submit = async () => {
  submitError.value = ''
  if (!validate()) return

  // Drop obvious bots silently (fake success so they don't learn to adapt).
  if (spam.isLikelyBot()) {
    submitted.value = true
    return
  }

  submitting.value = true
  try {
    const res = await $fetch(getApiPath('contactus'), {
      method: 'POST',
      // turnstile_token / hp / elapsed_ms are for backend verification.
      body: {
        ...form,
        turnstile_token: turnstileToken.value,
        hp: spam.honeypot.value,
        elapsed_ms: spam.elapsedMs(),
      },
    })
    // Only treat it as sent when the backend confirms success — a 200 with
    // { status: 'error' } must NOT show a fake success.
    if (res?.status === 'success') {
      submitted.value = true
    } else {
      submitError.value = res?.msg || res?.message || 'Something went wrong. Please try again or email us directly.'
      turnstileRef.value?.reset()
    }
  } catch (e) {
    submitError.value = e?.data?.msg || e?.data?.message || 'Something went wrong. Please try again or email us directly.'
    turnstileRef.value?.reset()
  } finally {
    submitting.value = false
  }
}

/* Reset back to a blank form so the user can send another message
   (mirrors the institutions form's resetForm). */
function resetForm () {
  form.name = ''
  form.email = ''
  form.subject = ''
  form.message = ''
  errors.name = ''
  errors.email = ''
  errors.subject = ''
  errors.message = ''
  submitError.value = ''
  submitted.value = false
  spam.honeypot.value = ''
  turnstileToken.value = ''
  turnstileRef.value?.reset()
}
</script>
<template>
    
<div id="page-contact" class="page active">

  <!-- PAGE HERO -->
  <section class="page-hero">
    <div class="page-hero-inner">
          <div  v-if="page && page.content" v-html="sanitizeHtml(page.content)"></div>       
    </div>
  </section>

  <!-- CONTACT CONTENT -->
  <section class="contact-body">
    <div class="contact-cols">

      <!-- Left: info -->
      <div>
        <h2 style="font-size:1.5rem; font-weight:800; color:var(--ink); margin-bottom:24px; letter-spacing:-0.5px;">How can we help?</h2>

        <div style="display:flex; flex-direction:column; gap:20px; margin-bottom:40px;">
          <div style="display:flex; align-items:flex-start; gap:14px;">
            <div style="width:40px; height:40px; border-radius:10px; background:var(--teal-light); border:1.5px solid var(--teal-border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <div>
              <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:var(--ink-dim); margin-bottom:3px;">Email</div>
              <div style="font-size:0.9rem; color:var(--ink); font-weight:500;">
                <a :href="`mailto:${rc.supportEmail}`" style="color:var(--teal); text-decoration:none;">{{ rc.supportEmail }}</a>
              </div>
            </div>
          </div>

          <div style="display:flex; align-items:flex-start; gap:14px;">
            <div style="width:40px; height:40px; border-radius:10px; background:var(--teal-light); border:1.5px solid var(--teal-border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div>
              <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:var(--ink-dim); margin-bottom:3px;">Response time</div>
              <div style="font-size:0.9rem; color:var(--ink); font-weight:500;">{{ rc.supportHours }} · Usually within a few hours</div>
            </div>
          </div>

          <div style="display:flex; align-items:flex-start; gap:14px;">
            <div style="width:40px; height:40px; border-radius:10px; background:var(--teal-light); border:1.5px solid var(--teal-border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div>
              <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:var(--ink-dim); margin-bottom:3px;">Institutions</div>
              <div style="font-size:0.9rem; color:var(--ink); font-weight:500;">
                For group licensing {{ enquiriesWord }},
                <NuxtLink to="/institutions" style="color:var(--teal); text-decoration:none; font-weight:700;">visit our Institutions page →</NuxtLink>
              </div>
            </div>
          </div>
        </div>

        <div style="background:var(--surface); border:1.5px solid var(--border); border-radius:var(--r); padding:20px 22px;">
          <div style="font-size:0.8rem; font-weight:700; color:var(--ink); margin-bottom:6px;">Existing subscribers</div>
          <div style="font-size:0.82rem; color:var(--ink-mid); line-height:1.65;">For billing, account access, or technical issues, please include your registered email address so we can look up your account quickly.</div>
        </div>
      </div>

      <!-- Right: form -->
      <div class="cf-card" style="background:var(--white); border:1.5px solid var(--border); border-radius:var(--r-lg); box-shadow:var(--shadow-sm);">

        <!-- Form view -->
        <form v-if="!submitted" @submit.prevent="submit" novalidate>
          <div class="cf-group">
            <label class="cf-label">Your name</label>
            <input
              v-model="form.name"
              type="text"
              placeholder="Jane Smith"
              autocomplete="name"
              :disabled="submitting"
              class="cf-input"
            />
            <p v-if="errors.name" class="cf-error">{{ errors.name }}</p>
          </div>

          <div class="cf-group">
            <label class="cf-label">Email address</label>
            <input
              v-model="form.email"
              type="email"
              placeholder="you@example.com"
              autocomplete="email"
              :disabled="submitting"
              class="cf-input"
            />
            <p v-if="errors.email" class="cf-error">{{ errors.email }}</p>
          </div>

          <div class="cf-group">
            <label class="cf-label">Subject</label>
            <select
              v-model="form.subject"
              :disabled="submitting"
              class="cf-input cf-input--select"
            >
              <option value="">Select a subject…</option>
              <option v-for="s in subjects" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
            <p v-if="errors.subject" class="cf-error">{{ errors.subject }}</p>
          </div>

          <div class="cf-group cf-group--last">
            <label class="cf-label">Message</label>
            <textarea
              v-model="form.message"
              placeholder="Tell us how we can help…"
              rows="5"
              :disabled="submitting"
              class="cf-input cf-input--textarea"
            ></textarea>
            <p v-if="errors.message" class="cf-error">{{ errors.message }}</p>
          </div>

          <!-- Honeypot: hidden from humans; bots fill it. Not a real field. -->
          <div aria-hidden="true" style="position:absolute; left:-9999px; top:-9999px; width:1px; height:1px; overflow:hidden;">
            <label>Company (leave this empty)</label>
            <input v-model="spam.honeypot.value" type="text" tabindex="-1" autocomplete="off" />
          </div>

          <!-- Cloudflare Turnstile (renders only when a site key is configured) -->
          <TurnstileWidget ref="turnstileRef" v-model="turnstileToken" />

          <p v-if="submitError" style="color:#dc2626; font-size:0.85rem; margin-bottom:12px; text-align:center;">{{ submitError }}</p>

          <button
            type="submit"
            :disabled="submitting"
            style="width:100%; padding:13px; background:var(--teal); color:#fff; font-weight:700; font-size:0.94rem; font-family:'Figtree',sans-serif; border:none; border-radius:var(--r-sm); cursor:pointer; transition:all 0.22s cubic-bezier(0.34,1.56,0.64,1); box-shadow:0 2px 0 var(--teal-mid),0 4px 14px rgba(6,182,212,0.2); display:flex; align-items:center; justify-content:center; gap:8px; opacity:1;"
            :style="submitting ? { opacity: 0.7, cursor: 'not-allowed' } : {}"
          >
            <svg v-if="!submitting" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
            {{ submitting ? 'Sending…' : 'Send message' }}
          </button>

          <p style="text-align:center; margin-top:12px; font-size:0.76rem; color:var(--ink-dim);">We typically respond within a few hours on weekdays.</p>
        </form>

        <!-- Success view -->
        <div v-else style="text-align:center; padding:40px 20px;">
          <div style="width:56px; height:56px; background:var(--teal-light); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3 style="font-size:1.2rem; font-weight:700; color:var(--ink); margin-bottom:8px;">Message sent!</h3>
          <p style="font-size:0.88rem; color:var(--ink-mid);">Thanks for reaching out. We'll be in touch within a few hours.</p>
          <button type="button" class="cf-send-another" @click="resetForm">Send another message</button>
        </div>
      </div>

    </div>
  </section>
</div>
</template>

<style scoped>
/* Contact form fields — extracted from per-element inline styles so the shared
   look lives in one place (and is themeable). */
.cf-group { margin-bottom: 18px; }
.cf-group--last { margin-bottom: 24px; }

.cf-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--ink-mid);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 6px;
}

.cf-input {
  width: 100%;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--r-sm);
  padding: 11px 14px;
  font-size: 0.9rem;
  font-family: 'Figtree', sans-serif;
  color: var(--ink);
  outline: none;
  transition: all 0.18s;
  box-sizing: border-box;
}
.cf-input:focus {
  border-color: var(--teal);
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.1);
}
.cf-input--textarea { resize: vertical; }
.cf-input--select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a95ad' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
}

.cf-error {
  color: #dc2626;
  font-size: 0.78rem;
  margin-top: 6px;
}

.cf-send-another {
  margin-top: 18px;
  background: none;
  border: 1.5px solid var(--border);
  border-radius: var(--r-sm);
  padding: 9px 18px;
  font-size: 0.85rem;
  font-weight: 700;
  font-family: 'Figtree', sans-serif;
  color: var(--ink-mid);
  cursor: pointer;
  transition: all 0.15s;
}
.cf-send-another:hover {
  border-color: var(--teal);
  color: var(--teal);
}

/* Contact info + form: two columns on desktop, stacked on mobile. Was an inline
   grid (grid-template-columns:1fr 1.4fr) which can't carry a media query, so it
   never collapsed and the page wasn't mobile-responsive. */
.contact-cols {
  max-width: 1000px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 80px;
  align-items: start;
}
.cf-card { padding: 36px; }
/* Content section wrapper — was an inline 72px/80px pad that left a big gap on
   phones; make it responsive. */
.contact-body { padding: 72px 5% 80px; background: var(--white); }
@media (max-width: 820px) {
  .contact-cols { grid-template-columns: 1fr; gap: 40px; }
}
/* Tighten padding on phones so the form isn't cramped edge-to-edge and the gap
   under the hero isn't excessive. */
@media (max-width: 520px) {
  .cf-card { padding: 22px; }
  .contact-body { padding: 40px 5% 56px; }
}
</style>