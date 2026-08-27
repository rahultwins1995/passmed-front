<!--
  SessionCalcModal.vue
  PERF FIX 3: Extracted from tutor.vue so Vite can split this into a separate
  chunk. Calculator state + logic live here now — tutor.vue no longer carries
  calcExpr/calcVal/calcMem/calcAct/calcMemAct in its main bundle.
  Only downloaded + parsed the first time "Calc" is clicked.
-->
<script setup lang="ts">
defineProps<{ show: boolean }>()
defineEmits<{ (e: 'close'): void }>()

// Calculator state — self-contained inside this async chunk
const calcExpr = ref('')
const calcVal  = ref('0')
const calcMem  = ref(0)

function calcAct(k: string) {
  if (k === 'AC')  { calcExpr.value = ''; calcVal.value = '0'; return }
  if (k === 'DEL') { calcExpr.value = calcExpr.value.slice(0, -1); if (!calcExpr.value) calcVal.value = '0'; return }
  if (k === '+/-') { try { calcVal.value = String(-parseFloat(calcVal.value)); calcExpr.value = calcVal.value } catch {} return }
  if (k === '%')   { calcExpr.value += '%'; return }
  if (k === '=') {
    try {
      calcVal.value  = String(Function('"use strict";return (' + calcExpr.value.replace(/%/g, '/100') + ')')())
      calcExpr.value = calcVal.value
    } catch { calcVal.value = 'Error' }
    return
  }
  calcExpr.value += k
  try { calcVal.value = String(Function('"use strict";return (' + calcExpr.value.replace(/%/g, '/100') + ')')()) } catch {}
}

function calcMemAct(a: string) {
  if      (a === 'mc') calcMem.value = 0
  else if (a === 'mr') calcExpr.value += String(calcMem.value)
  else if (a === 'm+') { try { calcMem.value += parseFloat(calcVal.value) } catch {} }
  else if (a === 'm-') { try { calcMem.value -= parseFloat(calcVal.value) } catch {} }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="overlay open" @click.self="$emit('close')">
      <div class="modal-box" style="width:300px;max-width:95vw">
        <div class="m-head">
          <div class="m-title">Calculator</div>
          <button type="button" class="m-close" @click="$emit('close')" aria-label="Close">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="calc-body">
          <div class="calc-display">
            <div class="calc-expr">{{ calcExpr }}</div>
            <div class="calc-val">{{ calcVal }}</div>
          </div>
          <div class="calc-memory">
            <button type="button" class="calc-btn" @click="calcMemAct('mc')">MC</button>
            <button type="button" class="calc-btn" @click="calcMemAct('mr')">MR</button>
            <button type="button" class="calc-btn" @click="calcMemAct('m+')">M+</button>
            <button type="button" class="calc-btn" @click="calcMemAct('m-')">M−</button>
          </div>
          <div class="calc-grid">
            <button type="button" class="calc-btn clr" @click="calcAct('AC')">AC</button>
            <button type="button" class="calc-btn clr" @click="calcAct('DEL')">⌫</button>
            <button type="button" class="calc-btn op"  @click="calcAct('%')">%</button>
            <button type="button" class="calc-btn op"  @click="calcAct('/')">÷</button>
            <button type="button" class="calc-btn"     @click="calcAct('7')">7</button>
            <button type="button" class="calc-btn"     @click="calcAct('8')">8</button>
            <button type="button" class="calc-btn"     @click="calcAct('9')">9</button>
            <button type="button" class="calc-btn op"  @click="calcAct('*')">×</button>
            <button type="button" class="calc-btn"     @click="calcAct('4')">4</button>
            <button type="button" class="calc-btn"     @click="calcAct('5')">5</button>
            <button type="button" class="calc-btn"     @click="calcAct('6')">6</button>
            <button type="button" class="calc-btn op"  @click="calcAct('-')">−</button>
            <button type="button" class="calc-btn"     @click="calcAct('1')">1</button>
            <button type="button" class="calc-btn"     @click="calcAct('2')">2</button>
            <button type="button" class="calc-btn"     @click="calcAct('3')">3</button>
            <button type="button" class="calc-btn op"  @click="calcAct('+')">+</button>
            <button type="button" class="calc-btn"     @click="calcAct('+/-')">+/−</button>
            <button type="button" class="calc-btn"     @click="calcAct('0')">0</button>
            <button type="button" class="calc-btn"     @click="calcAct('.')">.</button>
            <button type="button" class="calc-btn eq"  @click="calcAct('=')">=</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
