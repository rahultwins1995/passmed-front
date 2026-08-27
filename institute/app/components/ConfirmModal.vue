<script setup lang="ts">
import { ref, watch } from 'vue'

// Styled replacement for native alert / confirm / prompt browser dialogs.
// Fully self-contained: scoped styles + CSS-var fallbacks, so it cannot
// affect any existing page styling. Rendered in-place with a fixed overlay.
const props = defineProps<{
  open: boolean
  message: string
  title?: string
  confirmLabel?: string
  danger?: boolean
  promptMode?: boolean
  promptPlaceholder?: string
}>()
const emit = defineEmits<{ (e: 'confirm', value?: string): void; (e: 'cancel'): void }>()

const promptValue = ref('')
watch(() => props.open, (o) => { if (o) promptValue.value = '' })

function onConfirm() {
  if (props.promptMode) {
    if (!promptValue.value.trim()) return
    emit('confirm', promptValue.value.trim())
  } else {
    emit('confirm')
  }
}
</script>

<template>
  <Transition name="cfm">
    <div v-if="open" class="cfm-overlay" @click.self="emit('cancel')">
      <div class="cfm-box" role="dialog" aria-modal="true" :aria-label="title || 'Confirm'">
        <div class="cfm-title">{{ title || 'Confirm' }}</div>
        <div class="cfm-msg">{{ message }}</div>
        <input
          v-if="promptMode"
          v-model="promptValue"
          class="cfm-input"
          :placeholder="promptPlaceholder || ''"
          @keydown.enter="onConfirm"
        />
        <div class="cfm-actions">
          <button type="button" class="cfm-btn" @click="emit('cancel')">Cancel</button>
          <button
            type="button"
            class="cfm-btn cfm-go"
            :class="{ 'cfm-danger': danger }"
            :disabled="promptMode && !promptValue.trim()"
            @click="onConfirm"
          >{{ confirmLabel || 'Confirm' }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cfm-overlay {
  position: fixed; inset: 0; z-index: 400;
  background: rgba(15, 31, 46, 0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.cfm-box {
  background: var(--white, #fff); border-radius: 12px; max-width: 420px; width: 100%;
  padding: 20px 22px; box-shadow: 0 24px 80px rgba(15, 31, 46, 0.3);
  font-family: 'Figtree', sans-serif;
}
.cfm-title { font-size: 0.95rem; font-weight: 800; color: var(--ink, #0f1f2e); margin-bottom: 8px; }
.cfm-msg { font-size: 0.8rem; color: var(--ink-mid, #475569); line-height: 1.55; white-space: pre-line; }
.cfm-input {
  width: 100%; box-sizing: border-box; margin-top: 12px; padding: 9px 11px;
  border: 1.5px solid var(--border, #e2e8f0); border-radius: 8px;
  font-family: inherit; font-size: 0.8rem; color: var(--ink, #0f1f2e);
}
.cfm-input:focus { outline: none; border-color: var(--teal, #06b6d4); }
.cfm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.cfm-btn {
  padding: 8px 16px; border-radius: 8px; font-family: inherit; font-size: 0.78rem; font-weight: 700;
  border: 1.5px solid var(--border, #e2e8f0); background: var(--white, #fff);
  color: var(--ink-mid, #475569); cursor: pointer; transition: all 0.13s;
}
.cfm-btn:hover { border-color: var(--ink-dim, #64748b); }
.cfm-go { background: var(--teal, #06b6d4); border-color: var(--teal, #06b6d4); color: #fff; }
.cfm-go:hover { filter: brightness(1.06); }
.cfm-go:disabled { opacity: 0.5; cursor: default; }
.cfm-danger { background: var(--rose, #e11d48); border-color: var(--rose, #e11d48); }
.cfm-enter-active, .cfm-leave-active { transition: opacity 0.16s ease; }
.cfm-enter-from, .cfm-leave-to { opacity: 0; }
</style>
