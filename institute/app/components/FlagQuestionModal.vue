<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

// "Flag for review" dialog: pick a reason (required) and add an optional note.
// The flag goes to the question's OWNER — this institution's Flagged list for
// its own questions, the contributing institution (and PassMed admin) for a
// shared-pool question.
const props = defineProps<{
  open: boolean
  owned?: boolean
  busy?: boolean
}>()
const emit = defineEmits<{
  (e: 'submit', value: { reason: string; note: string }): void
  (e: 'cancel'): void
}>()

// Must match Api_institute_questionController::FLAG_REASONS.
const REASONS = [
  'Incorrect answer',
  'Outdated guidance',
  'Typo / formatting',
  'Unclear question stem',
  'Other',
]

const reason = ref('')
const note = ref('')
const firstRadio = ref<HTMLInputElement | null>(null)

watch(() => props.open, async (o) => {
  if (!o) return
  reason.value = ''
  note.value = ''
  await nextTick()
  firstRadio.value?.focus()
})

function submit() {
  if (!reason.value || props.busy) return
  emit('submit', { reason: reason.value, note: note.value.trim() })
}
</script>

<template>
  <Transition name="fq">
    <div v-if="open" class="fq-overlay" @click.self="emit('cancel')" @keydown.esc="emit('cancel')">
      <div class="fq-box" role="dialog" aria-modal="true" aria-label="Flag question for review">
        <div class="fq-title">Flag for review</div>
        <div class="fq-msg">
          {{ owned
            ? 'This flag will appear in your Flagged list so your team can review and fix the question.'
            : 'This question belongs to another institution. Your flag is sent to them and to the Passmed team to review.' }}
        </div>

        <div class="fq-label">Reason</div>
        <div class="fq-reasons" role="radiogroup" aria-label="Reason">
          <label v-for="(r, i) in REASONS" :key="r" class="fq-reason" :class="{ on: reason === r }">
            <input
              :ref="el => { if (i === 0) firstRadio = el as HTMLInputElement }"
              v-model="reason" type="radio" name="fq-reason" :value="r"
            />
            <span>{{ r }}</span>
          </label>
        </div>

        <div class="fq-label">Note <span class="fq-opt">(optional)</span></div>
        <textarea v-model="note" class="fq-note" rows="3" maxlength="1000"
          placeholder="What's wrong, and what should it say?" />

        <div class="fq-actions">
          <button type="button" class="fq-btn" @click="emit('cancel')">Cancel</button>
          <button type="button" class="fq-btn fq-go" :disabled="!reason || busy" @click="submit">
            {{ busy ? 'Flagging…' : 'Flag question' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fq-overlay {
  position: fixed; inset: 0; z-index: 400;
  background: rgba(15, 31, 46, 0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.fq-box {
  background: var(--white, #fff); border-radius: 12px; max-width: 440px; width: 100%;
  padding: 20px 22px; box-shadow: 0 24px 80px rgba(15, 31, 46, 0.3);
  font-family: 'Figtree', sans-serif;
}
.fq-title { font-size: 0.95rem; font-weight: 800; color: var(--ink, #0f1f2e); margin-bottom: 6px; }
.fq-msg { font-size: 0.76rem; color: var(--ink-mid, #475569); line-height: 1.5; }
.fq-label {
  margin: 16px 0 8px; font-size: 0.62rem; font-weight: 800; letter-spacing: 1px;
  text-transform: uppercase; color: var(--ink-dim, #64748b);
}
.fq-opt { text-transform: none; letter-spacing: 0; font-weight: 600; }
.fq-reasons { display: flex; flex-direction: column; gap: 6px; }
.fq-reason {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
  padding: 8px 10px; border-radius: 8px; border: 1.5px solid var(--border, #e2e8f0);
  font-size: 0.78rem; color: var(--ink, #0f1f2e);
}
.fq-reason.on { border-color: var(--amber-border, #fcd34d); background: var(--amber-light, #fffbeb); }
.fq-reason input { accent-color: var(--amber, #d97706); margin: 0; }
.fq-note {
  width: 100%; box-sizing: border-box; padding: 9px 11px; resize: vertical;
  border: 1.5px solid var(--border, #e2e8f0); border-radius: 8px;
  font-family: inherit; font-size: 0.78rem; color: var(--ink, #0f1f2e); background: var(--white, #fff);
}
.fq-note:focus { outline: none; border-color: var(--teal, #06b6d4); }
.fq-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.fq-btn {
  padding: 8px 16px; border-radius: 8px; font-family: inherit; font-size: 0.78rem; font-weight: 700;
  border: 1.5px solid var(--border, #e2e8f0); background: var(--white, #fff);
  color: var(--ink-mid, #475569); cursor: pointer;
}
.fq-go { background: var(--amber, #d97706); border-color: var(--amber, #d97706); color: #fff; }
.fq-go:disabled { opacity: 0.5; cursor: default; }
.fq-enter-active, .fq-leave-active { transition: opacity 0.16s ease; }
.fq-enter-from, .fq-leave-to { opacity: 0; }
</style>
