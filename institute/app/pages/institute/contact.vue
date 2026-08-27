<script setup lang="ts">
// /institute/contact — support cards + message form wired to
// POST /api-institute/v1/messages/send (category + message; the backend
// identifies the sender from the auth session).
import { ref, watch, onMounted } from 'vue'
const { instName, userName, userEmail } = useInstitution()

// Ensure the sender fields prefill even if the sidebar's /profile fetch
// hasn't completed yet — and drive the form skeleton while loading.
const profileLoading = ref(false)
onMounted(async () => {
  if (userName.value && userEmail.value) return
  profileLoading.value = true
  try {
    const api = useInstituteApi()
    const res: any = await api('/profile')
    if (res?.status === 'success') {
      if (!userName.value)  userName.value  = res.data.user?.name  ?? ''
      if (!userEmail.value) userEmail.value = res.data.user?.email ?? ''
    }
  } catch (e) {
    logError('[contact] /profile fetch failed', e)
  } finally {
    profileLoading.value = false
  }
})

definePageMeta({ layout: 'institute' })
useHead({ title: 'Contact Passmed · Institute' })

const cards = [
  { icon: '📧', title: 'Email support',  desc: 'institutions@passmed.com',         kind: 'email' as const },
]

const form = ref({
  name: '',
  email: '',
  category: 'Technical issue',
  message: '',
})

// Prefill the sender fields from the shared profile state (populated by the
// sidebar's /profile fetch) — never hardcoded demo names. The backend derives
// the actual sender from the auth session; these fields are informational.
watch([userName, userEmail], ([n, e]) => {
  if (n && !form.value.name)  form.value.name  = n
  if (e && !form.value.email) form.value.email = e
}, { immediate: true })

const toast = ref<{ text: string; color: string } | null>(null)
function showToast(text: string, color: string) {
  toast.value = { text, color }
  setTimeout(() => { toast.value = null }, 2400)
}

const msgRef = ref<HTMLTextAreaElement | null>(null)
function handleCard(kind: 'email') {
  if (!import.meta.client) return
  if (kind === 'email') { window.location.href = 'mailto:institutions@passmed.com?subject=Institution%20Support' }
}

const sending = ref(false)
async function sendMessage() {
  const message = form.value.message.trim()
  if (!message) { showToast('Please enter a message first', 'var(--amber)'); return }
  sending.value = true
  try {
    const api = useInstituteApi()
    const res: any = await api('/messages/send', {
      method: 'POST',
      body: {
        category: form.value.category,
        message,
        name:  form.value.name.trim(),
        email: form.value.email.trim(),
      },
    })
    if (res?.status === 'success') {
      showToast("Message sent — we'll be in touch soon", 'var(--teal)')
      form.value.message = ''
    } else {
      showToast(res?.msg || 'Failed to send message — try again', 'var(--rose)')
    }
  } catch (e: any) {
    logError('[contact] /messages/send failed', e)
    showToast(e?.data?.msg || 'Failed to send message — try again', 'var(--rose)')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="main">

    <div class="content">

      <!-- Full-page skeleton while the profile prefill loads (topbar stays) -->
      <div v-if="profileLoading" style="max-width:680px;">
        <div style="margin-bottom:24px;">
          <div class="ct-sk" style="width:240px;height:22px;margin-bottom:10px;"></div>
          <div class="ct-sk" style="width:340px;height:11px;"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:24px;max-width:320px;">
          <div v-for="i in 1" :key="i" class="card" style="text-align:center;">
            <div class="ct-sk" style="width:34px;height:34px;border-radius:9px;margin:0 auto 10px;"></div>
            <div class="ct-sk" style="width:60%;height:11px;margin:0 auto 6px;"></div>
            <div class="ct-sk" style="width:80%;height:9px;margin:0 auto;"></div>
          </div>
        </div>
        <div class="card">
          <div class="ct-sk" style="width:120px;height:10px;margin-bottom:16px;"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
            <div><div class="ct-sk" style="width:34%;height:10px;margin-bottom:8px;"></div><div class="ct-sk" style="width:100%;height:36px;"></div></div>
            <div><div class="ct-sk" style="width:22%;height:10px;margin-bottom:8px;"></div><div class="ct-sk" style="width:100%;height:36px;"></div></div>
          </div>
          <div style="margin-bottom:14px;"><div class="ct-sk" style="width:18%;height:10px;margin-bottom:8px;"></div><div class="ct-sk" style="width:100%;height:36px;"></div></div>
          <div><div class="ct-sk" style="width:16%;height:10px;margin-bottom:8px;"></div><div class="ct-sk" style="width:100%;height:110px;"></div></div>
        </div>
      </div>

      <div v-else style="animation:fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both;max-width:680px;">
        <div class="page-header" style="margin-bottom:24px;">
          <div>
            <div class="page-title">Contact Passmed</div>
            <div class="page-sub">Institutional support · typically responds within 4 business hours</div>
          </div>
        </div>

        <!-- Contact methods -->
        <div style="display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:24px;max-width:320px;">
          <div
            v-for="c in cards"
            :key="c.title"
            class="card contact-card"
            @click="handleCard(c.kind)"
          >
            <div style="font-size:1.6rem;margin-bottom:8px;">{{ c.icon }}</div>
            <div style="font-size:0.8rem;font-weight:800;color:var(--ink);margin-bottom:4px;">{{ c.title }}</div>
            <div style="font-size:0.68rem;color:var(--ink-dim);">{{ c.desc }}</div>
          </div>
        </div>

        <!-- Message form -->
        <div class="card">
          <div style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--ink-dim);margin-bottom:16px;">Send a message</div>
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div>
                <label class="fld-label">Your name</label>
                <input v-model="form.name" type="text" class="fld" />
              </div>
              <div>
                <label class="fld-label">Email</label>
                <input v-model="form.email" type="email" class="fld" />
              </div>
            </div>
            <div>
              <label class="fld-label">Category</label>
              <select v-model="form.category" class="fld" style="background:var(--white);">
                <option>Technical issue</option>
                <option>Billing enquiry</option>
                <option>Question bank / content</option>
                <option>Feature request</option>
                <option>Seat management</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label class="fld-label">Message</label>
              <textarea ref="msgRef" v-model="form.message" rows="5" placeholder="Describe your issue or question in detail…" class="fld" style="resize:none;line-height:1.6;"></textarea>
            </div>
            <div style="display:flex;justify-content:flex-end;">
              <button type="button" @click="sendMessage" class="btn-primary" :disabled="sending || !form.message.trim()" :style="sending || !form.message.trim() ? 'opacity:0.6;cursor:default' : ''">
                {{ sending ? 'Sending…' : 'Send message' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <Transition name="toast">
      <div
        v-if="toast"
        class="contact-toast"
        :style="{ background: toast.color }"
      >{{ toast.text }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.contact-card {
  text-align: center; cursor: pointer;
  transition: box-shadow .15s;
}
.contact-card:hover { box-shadow: 0 4px 20px rgba(15,31,46,0.08); }

.fld-label {
  font-size: 0.72rem; font-weight: 700;
  color: var(--ink-mid); display: block; margin-bottom: 6px;
}
.fld {
  width: 100%; padding: 9px 12px;
  border: 1.5px solid var(--border); border-radius: 9px;
  font-family: Figtree, sans-serif; font-size: 0.8rem; color: var(--ink);
  /* Explicit background so dark mode doesn't fall back to UA white (which left
     the light var(--ink) text invisible). --white flips under body.dark. */
  background: var(--white);
  outline: none; box-sizing: border-box;
  transition: border-color .15s;
}
.fld:focus { border-color: var(--teal); }

.btn-primary {
  padding: 9px 24px; border-radius: 9px; border: none;
  background: var(--teal); color: #fff;
  font-family: Figtree, sans-serif; font-size: 0.8rem; font-weight: 800;
  cursor: pointer;
}

.ct-sk {
  background: var(--border);
  border-radius: 6px;
  animation: ctPulse 1.2s ease-in-out infinite;
}
@keyframes ctPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }

.contact-toast {
  position: fixed; bottom: 32px; right: 32px;
  padding: 11px 18px; border-radius: 9px;
  color: #fff; font-family: Figtree, sans-serif;
  font-size: 0.78rem; font-weight: 700;
  box-shadow: 0 8px 32px rgba(0,0,0,0.16);
  z-index: 9999;
}
.toast-enter-active,
.toast-leave-active { transition: opacity .2s, transform .2s; }
.toast-enter-from,
.toast-leave-to { opacity: 0; transform: translateY(8px); }
</style>
