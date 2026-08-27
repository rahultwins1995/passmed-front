<script setup lang="ts">
definePageMeta({ layout: 'student' })
useHead({ title: 'Help & Support · Passmed' })

const { toggle: toggleDark } = useDarkMode()
const { openMobile } = useSidebar()

const searchQuery = ref('')
const activeCategory = ref('all')

interface FAQ {
  q: string
  a: string
  cat: string // account | questions | billing | technical | other
}

// Live FAQs from the student help-FAQ API (published only).
const studentApi = useStudentApi()
const faqs = ref<FAQ[]>([])
const faqLoading = ref(true)
const faqError = ref(false)

// Questions are stored as HTML; strip tags for the collapsed title.
function stripHtml(s: string) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

async function fetchFaqs() {
  faqLoading.value = true
  faqError.value = false
  try {
    const res: any = await studentApi('/faqs', { query: { status: 1, limit: 100 } })
    if (res?.status === 'success' && Array.isArray(res.data)) {
      faqs.value = res.data.map((f: any) => ({
        q: stripHtml(f.question),
        a: f.answer ?? '',
        cat: f.type ?? 'other',
      }))
    } else {
      faqError.value = true
    }
  } catch (e) {
    log.error('student faq', 'faqs fetch failed', e)
    faqError.value = true
  } finally {
    faqLoading.value = false
  }
}
onMounted(fetchFaqs)

const openId = ref<number | null>(null)

const filtered = computed(() => {
  let items = activeCategory.value === 'all' ? faqs.value : faqs.value.filter(f => f.cat === activeCategory.value)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    items = items.filter(f => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q))
  }
  return items
})

function toggle(idx: number) {
  openId.value = openId.value === idx ? null : idx
}

// Contact form
const { user }    = useAuth()

const form = reactive({
  subject: '',
  // Pre-fill from the logged-in user; editable in case they want to use a different address.
  email:   computed(() => user.value?.email ?? ''),
  message: '',
})

const sent      = ref(false)
const sending   = ref(false)
const sendError = ref('')

async function sendMessage() {
  if (!form.subject || !form.message || !form.email) return
  sending.value   = true
  sendError.value = ''
  try {
    const res = await studentApi<any>('/support/contact', {
      method: 'POST',
      body: {
        subject: form.subject,
        email:   form.email,
        message: form.message,
      },
    })
    if (res?.status === 'success') {
      sent.value = true
    } else {
      sendError.value = res?.msg ?? 'Could not send message. Please try again.'
    }
  } catch (e: any) {
    sendError.value = e?.data?.msg ?? e?.message ?? 'Could not send message. Please try again.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <!-- TOPBAR -->
  <div class="topbar">
    <button type="button" class="mobile-menu-btn" @click="openMobile" aria-label="Open menu">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
    <div>
      <h1 v-if="!faqLoading">Help &amp; Support</h1>
      <div v-else class="sk-pulse" style="width:170px;height:22px;border-radius:6px;"></div>
    </div>
    <div class="tb-right">
      <button type="button" class="dm-btn" title="Toggle dark/light mode" @click="toggleDark" aria-label="Toggle dark mode">
        <svg class="icon-sun" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        <svg class="icon-moon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </button>
    </div>
  </div>

  <div class="content" style="padding:32px 36px">

    <!-- Full-page skeleton (hero + chips + list + contact) -->
    <div v-if="faqLoading">
      <div class="sk-pulse" style="width:100%;height:150px;border-radius:16px;margin-bottom:32px;"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px;">
        <div v-for="n in 5" :key="'csk' + n" class="sk-pulse" :style="{ width: (52 + n * 8) + 'px', height: '32px', borderRadius: '20px' }"></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:40px;">
        <div v-for="n in 6" :key="'lsk' + n" class="help-faq-item" style="padding:18px 20px;">
          <div class="sk-pulse" :style="{ width: (68 - n * 4) + '%', height: '14px', borderRadius: '6px' }"></div>
        </div>
      </div>
      <div style="max-width:480px;background:var(--surface);border:1.5px solid var(--border);border-radius:16px;padding:28px;">
        <div class="sk-pulse" style="width:140px;height:11px;border-radius:6px;margin-bottom:14px;"></div>
        <div class="sk-pulse" style="width:60%;height:18px;border-radius:6px;margin-bottom:20px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
          <div class="sk-pulse" style="height:40px;border-radius:9px;"></div>
          <div class="sk-pulse" style="height:40px;border-radius:9px;"></div>
        </div>
        <div class="sk-pulse" style="width:100%;height:96px;border-radius:9px;margin-bottom:18px;"></div>
        <div class="sk-pulse" style="width:130px;height:38px;border-radius:9px;"></div>
      </div>
    </div>

    <template v-else>

    <!-- HERO / SEARCH -->
    <div style="background:linear-gradient(135deg,#0f1f2e,#0e3a52);border-radius:16px;padding:36px;margin-bottom:32px;position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;background-image:radial-gradient(circle,rgba(103,232,249,0.06) 1px,transparent 1px);background-size:24px 24px;pointer-events:none;"></div>
      <div style="position:relative;z-index:1;max-width:560px;">
        <div style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:2.5px;color:var(--teal);margin-bottom:10px;">Help Centre</div>
        <h2 style="font-family:'Figtree',sans-serif;font-size:1.7rem;font-weight:800;color:#fff;margin-bottom:8px;line-height:1.2;">How can we help?</h2>
        <p style="font-size:0.88rem;color:rgba(255,255,255,0.5);margin-bottom:20px;">Search our FAQs or contact us directly.</p>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search FAQs…"
          style="width:100%;max-width:400px;background:rgba(255,255,255,0.08);border:1.5px solid rgba(255,255,255,0.12);border-radius:10px;padding:10px 14px;font-size:0.88rem;font-family:'Figtree',sans-serif;color:#fff;outline:none;box-sizing:border-box;"
          @focus="($event.target as HTMLInputElement).style.borderColor='var(--teal)'"
          @blur="($event.target as HTMLInputElement).style.borderColor='rgba(255,255,255,0.12)'"
        />
      </div>
    </div>

    <!-- CATEGORY CHIPS -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px;">
      <button type="button"
        v-for="cat in [
          { id:'all',       label:'All' },
          { id:'account',   label:'Account' },
          { id:'questions', label:'Questions & Sessions' },
          { id:'billing',   label:'Billing' },
          { id:'technical', label:'Technical' },
        ]"
        :key="cat.id"
        class="help-cat"
        :class="{ active: activeCategory === cat.id }"
        @click="activeCategory = cat.id; openId = null"
      >{{ cat.label }}</button>
    </div>

    <!-- FAQ LIST -->
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:40px;">
      <!-- Error -->
      <div v-if="faqError" style="padding:32px;text-align:center;color:var(--rose);font-size:0.88rem;">
        Couldn't load FAQs. <button type="button" @click="fetchFaqs" style="border:none;background:none;padding:0;margin-left:4px;color:var(--teal);font-weight:700;cursor:pointer;font-family:inherit;font-size:inherit;text-decoration:underline;">Retry</button>
      </div>

      <div v-else-if="filtered.length === 0" style="padding:32px;text-align:center;color:var(--ink-dim);font-size:0.88rem;">
        {{ faqs.length ? 'No FAQs match your search. Try a different term or contact us below.' : 'No FAQs available yet.' }}
      </div>

      <template v-else>
        <div
          v-for="(faq, idx) in filtered" :key="idx"
          class="help-faq-item"
        >
          <button type="button"
            class="help-faq-q"
            :class="{ open: openId === idx }"
            @click="toggle(idx)"
          >
            <span>{{ faq.q }}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div v-if="faq.a" class="help-faq-a" :class="{ open: openId === idx }" v-html="sanitizeHtml(faq.a)"></div>
        </div>
      </template>
    </div>

    <!-- CONTACT FORM -->
    <div style="max-width:480px;">
      <!-- Success state -->
      <div v-if="sent" style="background:var(--green-light);border:1.5px solid var(--green-border,#bbf7d0);border-radius:16px;padding:32px;text-align:center;">
        <div style="font-size:2rem;margin-bottom:12px;">✅</div>
        <div style="font-weight:700;color:var(--ink);margin-bottom:6px;">Message sent</div>
        <div style="font-size:0.84rem;color:var(--ink-mid);">We'll get back to you within a few hours.</div>
      </div>

      <!-- Form -->
      <div v-else style="background:var(--surface);border:1.5px solid var(--border);border-radius:16px;padding:28px;">
        <div style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:2.5px;color:var(--teal);margin-bottom:10px;">Still need help?</div>
        <div style="font-size:1.1rem;font-weight:800;color:var(--ink);margin-bottom:6px;">Contact Passmed</div>
        <div style="font-size:0.84rem;color:var(--ink-mid);margin-bottom:22px;">We typically respond within a few hours. Include as much detail as possible.</div>

        <!-- Subject + Email row -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
          <div>
            <label style="display:block;font-size:0.72rem;font-weight:700;color:var(--ink-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Subject</label>
            <select
              v-model="form.subject"
              style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;font-size:0.88rem;font-family:'Figtree',sans-serif;color:var(--ink);background:var(--surface);outline:none;cursor:pointer;"
              @focus="($event.target as HTMLSelectElement).style.borderColor='var(--teal)'"
              @blur="($event.target as HTMLSelectElement).style.borderColor='var(--border)'"
            >
              <option value="" disabled>Select a topic…</option>
              <option value="account">Account issue</option>
              <option value="billing">Billing / subscription</option>
              <option value="technical">Technical problem</option>
              <option value="content">Content / question error</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:0.72rem;font-weight:700;color:var(--ink-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Your email</label>
            <input
              v-model="form.email"
              type="email"
              placeholder="jamie.chen@hospital.edu"
              style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;font-size:0.88rem;font-family:'Figtree',sans-serif;color:var(--ink);background:var(--surface);outline:none;box-sizing:border-box;"
              @focus="($event.target as HTMLInputElement).style.borderColor='var(--teal)'"
              @blur="($event.target as HTMLInputElement).style.borderColor='var(--border)'"
            />
          </div>
        </div>

        <!-- Message -->
        <div style="margin-bottom:18px;">
          <label style="display:block;font-size:0.72rem;font-weight:700;color:var(--ink-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Message</label>
          <textarea
            v-model="form.message"
            placeholder="Describe your issue in as much detail as possible…"
            rows="5"
            style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;font-size:0.88rem;font-family:'Figtree',sans-serif;color:var(--ink);background:var(--surface);outline:none;resize:vertical;box-sizing:border-box;"
            @focus="($event.target as HTMLTextAreaElement).style.borderColor='var(--teal)'"
            @blur="($event.target as HTMLTextAreaElement).style.borderColor='var(--border)'"
          ></textarea>
        </div>

        <!-- Error -->
        <div v-if="sendError" style="margin-bottom:14px;padding:10px 14px;background:var(--rose-light);border:1.5px solid var(--rose-border);border-radius:9px;font-size:0.82rem;color:var(--rose);font-weight:600;">
          {{ sendError }}
        </div>

        <!-- Send button -->
        <button type="button"
          class="btn-primary"
          style="padding:10px 20px;font-size:0.88rem;display:inline-flex;align-items:center;gap:6px;"
          :disabled="sending || !form.subject || !form.message || !form.email"
          @click="sendMessage"
        >
          <svg v-if="sending" style="animation:spin 0.7s linear infinite;" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          {{ sending ? 'Sending…' : 'Send message' }}
          <svg v-if="!sending" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </div>
    </div>

    <div style="height:40px;"></div>
    </template>
  </div>
</template>