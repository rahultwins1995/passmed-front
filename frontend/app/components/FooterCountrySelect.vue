<script setup lang="ts">
const open = ref(false)
const btn = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLDivElement | null>(null)

type Market = { code: string; name: string; url: string; flag: string }

// Six markets. Order: Canada, US, UK, Australia, South Africa, Philippines.
// The current market (and its `active`/`aria-selected` row) is chosen dynamically
// from NUXT_PUBLIC_REGION via REGION_TO_CODE below, so each regional build shows
// itself as selected — not hardcoded to any one country.
const markets: Market[] = [
  { code: 'CA', name: 'Canada',         url: 'https://passmed.ca' },
  { code: 'US', name: 'United States',  url: 'https://www.passmed.com' },
  { code: 'GB', name: 'United Kingdom', url: 'https://www.passmed.uk' },
  { code: 'AU', name: 'Australia',      url: 'https://passamc.org' },
  { code: 'ZA', name: 'South Africa',   url: 'https://passmed.co.za' },
  { code: 'PH', name: 'Philippines',    url: 'https://passmed.ph' },
] as any

// Flag SVGs — circle-clipped country flags via SVG masks.
const flags: Record<string, string> = {
  CA: `<mask id="fopt-ca-m"><circle cx="256" cy="256" r="256" fill="#fff"/></mask><g mask="url(#fopt-ca-m)"><path fill="#d80027" d="M0 0v512h144l112-64 112 64h144V0H368L256 64 144 0Z"/><path fill="#eee" d="M144 0h224v512H144Z"/><path fill="#d80027" d="m301 289 44-22-22-11v-22l-45 22 23-44h-23l-22-34-22 33h-23l23 45-45-22v22l-22 11 45 22-12 23h45v33h22v-33h45z"/></g>`,
  US: `<mask id="fopt-us-m"><circle cx="256" cy="256" r="256" fill="#fff"/></mask><g mask="url(#fopt-us-m)"><path fill="#eee" d="M256 0h256v64l-32 32 32 32v64l-32 32 32 32v64l-32 32 32 32v64l-256 32L0 448v-64l32-32-32-32v-64z"/><path fill="#d80027" d="M224 64h288v64H224Zm0 128h288v64H256ZM0 320h512v64H0Zm0 128h512v64H0Z"/><path fill="#0052b4" d="M0 0h256v256H0Z"/><path fill="#eee" d="m187 243 57-41h-70l57 41-22-67zm-81 0 57-41H93l57 41-22-67zm-81 0 57-41H12l57 41-22-67zm162-81 57-41h-70l57 41-22-67zm-81 0 57-41H93l57 41-22-67zm-81 0 57-41H12l57 41-22-67Zm162-82 57-41h-70l57 41-22-67Zm-81 0 57-41H93l57 41-22-67zm-81 0 57-41H12l57 41-22-67Z"/></g>`,
  GB: `<mask id="fopt-gb-m"><circle cx="256" cy="256" r="256" fill="#fff"/></mask><g mask="url(#fopt-gb-m)"><path fill="#eee" d="m0 0 8 22-8 23v23l32 54-32 54v32l32 48-32 48v32l32 54-32 54v68l22-8 23 8h23l54-32 54 32h32l48-32 48 32h32l54-32 54 32h68l-8-22 8-23v-23l-32-54 32-54v-32l-32-48 32-48v-32l-32-54 32-54V0l-22 8-23-8h-23l-54 32-54-32h-32l-48 32-48-32h-32l-54 32L68 0H0z"/><path fill="#0052b4" d="M336 0v108L444 0Zm176 68L404 176h108zM0 176h108L0 68ZM68 0l108 108V0Zm108 512V404L68 512ZM0 444l108-108H0Zm512-108H404l108 108Zm-68 176L336 404v108z"/><path fill="#d80027" d="M0 0v45l131 131h45L0 0zm208 0v208H0v96h208v208h96V304h208v-96H304V0h-96zm259 0L336 131v45L512 0h-45zM176 336 0 512h45l131-131v-45zm160 0 176 176v-45L381 336h-45z"/></g>`,
  AU: `<mask id="fopt-au-m"><circle cx="256" cy="256" r="256" fill="#fff"/></mask><g mask="url(#fopt-au-m)"><path fill="#0052b4" d="M0 0h512v512H0z"/><path fill="#eee" d="m154 300 14 30 32-8-14 30 25 20-32 7 1 33-26-21-26 21 1-33-33-7 26-20-14-30 32 8zm222-27h47l-38 27 15-44 14 44zm7-162 7 15 16-4-7 15 12 10-15 3v17l-13-11-13 11v-17l-15-3 12-10-7-15 16 4zm57 67 7 15 16-4-7 15 12 10-15 3v16l-13-10-13 11v-17l-15-3 12-10-7-15 16 4zm-122 22 7 15 16-4-7 15 12 10-15 3v16l-13-10-13 11v-17l-15-3 12-10-7-15 16 4zm65 156 7 15 16-4-7 15 12 10-15 3v17l-13-11-13 11v-17l-15-3 12-10-7-15 16 4zM0 0v32l32 32L0 96v160h32l32-32 32 32h32v-83l83 83h45l-8-16 8-15v-14l-83-83h83V96l-32-32 32-32V0H96L64 32 32 0Z"/><path fill="#d80027" d="M32 0v32H0v64h32v160h64V96h160V32H96V0Zm96 128 128 128v-31l-97-97z"/></g>`,
  ZA: `<mask id="fopt-za-m"><circle cx="256" cy="256" r="256" fill="#fff"/></mask><g mask="url(#fopt-za-m)"><path fill="#eee" d="m0 0 192 256L0 512h47l465-189v-34l-32-33 32-33v-34L47 0Z"/><path fill="#333" d="M0 142v228l140-114z"/><path fill="#ffda44" d="M192 256 0 95v47l114 114L0 370v47z"/><path fill="#6da544" d="M512 223H223L0 0v94l161 162L0 418v94l223-223h289z"/><path fill="#d80027" d="M512 0H47l189 189h276z"/><path fill="#0052b4" d="M512 512H47l189-189h276z"/></g>`,
  PH: `<mask id="fopt-ph-m"><circle cx="256" cy="256" r="256" fill="#fff"/></mask><g mask="url(#fopt-ph-m)"><path fill="#0052b4" d="M0 0h512v256l-265 45.2z"/><path fill="#d80027" d="M210 256h302v256H0z"/><path fill="#eee" d="M0 0v512l256-256z"/><path fill="#ffda44" d="M175.3 256 144 241.3l16.7-30.3-34 6.5-4.3-34.3-23.6 25.2L75 183.2l-4.3 34.3-34-6.5 16.7 30.3L22.3 256l31.2 14.7L37 301l34-6.5 4.2 34.3 23.7-25.2 23.6 25.2 4.3-34.3 34 6.5-16.7-30.3z"/></g>`,
}

// Pin the "current" market from NUXT_PUBLIC_REGION so every regional build shows
// itself as selected (US → US, SA → ZA, UK → GB, …). Falls back to US.
const REGION_TO_CODE: Record<string, string> = { US: 'US', SA: 'ZA', UK: 'GB', CA: 'CA', AU: 'AU', PH: 'PH' }
const regionCode = useRegion()
const currentMarket = markets.find(m => m.code === (REGION_TO_CODE[regionCode] || 'US')) || markets.find(m => m.code === 'US')!

function optionLinks(): HTMLAnchorElement[] {
  return Array.from(menu.value?.querySelectorAll('a.footer-country-opt') || []) as HTMLAnchorElement[]
}
function focusFirstOption() {
  nextTick(() => optionLinks()[0]?.focus())
}
function toggle() {
  open.value = !open.value
  if (open.value) focusFirstOption()
}
function openMenu() {
  if (!open.value) { open.value = true; focusFirstOption() }
}

// Arrow-key navigation between options (makes the ARIA listbox actually operable
// by keyboard, not just labelled as one).
function onMenuKey(ev: KeyboardEvent) {
  if (!open.value) return
  const items = optionLinks()
  if (!items.length) return
  const idx = items.indexOf(document.activeElement as HTMLAnchorElement)
  switch (ev.key) {
    case 'ArrowDown': ev.preventDefault(); (items[idx + 1] || items[0]).focus(); break
    case 'ArrowUp':   ev.preventDefault(); (items[idx - 1] || items[items.length - 1]).focus(); break
    case 'Home':      ev.preventDefault(); items[0].focus(); break
    case 'End':       ev.preventDefault(); items[items.length - 1].focus(); break
  }
}

function onDocClick(ev: MouseEvent) {
  if (!open.value) return
  const target = ev.target as Node
  if (btn.value?.contains(target) || menu.value?.contains(target)) return
  open.value = false
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && open.value) {
    open.value = false
    btn.value?.focus()
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="footer-country-select">
    <button
      ref="btn"
      type="button"
      class="footer-country-btn"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="listbox"
      aria-label="Change country"
      @click="toggle"
      @keydown.down.prevent="openMenu"
    >
      <span class="footer-country-btn-flag" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" v-html="flags[currentMarket.code]" />
      </span>
      <span class="footer-country-btn-label">{{ currentMarket.name }}</span>
      <span class="footer-country-btn-chev" aria-hidden="true">▾</span>
    </button>

    <div
      ref="menu"
      class="footer-country-menu"
      :class="{ open }"
      role="listbox"
      @keydown="onMenuKey"
    >
      <template v-for="m in markets" :key="m.code">
        <span
          v-if="m.code === currentMarket.code"
          class="footer-country-opt active"
          role="option"
          aria-selected="true"
        >
          <span class="footer-country-opt-flag" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" v-html="flags[m.code]" />
          </span>
          <span class="footer-country-opt-name">{{ m.name }}</span>
          <svg class="footer-country-opt-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </span>
        <a
          v-else
          class="footer-country-opt"
          :href="m.url"
          role="option"
          rel="alternate"
        >
          <span class="footer-country-opt-flag" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" v-html="flags[m.code]" />
          </span>
          <span class="footer-country-opt-name">{{ m.name }}</span>
        </a>
      </template>
    </div>
  </div>
</template>

<style scoped>
.footer-country-select { position: relative; }
.footer-country-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px 7px 9px;
  background: rgba(255,255,255,0.06);
  border: 0.5px solid rgba(255,255,255,0.16);
  border-radius: 999px;
  color: white;
  font-family: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.18s, border-color 0.18s;
}
.footer-country-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.28); }
.footer-country-btn[aria-expanded="true"] { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.32); }
.footer-country-btn-flag { width: 18px; height: 18px; flex-shrink: 0; display: inline-flex; }
.footer-country-btn-flag svg { width: 100%; height: 100%; display: block; }
.footer-country-btn-label { font-weight: 500; letter-spacing: 0.01em; }
.footer-country-btn-chev { font-size: 9px; opacity: 0.6; transition: transform 0.18s; }
.footer-country-btn[aria-expanded="true"] .footer-country-btn-chev { transform: rotate(180deg); }

.footer-country-menu {
  display: none;
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  width: 220px;
  background: #fff;
  border: 0.5px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 -8px 32px rgba(0,0,0,0.18), 0 -2px 12px rgba(0,0,0,0.06);
  padding: 8px;
  z-index: 100;
}
.footer-country-menu.open { display: block; }

.footer-country-opt {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  text-decoration: none;
  color: #0f1f2e;
  cursor: pointer;
  transition: background 0.14s;
}
.footer-country-opt:hover:not(.active) { background: #f7fbfd; }
.footer-country-opt.active { background: #ecfeff; cursor: default; }
.footer-country-opt-flag { width: 20px; height: 20px; flex-shrink: 0; display: inline-flex; }
.footer-country-opt-flag svg { width: 100%; height: 100%; display: block; }
.footer-country-opt-name { flex: 1; font-size: 0.83rem; font-weight: 500; color: #0f1f2e; letter-spacing: -0.005em; }
.footer-country-opt-check { color: #06b6d4; flex-shrink: 0; }

@media (max-width: 700px) {
  .footer-country-menu { right: auto; left: 0; width: 240px; }
}
</style>
