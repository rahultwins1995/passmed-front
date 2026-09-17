<!--
  StudentOnboardingModal — one-time intake gate shown the first time a newly
  subscribed student lands on the dashboard (driven by user.onboarded === false
  in index.vue). It is intentionally NOT dismissible: the student must complete
  the required intake fields and accept the Terms of Use before continuing.

  Country is a dropdown of all countries, pre-selected to United States (US build).

  Audience toggle (Medical student / Resident or doctor) switches the field set:
    • Student  — country, medical school (dropdown scoped to the selected
                 country; free text for countries not on the sheet), year of
                 graduation (prospective: this year onward, required), exam date
                 (optional)
    • Resident — country, where they work/study (optional), specialty (optional),
                 year of med-school graduation (retrospective: this year & earlier,
                 optional), exam date (required). No Hospital field.

  On success it POSTs the intake payload to /onboarding/complete (which also
  flips onboarded → true) and emits `done`; the parent then closes it.
-->
<script setup lang="ts">
import { COUNTRIES, regionDefaultCountry, schoolsForCountry } from '~/data/onboarding'

defineProps<{ name?: string | null }>()
const emit = defineEmits<{ (e: 'done'): void }>()

const studentApi = useStudentApi()

// A brand-new user seeing onboarding should always start in light mode, even if
// a stale dark preference lingers in this browser from an earlier build.
onMounted(() => useDarkMode().setLight())

const audience = ref<'student' | 'resident'>('resident')

// Pre-select the country that matches this deployment's region (e.g. Philippines
// on the PH build), not a hardcoded United States. Still fully changeable.
const form = reactive({
  country:            regionDefaultCountry(useRegion()),
  medicalSchool:      '',                // US school (dropdown) — students
  medicalSchoolOther: '',                // free text when "not listed" is picked
  gradYear:           '',
  workStudy:          '',
  specialty:          '',
  examDate:           '',
})
const tcAccepted = ref(false)
const submitting = ref(false)
const error      = ref('')

const OTHER = '__other__'   // sentinel for the "school isn't listed" option

const isStudent = computed(() => audience.value === 'student')

// Graduation-year options differ by audience:
//  • Student  — PROSPECTIVE only (current year onward): they haven't graduated.
//  • Resident — RETROSPECTIVE (current year and earlier): they already have.
const nowYear = new Date().getFullYear()
const years = computed<number[]>(() => {
  const out: number[] = []
  if (isStudent.value) {
    for (let y = nowYear; y <= nowYear + 7; y++) out.push(y)
  } else {
    for (let y = nowYear; y >= nowYear - 60; y--) out.push(y)
  }
  return out
})

// Switching audience can leave a year that's invalid for the new range
// (e.g. a future student year carried into the resident's past-only list), so
// clear it on toggle.
watch(audience, () => { form.gradYear = '' })

// Medical-school options are scoped to the SELECTED country (the dropdown
// previously always rendered US schools regardless of country). Countries with
// no list in the sheet → schoolGroups is empty and the modal shows a free-text
// school field instead.
const schoolGroups = computed(() => schoolsForCountry(form.country))
const hasSchoolList = computed(() => schoolGroups.value.length > 0)

// Changing country invalidates any school picked for the previous country, so
// reset the school selection (and the "other" free text) on every change.
watch(() => form.country, () => {
  form.medicalSchool = ''
  form.medicalSchoolOther = ''
})

// Resolve the student's school: when the country has no list it's the free-text
// field; otherwise the dropdown value, or the "other" free text when "My school
// isn't listed" is chosen.
const effectiveSchool = computed(() => {
  if (!hasSchoolList.value) return form.medicalSchoolOther.trim()
  return form.medicalSchool === OTHER ? form.medicalSchoolOther.trim() : form.medicalSchool.trim()
})

const isValid = computed(() => {
  if (!tcAccepted.value) return false
  if (!form.country.trim()) return false
  if (isStudent.value) {
    // Student: school + graduation year required; exam date OPTIONAL.
    return !!effectiveSchool.value && !!form.gradYear
  }
  // Resident: exam date REQUIRED; work/study, specialty, grad year all optional.
  return !!form.examDate
})

// Prefill from what we already know (the student's user record + the institution
// that invited them) so an invited med student doesn't retype their university,
// country, etc. Every value stays editable. Best-effort: a blank form is a fine
// fallback if the prefill call fails.
onMounted(async () => {
  try {
    const res: any = await studentApi('/onboarding/prefill')
    const d: any = res?.data || {}

    if (d.audience === 'student' || d.audience === 'resident') audience.value = d.audience
    if (d.country) form.country = d.country
    // Let the audience/country watchers (which clear gradYear/school) run first.
    await nextTick()

    if (d.medical_school) {
      const groups = schoolsForCountry(form.country)
      const inList = groups.some((g: any) => g.schools?.includes(d.medical_school))
      if (inList) {
        form.medicalSchool = d.medical_school
      } else {
        if (groups.length) form.medicalSchool = OTHER
        form.medicalSchoolOther = d.medical_school
      }
    }
    if (d.grad_year)  form.gradYear  = String(d.grad_year)
    if (d.exam_date)  form.examDate  = String(d.exam_date).slice(0, 10)
    if (d.work_study) form.workStudy = d.work_study
    if (d.specialty)  form.specialty = d.specialty
  } catch {
    // Prefill is best-effort — leave the defaults.
  }
})

function buildPayload() {
  const payload: Record<string, any> = {
    audience:       audience.value,
    country:        form.country.trim(),
    terms_accepted: true,
  }
  // grad_year — required for students (prospective), optional for residents.
  if (form.gradYear) payload.grad_year = form.gradYear
  // exam_date — required for residents, optional for students.
  if (form.examDate) payload.exam_date = form.examDate

  if (isStudent.value) {
    payload.medical_school = effectiveSchool.value
  } else {
    if (form.workStudy.trim()) payload.work_study = form.workStudy.trim()
    if (form.specialty.trim()) payload.specialty  = form.specialty.trim()
  }
  return payload
}

async function submit() {
  if (!isValid.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    await studentApi('/onboarding/complete', { method: 'POST', body: buildPayload() })
    emit('done')
  } catch (e: any) {
    error.value = e?.data?.msg || e?.message || 'Could not save your details. Please try again.'
  } finally {
    submitting.value = false
  }
}

// ── Accessibility: focus trap ────────────────────────────────────────────────
// This is a REQUIRED intake gate (no overlay-click / no X close), so we do NOT
// add Escape-to-close — that would let a keyboard user bypass a mandatory step.
// We only keep keyboard focus inside the dialog (WCAG 2.4.3 / 2.1.2) so Tab can't
// wander onto the (inert) page behind it. Focus the first field on open.
const obBox = ref<HTMLElement | null>(null)

function obFocusables(): HTMLElement[] {
  if (!obBox.value) return []
  return Array.from(obBox.value.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => el.offsetParent !== null)
}

function onObKeydown(e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  const els = obFocusables()
  if (!els.length) return
  const first = els[0]
  const last = els[els.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (e.shiftKey) {
    if (active === first || !obBox.value?.contains(active)) { e.preventDefault(); last.focus() }
  } else {
    if (active === last || !obBox.value?.contains(active)) { e.preventDefault(); first.focus() }
  }
}

onMounted(() => { nextTick(() => obFocusables()[0]?.focus()) })
</script>

<template>
  <Teleport to="body">
    <!-- No overlay-click / X close: this is a required intake gate. -->
    <div class="ob-overlay">
      <div class="ob-box" ref="obBox" role="dialog" aria-modal="true" aria-label="Complete your profile" @keydown="onObKeydown">
        <div class="ob-hero">
          <div class="ob-badge">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z"/></svg>
          </div>
          <div class="ob-eyebrow">You're all set</div>
          <h2 class="ob-title">Welcome{{ name ? ', ' + name : '' }} 🎉</h2>
          <p class="ob-sub">Tell us a little about you so we can tailor Passmed to your exam.</p>
        </div>

        <div class="ob-body">
          <!-- Audience toggle -->
          <div class="ob-seg" role="tablist" aria-label="I am a">
            <button type="button" role="tab" :aria-selected="audience === 'student'"
              class="ob-seg-btn" :class="{ on: audience === 'student' }" @click="audience = 'student'">
              Medical student
            </button>
            <button type="button" role="tab" :aria-selected="audience === 'resident'"
              class="ob-seg-btn" :class="{ on: audience === 'resident' }" @click="audience = 'resident'">
              Resident or doctor
            </button>
          </div>

          <!-- Fields -->
          <div class="ob-fields">
            <div class="ob-field">
              <label>Country of {{ isStudent ? 'study / work' : 'work' }}</label>
              <select v-model="form.country" autocomplete="country-name">
                <option v-for="c in COUNTRIES" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>

            <!-- Student-only. School options are scoped to the selected country.
                 Countries on the sheet (US/CA/UK/SA/PH/AU) show a grouped
                 dropdown; any other country shows a free-text field. -->
            <template v-if="isStudent">
              <div v-if="hasSchoolList" class="ob-field">
                <label>Medical school</label>
                <select v-model="form.medicalSchool">
                  <option value="" disabled>— Select your school —</option>
                  <optgroup v-for="grp in schoolGroups" :key="grp.group" :label="grp.group">
                    <option v-for="s in grp.schools" :key="s" :value="s">{{ s }}</option>
                  </optgroup>
                  <option :value="OTHER">My school isn’t listed…</option>
                </select>
              </div>
              <div v-if="hasSchoolList && form.medicalSchool === OTHER" class="ob-field">
                <label>School name</label>
                <input type="text" v-model="form.medicalSchoolOther" placeholder="Type your medical school" />
              </div>
              <div v-if="!hasSchoolList" class="ob-field">
                <label>Medical school</label>
                <input type="text" v-model="form.medicalSchoolOther" placeholder="Your medical school" />
              </div>
            </template>

            <!-- Resident-only -->
            <template v-else>
              <div class="ob-field">
                <label>Where you work / study <span class="ob-opt">(optional)</span></label>
                <input type="text" v-model="form.workStudy" placeholder="Institution or program" />
              </div>
              <div class="ob-field">
                <label>Specialty <span class="ob-opt">(optional)</span></label>
                <input type="text" v-model="form.specialty" placeholder="e.g. Internal Medicine" />
              </div>
            </template>

            <div class="ob-field-row">
              <div class="ob-field">
                <label>
                  {{ isStudent ? 'Year of graduation' : 'Year of med-school graduation' }}
                  <span v-if="!isStudent" class="ob-opt">(optional)</span>
                </label>
                <select v-model="form.gradYear">
                  <option value="" :disabled="isStudent">— Select —</option>
                  <option v-for="y in years" :key="y" :value="String(y)">{{ y }}</option>
                </select>
              </div>
              <div class="ob-field">
                <label>Exam date <span v-if="isStudent" class="ob-opt">(optional)</span></label>
                <input type="date" v-model="form.examDate" />
              </div>
            </div>
          </div>

          <!-- Terms acceptance (required) -->
          <label class="ob-terms">
            <input type="checkbox" v-model="tcAccepted" />
            <span>
              I accept the
              <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Use &amp; Limitation of Liability</a>.
            </span>
          </label>

          <p v-if="error" class="ob-error">{{ error }}</p>

          <button type="button" class="ob-start" :disabled="!isValid || submitting" @click="submit">
            <span v-if="submitting" class="ob-spinner"></span>
            <span>{{ submitting ? 'Saving…' : 'Get started' }}</span>
            <svg v-if="!submitting" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ob-overlay {
  position: fixed; inset: 0; z-index: 320;
  background: rgba(15, 31, 46, 0.55); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 20px;
  animation: ob-fade 0.18s ease;
}
@keyframes ob-fade { from { opacity: 0 } to { opacity: 1 } }
.ob-box {
  position: relative; width: 500px; max-width: 96vw; max-height: 92dvh; overflow-y: auto;
  background: var(--white); border-radius: 16px;
  box-shadow: 0 24px 64px rgba(15, 31, 46, 0.28);
  font-family: 'Figtree', sans-serif; color: var(--ink);
  animation: ob-pop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes ob-pop { from { opacity: 0; transform: translateY(8px) scale(0.98) } to { opacity: 1; transform: none } }

.ob-hero { text-align: center; padding: 28px 28px 4px; }
.ob-badge {
  width: 48px; height: 48px; border-radius: 13px; margin: 0 auto 12px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, var(--teal-dark, #0369a1), var(--teal)); color: #fff;
  box-shadow: 0 8px 22px rgba(6, 182, 212, 0.35);
}
.ob-eyebrow { font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: var(--teal-mid); }
.ob-title { font-size: 1.35rem; font-weight: 800; color: var(--ink); margin: 5px 0 5px; line-height: 1.2; }
.ob-sub { font-size: 0.83rem; color: var(--ink-dim); line-height: 1.5; max-width: 360px; margin: 0 auto; }

.ob-body { padding: 18px 28px 26px; }

/* Audience toggle */
.ob-seg {
  display: flex; gap: 4px; padding: 4px; border-radius: 12px;
  background: var(--surface); border: 1.5px solid var(--border); margin-bottom: 18px;
}
.ob-seg-btn {
  flex: 1; padding: 9px 10px; border: none; border-radius: 9px; background: transparent;
  font-family: 'Figtree', sans-serif; font-size: 0.82rem; font-weight: 700; color: var(--ink-dim);
  cursor: pointer; transition: all 0.14s;
}
.ob-seg-btn.on { background: var(--white); color: var(--teal-mid); box-shadow: 0 1px 4px rgba(15, 31, 46, 0.1); }

/* Fields */
.ob-fields { display: flex; flex-direction: column; gap: 13px; }
.ob-field-row { display: flex; gap: 13px; }
.ob-field-row .ob-field { flex: 1; min-width: 0; }
.ob-field {
  display: flex;
  /* flex-direction: column; */
  flex-wrap: wrap;
  gap: 5px;
}
.ob-field label {flex: 1; font-size: 0.7rem; font-weight: 700; color: var(--ink-mid); }
.ob-opt { font-weight: 600; color: var(--ink-faint); text-transform: none; }
.ob-field input,
.ob-field select {
  width: 100%; border: 1.5px solid var(--border); border-radius: 9px; background: var(--white);
  color: var(--ink); font-family: 'Figtree', sans-serif; font-size: 0.86rem; padding: 10px 12px;
  outline: none; transition: border-color 0.14s;
}
.ob-field input:focus,
.ob-field select:focus { border-color: var(--teal-border); }

/* Terms */
.ob-terms {
  display: flex; align-items: flex-start; gap: 9px; margin: 18px 0 4px;
  font-size: 0.8rem; color: var(--ink-mid); line-height: 1.45; cursor: pointer;
}
.ob-terms input { margin-top: 2px; width: 16px; height: 16px; flex-shrink: 0; accent-color: var(--teal); cursor: pointer; }
.ob-terms a { color: var(--teal-mid); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
.ob-terms a:hover { color: var(--teal); }

.ob-error { color: var(--rose, #e11d48); font-size: 0.78rem; margin: 8px 0 0; font-weight: 600; }

.ob-start {
  width: 100%; margin-top: 16px; padding: 12px; border: none; border-radius: 11px;
  background: var(--teal); color: #fff; font-family: 'Figtree', sans-serif; font-size: 0.9rem; font-weight: 800;
  cursor: pointer; transition: all 0.14s; display: flex; align-items: center; justify-content: center; gap: 8px;
}
.ob-start:hover:not(:disabled) { background: var(--teal-mid); }
.ob-start:disabled { opacity: 0.5; cursor: not-allowed; }
.ob-spinner {
  width: 15px; height: 15px; border: 2px solid rgba(255, 255, 255, 0.4); border-top-color: #fff;
  border-radius: 50%; animation: ob-spin 0.7s linear infinite; display: inline-block;
}
@keyframes ob-spin { to { transform: rotate(360deg); } }
</style>
