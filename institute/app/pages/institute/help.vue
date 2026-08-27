<script setup lang="ts">
// /institute/help — help & FAQs with category filter and expandable answers.
import { computed, ref, onMounted } from 'vue'
const { instName } = useInstitution()
const api = useInstituteApi()

definePageMeta({ layout: 'institute' })
useHead({ title: 'Help & FAQs · Passmed Institute' })

const router = useRouter()

// Live FAQs from the institute help-FAQ API (published only).
type Faq = { id: number; q: string; a: string }
const faqs = ref<Faq[]>([])
const loading = ref(true)
const loadError = ref(false)

// Questions/answers are stored as HTML; strip tags for the collapsed title.
function stripHtml(s: string) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

async function fetchFaqs() {
  loading.value = true
  loadError.value = false
  try {
    const res: any = await api('/faqs', { query: { status: 1, limit: 100 } })
    if (res?.status === 'success' && Array.isArray(res.data)) {
      faqs.value = res.data.map((f: any) => ({
        id: Number(f.id),
        q: stripHtml(f.question),
        a: f.answer ?? '',
      }))
    } else {
      loadError.value = true
    }
  } catch (e) {
    logError('[institute help] faqs fetch failed', e)
    loadError.value = true
  } finally {
    loading.value = false
  }
}
onMounted(fetchFaqs)

const query = ref('')
const openIdx = ref<number | null>(null)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = faqs.value.map((f, i) => ({ ...f, i }))
  if (!q) return list
  return list.filter(f => f.q.toLowerCase().includes(q))
})

const subText = computed(() => {
  const q = query.value.trim()
  if (!q) return 'Answers to common questions about the institution dashboard'
  return `${filtered.value.length} of ${faqs.value.length} questions match "${q}"`
})

function toggle(i: number) {
  openIdx.value = openIdx.value === i ? null : i
}

function goContact() {
  router.push('/institute/contact')
}
</script>

<template>
  <div class="main">

    <div class="content">

      <!-- Full-page skeleton (topbar stays) -->
      <div v-if="loading" style="max-width:760px;">
        <div style="margin-bottom:24px;">
          <div class="faq-sk" style="width:220px;height:22px;margin-bottom:10px;"></div>
          <div class="faq-sk" style="width:360px;height:12px;"></div>
        </div>
        <div class="faq-sk" style="width:100%;height:44px;border-radius:var(--r-lg);margin-bottom:20px;"></div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div v-for="n in 6" :key="'sk' + n" class="faq-item" style="background:var(--white);border:1.5px solid var(--border);border-radius:var(--r-lg);padding:16px 18px;">
            <div class="faq-sk" :style="{ width: (70 - n * 4) + '%', height: '13px' }"></div>
          </div>
        </div>
      </div>

      <div v-else style="animation:fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both;max-width:760px;">
        <div class="page-header" style="margin-bottom:24px;">
          <div>
            <div class="page-title">Help &amp; FAQs</div>
            <div class="page-sub">{{ subText }}</div>
          </div>
          <button type="button"
            class="help-contact-btn"
            @click="goContact"
          >Contact Passmed →</button>
        </div>

        <!-- Search -->
        <div style="position:relative;margin-bottom:20px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-dim)" stroke-width="2" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);pointer-events:none;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            v-model="query"
            type="text"
            placeholder="Search FAQs…"
            class="help-search"
          />
        </div>

        <!-- FAQs -->
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;">
          <!-- Error -->
          <div v-if="loadError" style="padding:24px;text-align:center;color:var(--rose);font-size:0.8rem;">
            Couldn't load FAQs. <button type="button" class="faq-retry" @click="fetchFaqs">Retry</button>
          </div>

          <template v-else>
          <div
            v-for="f in filtered"
            :key="f.i"
            class="faq-item"
            style="background:var(--white);border:1.5px solid var(--border);border-radius:var(--r-lg);overflow:hidden;transition:border-color 0.13s;"
          >
            <button type="button"
              class="faq-toggle"
              @click="toggle(f.i)"
             aria-label="Toggle answer">
              <span style="font-size:0.82rem;font-weight:700;color:var(--ink);">{{ f.q }}</span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="var(--ink-dim)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                :style="{ flexShrink: 0, transition: 'transform 0.2s', transform: openIdx === f.i ? 'rotate(180deg)' : '' }"
              ><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div v-if="openIdx === f.i" style="padding:0 18px 16px;">
              <div class="faq-answer" style="font-size:0.78rem;color:var(--ink-mid);line-height:1.7;border-top:1px solid var(--border);padding-top:12px;" v-html="sanitizeHtml(f.a)"></div>
            </div>
          </div>
          <div v-if="!filtered.length" style="padding:24px;text-align:center;color:var(--ink-dim);font-size:0.78rem;">
            {{ faqs.length ? 'No FAQs match your search.' : 'No FAQs available yet.' }}
          </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.help-contact-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 9px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.76rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer;
  transition: border-color .15s, color .15s;
}
.help-contact-btn:hover { border-color: var(--teal-border); color: var(--teal); }

.help-search {
  width: 100%; padding: 11px 14px 11px 38px;
  border: 1.5px solid var(--border); border-radius: var(--r-lg);
  font-family: Figtree, sans-serif; font-size: 0.82rem; color: var(--ink);
  /* Explicit background so dark mode doesn't fall back to UA white (which left
     the light var(--ink) text invisible). --white flips under body.dark. */
  background: var(--white);
  outline: none; box-sizing: border-box;
  transition: border-color .15s;
}
.help-search:focus { border-color: var(--teal); }

.faq-toggle {
  width: 100%; display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 14px 18px;
  background: none; border: none; cursor: pointer;
  font-family: Figtree, sans-serif; text-align: left;
}

.faq-sk {
  background: var(--surface-2, #e5e7eb); border-radius: 6px;
  animation: faqPulse 1.2s ease-in-out infinite;
}
@keyframes faqPulse { 0%, 100% { opacity: 0.85; } 50% { opacity: 0.5; } }

.faq-retry {
  border: none; background: none; padding: 0; margin-left: 4px;
  color: var(--teal); font-weight: 700; cursor: pointer;
  font-family: Figtree, sans-serif; font-size: 0.8rem;
  text-decoration: underline;
}

/* Answer HTML from the API — keep spacing tidy */
.faq-answer :deep(p) { margin: 0 0 8px; }
.faq-answer :deep(p:last-child) { margin-bottom: 0; }
.faq-answer :deep(ul), .faq-answer :deep(ol) { margin: 0 0 8px; padding-left: 20px; }
.faq-answer :deep(a) { color: var(--teal); }
</style>
