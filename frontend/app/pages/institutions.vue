<script setup>
const route = useRoute()
const { onContentClick } = useContentClick()
const rc = useRegionContent()
const region = useRegion()
// "Program" has no UK equivalent — UK training bodies say "programme".
const programWord = computed(() => region === 'UK' ? 'programme' : 'program')


/* === SSR-safe page fetch (for SEO data from API) === */
const { data: page, pending: loading, error } = await useAsyncData(
  `page-${route.path}`,
  async () => {
    const res = await $fetch(getApiPath(`getpage${route.path}`), { method: 'GET' })
    if (res.status === 'success') return res.data
    return null
  }
)

/* === SEO — uses API data, falls back to static === */
usePageSeo({
  title: page.value?.seo_title || 'Passmed for Institutions',
  description: page.value?.seo_description || page.value?.short_description || (region === 'UK'
    ? 'Institutional licensing for medical training programmes and medical schools — Passmed for Institutions.'
    : 'Institutional licensing for medical residency programs and medical schools — Passmed for Institutions.'),
})

/* === Form state === */
const form = reactive({
  first_name: '',
  last_name:  '',
  email:      '',
  organization: '',
  program_type: '',
  cohort_size:  '',
  exams:        '',
  message:      '',
})

/* === Per-field errors === */
const errors = reactive({
  first_name: '',
  last_name:  '',
  email:      '',
  organization: '',
  program_type: '',
  cohort_size:  '',
})

const submitting = ref(false)
const submitted  = ref(false)
const serverError = ref('')

/* === Anti-spam: honeypot + timing + Cloudflare Turnstile === */
const spam = useSpamGuard()
const turnstileToken = ref('')
const turnstileRef = ref(null)

function clearError (field) { errors[field] = '' }

function validate () {
  Object.keys(errors).forEach(k => errors[k] = '')
  let ok = true

  if (!form.first_name.trim())  { errors.first_name = 'First name is required'; ok = false }
  if (!form.last_name.trim())   { errors.last_name  = 'Last name is required';  ok = false }
  if (!form.email.trim())       { errors.email      = 'Email is required';      ok = false }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'Enter a valid email address'; ok = false
  }
  if (!form.organization.trim()) { errors.organization = 'Institution name is required'; ok = false }
  if (!form.program_type)        { errors.program_type = 'Select a program type';         ok = false }
  if (!form.cohort_size)         { errors.cohort_size  = 'Select a cohort size';          ok = false }

  return ok
}

async function submitInstForm () {
  serverError.value = ''
  if (!validate()) return

  // Drop obvious bots silently (fake success so they don't learn to adapt).
  if (spam.isLikelyBot()) {
    submitted.value = true
    return
  }

  submitting.value = true
  try {
    const res = await $fetch(getApiPath('institutions/enquiry'), {
      method: 'POST',
      // turnstile_token / hp / elapsed_ms are for backend verification.
      body: {
        ...form,
        turnstile_token: turnstileToken.value,
        hp: spam.honeypot.value,
        elapsed_ms: spam.elapsedMs(),
      },
    })

    if (res.status === 'success') {
      submitted.value = true
      await nextTick()
      document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      serverError.value = res.message || 'Could not send inquiry. Please try again.'
      turnstileRef.value?.reset()
    }
  } catch (e) {
    serverError.value = e?.data?.message || 'Could not send inquiry. Please try again.'
    turnstileRef.value?.reset()
  } finally {
    submitting.value = false
  }
}

function resetForm () {
  Object.keys(form).forEach(k => form[k] = '')
  Object.keys(errors).forEach(k => errors[k] = '')
  submitted.value = false
  serverError.value = ''
}
</script>
<template>
<div v-if="loading" class="page-loader">
<div class="loader-spinner"></div>
</div>
  <div id="page-institutions" class="page active">

    <!-- CONTENT -->
    <div  v-if="page && page.content" v-html="sanitizeHtml(page.content)"   @click="onContentClick"></div>        
    <!-- /content-wrap -->


    <section class="contact-wrap" id="contact-form" v-if="!loading">
      <div class="contact-inner">
        <div class="contact-left">
          <div class="eyebrow" style="color:#fff;">Get in touch</div>
          <h2 style="color:#fff;margin-bottom:16px;">Let's talk about<br><em>your {{ programWord }}</em></h2>
          <p class="lead">Fill in the form and we'll get back to you within one business day with a custom quote tailored to your cohort size and exam needs.</p>
          <div class="contact-detail">
            <div class="contact-detail-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <div>
              <div class="contact-detail-label">Email us directly</div>
              <div class="contact-detail-val">
                <a :href="`mailto:${rc.institutionsEmail}`">{{ rc.institutionsEmail }}</a>
              </div>
            </div>
          </div>
        </div>

        <div class="form-card">
          <!-- FORM -->
          <form
            v-if="!submitted"
            class="form-fields"
            id="instFormFields"
            @submit.prevent="submitInstForm"
            novalidate
          >
            <div class="form-row">
              <div class="form-group">
                <label for="inst-name">First name</label>
                <input
                  id="inst-name"
                  v-model="form.first_name"
                  type="text"
                  placeholder="Dr. Jane"
                  autocomplete="given-name"
                  @input="clearError('first_name')"
                />
                <div v-if="errors.first_name" class="field-error">{{ errors.first_name }}</div>
              </div>
              <div class="form-group">
                <label for="inst-surname">Last name</label>
                <input
                  id="inst-surname"
                  v-model="form.last_name"
                  type="text"
                  placeholder="Smith"
                  autocomplete="family-name"
                  @input="clearError('last_name')"
                />
                <div v-if="errors.last_name" class="field-error">{{ errors.last_name }}</div>
              </div>
            </div>

            <div class="form-group">
              <label for="inst-email">Work email</label>
              <input
                id="inst-email"
                v-model="form.email"
                type="email"
                placeholder="jane.smith@hospital.edu"
                autocomplete="email"
                @input="clearError('email')"
              />
              <div v-if="errors.email" class="field-error">{{ errors.email }}</div>
            </div>

            <div class="form-group">
              <label for="inst-org">{{ (region === 'UK' || region === 'SA') ? 'Institution / organisation' : 'Institution / organization' }}</label>
              <input
                id="inst-org"
                v-model="form.organization"
                type="text"
                placeholder="Johns Hopkins Department of Medicine"
                @input="clearError('organization')"
              />
              <div v-if="errors.organization" class="field-error">{{ errors.organization }}</div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="inst-type">{{ (region === 'UK' || region === 'SA') ? 'Programme type' : 'Program type' }}</label>
                <select
                  id="inst-type"
                  v-model="form.program_type"
                  @change="clearError('program_type')"
                >
                  <option value="" disabled>Select one…</option>
                  <option value="residency">{{ region === 'SA' ? 'Registrar training programme' : (region === 'UK' ? 'Training programme' : 'Residency program') }}</option>
                  <option value="fellowship">{{ (region === 'UK' || region === 'SA') ? 'Fellowship programme' : 'Fellowship program' }}</option>
                  <option value="medical-school">Medical school</option>
                  <option value="hospital-system">Hospital system</option>
                  <option v-if="region === 'SA'" value="university-department">University department</option>
                  <option v-if="region === 'SA'" value="provincial-health">Provincial health department</option>
                  <option v-if="region === 'SA'" value="hospital-group">Hospital group</option>
                  <option value="other">Other</option>
                </select>
                <div v-if="errors.program_type" class="field-error">{{ errors.program_type }}</div>
              </div>
              <div class="form-group">
                <label for="inst-size">Cohort size</label>
                <select
                  id="inst-size"
                  v-model="form.cohort_size"
                  @change="clearError('cohort_size')"
                >
                  <option value="" disabled>Select range…</option>
                  <option value="5-15">5 – 15 users</option>
                  <option value="16-50">16 – 50 users</option>
                  <option value="51-150">51 – 150 users</option>
                  <option value="151-250">151 – 250 users</option>
                  <option value="251-500">251 – 500 users</option>
                  <option value="501-1000">501 – 1,000 users</option>
                  <option value="1000+">1,000+ users</option>
                </select>
                <div v-if="errors.cohort_size" class="field-error">{{ errors.cohort_size }}</div>
              </div>
            </div>

            <div class="form-group">
              <label for="inst-exams">Which exam banks are you interested in?</label>
              <input
                id="inst-exams"
                v-model="form.exams"
                type="text"
                placeholder="e.g. ABA Basic, ABIM, all shelf exams…"
              />
            </div>

            <div class="form-group">
              <label for="inst-message">Anything else we should know?</label>
              <textarea
                id="inst-message"
                v-model="form.message"
                placeholder="Timeline, budget, integration requirements, questions…"
              ></textarea>
            </div>

            <!-- Honeypot: hidden from humans; bots fill it. Not a real field. -->
            <div aria-hidden="true" style="position:absolute; left:-9999px; top:-9999px; width:1px; height:1px; overflow:hidden;">
              <label>Company (leave this empty)</label>
              <input v-model="spam.honeypot.value" type="text" tabindex="-1" autocomplete="off" />
            </div>

            <!-- Cloudflare Turnstile (renders only when a site key is configured) -->
            <TurnstileWidget ref="turnstileRef" v-model="turnstileToken" />

            <div v-if="serverError" class="field-error" style="margin-bottom:10px;">
              {{ serverError }}
            </div>

            <button class="form-submit" type="submit" :disabled="submitting">
              {{ submitting ? 'Sending…' : 'Send inquiry' }}
              <svg v-if="!submitting" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>

            <p class="form-note">We'll never share your details. No spam, ever.</p>
          </form>

          <!-- SUCCESS -->
          <div v-else class="form-success" id="instFormSuccess" style="display:block;">
            <div class="form-success-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3>Inquiry received</h3>
            <p>Thanks — we'll be in touch within one business day with a custom quote for your {{ programWord }}.</p>
            <button type="button" class="link-btn" @click="resetForm" style="margin-top:14px;">
              Send another inquiry
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
<style >
.field-error { color: #dc2626; font-size: 13px; margin-top: 4px; }
.form-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.link-btn {
  background: transparent; border: 0; color: #06b6d4;
  cursor: pointer; font-size: 14px; text-decoration: underline;
}
</style>