<!--
  Searchable flag combobox for the IMG Pathways picker.
  Emits `update:modelValue` (v-model) when a normal country is chosen and `pick`
  for "special" actions (e.g. "Request another destination…") that trigger a side
  effect without becoming the selection.

  Accessibility: WAI-ARIA combobox + listbox. The trigger button opens the panel
  (Enter/Space/↓); focus moves to the filter input, which drives arrow-key
  navigation over the options via aria-activedescendant, Enter to select, Escape
  to close. Options are role="option" with aria-selected. Styling (including the
  .hi active-option highlight) is provided by the parent page (.img-pathways).
-->
<script setup>
const props = defineProps({
  items: { type: Array, required: true }, // [{ id, name, flagCode?, emoji?, special? }]
  modelValue: { type: String, default: null },
  placeholder: { type: String, default: 'Select…' },
})
const emit = defineEmits(['update:modelValue', 'pick'])

const root = ref(null)
const triggerEl = ref(null)
const searchEl = ref(null)
const open = ref(false)
const search = ref('')
const active = ref(-1) // highlighted index into `filtered`

const uid = useId()
const listId = `${uid}-listbox`
const optId = (i) => `${uid}-opt-${i}`

// Self-hosted circle-flags SVGs (see frontend/public/flags).
const flagUrl = (c) => `/flags/${c}.svg`

const selected = computed(() =>
  props.items.find(it => it.id === props.modelValue && !it.special) || null
)
const filtered = computed(() => {
  const f = search.value.trim().toLowerCase()
  return props.items.filter(it => it.name.toLowerCase().includes(f))
})

function toggle () { open.value ? close() : openPanel() }
function openPanel () {
  open.value = true
  search.value = ''
  active.value = Math.max(0, filtered.value.findIndex(it => it.id === props.modelValue))
  nextTick(() => searchEl.value?.focus())
}
function close () { open.value = false }

function choose (it) {
  if (it.special) { close(); emit('pick', it.id); return } // special actions don't become the selection
  emit('update:modelValue', it.id)
  close()
}

function move (delta) {
  const n = filtered.value.length
  if (!n) { active.value = -1; return }
  active.value = active.value < 0 ? 0 : (active.value + delta + n) % n
}
function onTriggerKeydown (e) {
  if (!open.value && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault(); openPanel()
  }
}
function onSearchKeydown (e) {
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); move(1); break
    case 'ArrowUp': e.preventDefault(); move(-1); break
    case 'Home': e.preventDefault(); active.value = filtered.value.length ? 0 : -1; break
    case 'End': e.preventDefault(); active.value = filtered.value.length - 1; break
    case 'Enter':
      e.preventDefault()
      if (active.value >= 0 && filtered.value[active.value]) choose(filtered.value[active.value])
      break
    case 'Escape': e.preventDefault(); close(); triggerEl.value?.focus(); break
  }
}
// keep the highlight valid as the list filters, and scroll it into view
watch(filtered, () => { active.value = filtered.value.length ? 0 : -1 })
watch(active, (i) => {
  if (i < 0 || !import.meta.client) return
  nextTick(() => document.getElementById(optId(i))?.scrollIntoView({ block: 'nearest' }))
})

function onDocClick (e) {
  if (root.value && !root.value.contains(e.target)) close()
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="root" class="combo">
    <button
      ref="triggerEl"
      class="combo-btn" type="button" :class="{ open }"
      aria-haspopup="listbox" :aria-expanded="open" :aria-controls="listId"
      @click="toggle" @keydown="onTriggerKeydown"
    >
      <template v-if="selected">
        <span v-if="selected.emoji" class="femoji" aria-hidden="true">{{ selected.emoji }}</span>
        <img v-else class="flag" :src="flagUrl(selected.flagCode || selected.id)" alt="" loading="lazy">
        <span class="lbl">{{ selected.name }}</span>
      </template>
      <span v-else class="lbl ph">{{ placeholder }}</span>
      <span class="caret" aria-hidden="true">▾</span>
    </button>

    <div class="combo-panel" :class="{ open }">
      <input
        ref="searchEl"
        v-model="search"
        class="combo-search"
        type="text"
        role="combobox"
        :aria-expanded="open"
        :aria-controls="listId"
        :aria-activedescendant="active >= 0 ? optId(active) : undefined"
        aria-autocomplete="list"
        :aria-label="placeholder"
        placeholder="Search countries…"
        @keydown="onSearchKeydown"
      >
      <div :id="listId" class="combo-list" role="listbox">
        <template v-if="filtered.length">
          <div
            v-for="(it, i) in filtered"
            :id="optId(i)"
            :key="it.id"
            class="combo-opt"
            role="option"
            :aria-selected="modelValue === it.id"
            :class="{ special: it.special, sel: modelValue === it.id, hi: i === active }"
            @click="choose(it)"
            @mouseenter="active = i"
          >
            <span v-if="it.emoji" class="femoji sm" aria-hidden="true">{{ it.emoji }}</span>
            <img v-else class="flag sm" :src="flagUrl(it.flagCode || it.id)" alt="" loading="lazy">
            <span>{{ it.name }}</span>
            <span class="tick" aria-hidden="true">✓</span>
          </div>
        </template>
        <div v-else class="combo-none">No match</div>
      </div>
    </div>
  </div>
</template>
