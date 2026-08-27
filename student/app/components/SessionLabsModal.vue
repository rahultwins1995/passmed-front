<!--
  SessionLabsModal.vue
  PERF FIX 3: Extracted from tutor.vue so Vite can split this into a separate
  chunk. The ~5 KB labs table HTML was previously parsed on every session load
  even when the user never opens it. With defineAsyncComponent in tutor.vue
  this file is only downloaded + parsed the first time "Labs" is clicked.
-->
<script setup lang="ts">
defineProps<{ show: boolean }>()
defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="overlay open" @click.self="$emit('close')">
      <div class="modal-box" style="width:560px;max-width:95vw;max-height:82dvh;display:flex;flex-direction:column">
        <div class="m-head">
          <div class="m-title">Reference Lab Values</div>
          <button type="button" class="m-close" @click="$emit('close')" aria-label="Close">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="labs-body">
          <div class="labs-section-title">Haematology</div>
          <table class="labs-table">
            <tr><th>Test</th><th>Reference Range</th><th>Units</th></tr>
            <tr><td>Haemoglobin (male)</td><td>135–175</td><td>g/L</td></tr>
            <tr><td>Haemoglobin (female)</td><td>120–155</td><td>g/L</td></tr>
            <tr><td>White cell count</td><td>4.0–11.0</td><td>×10⁹/L</td></tr>
            <tr><td>Neutrophils</td><td>1.8–7.5</td><td>×10⁹/L</td></tr>
            <tr><td>Lymphocytes</td><td>1.0–4.5</td><td>×10⁹/L</td></tr>
            <tr><td>Platelets</td><td>150–400</td><td>×10⁹/L</td></tr>
            <tr><td>MCV</td><td>80–100</td><td>fL</td></tr>
            <tr><td>PT / INR</td><td>11–14 s / 0.9–1.1</td><td></td></tr>
            <tr><td>APTT</td><td>25–35</td><td>s</td></tr>
          </table>
          <div class="labs-section-title">Biochemistry</div>
          <table class="labs-table">
            <tr><th>Test</th><th>Reference Range</th><th>Units</th></tr>
            <tr><td>Sodium (Na⁺)</td><td>135–145</td><td>mmol/L</td></tr>
            <tr><td>Potassium (K⁺)</td><td>3.5–5.0</td><td>mmol/L</td></tr>
            <tr><td>Chloride (Cl⁻)</td><td>95–107</td><td>mmol/L</td></tr>
            <tr><td>Bicarbonate (HCO₃⁻)</td><td>22–29</td><td>mmol/L</td></tr>
            <tr><td>Urea</td><td>2.5–7.8</td><td>mmol/L</td></tr>
            <tr><td>Creatinine</td><td>60–110</td><td>μmol/L</td></tr>
            <tr><td>eGFR</td><td>&gt;90</td><td>mL/min/1.73m²</td></tr>
            <tr><td>Glucose (fasting)</td><td>3.9–5.6</td><td>mmol/L</td></tr>
            <tr><td>HbA1c</td><td>&lt;48</td><td>mmol/mol</td></tr>
            <tr><td>CRP</td><td>&lt;5</td><td>mg/L</td></tr>
            <tr><td>ALT</td><td>7–56</td><td>U/L</td></tr>
            <tr><td>AST</td><td>10–40</td><td>U/L</td></tr>
            <tr><td>Bilirubin (total)</td><td>3–21</td><td>μmol/L</td></tr>
            <tr><td>ALP</td><td>40–130</td><td>U/L</td></tr>
            <tr><td>Albumin</td><td>35–50</td><td>g/L</td></tr>
            <tr><td>Total protein</td><td>60–80</td><td>g/L</td></tr>
            <tr><td>Calcium (corrected)</td><td>2.2–2.6</td><td>mmol/L</td></tr>
            <tr><td>Phosphate</td><td>0.8–1.4</td><td>mmol/L</td></tr>
            <tr><td>Magnesium</td><td>0.7–1.0</td><td>mmol/L</td></tr>
            <tr><td>TSH</td><td>0.4–4.0</td><td>mU/L</td></tr>
            <tr><td>Free T4</td><td>10–22</td><td>pmol/L</td></tr>
          </table>
          <div class="labs-section-title">Arterial Blood Gas</div>
          <table class="labs-table">
            <tr><th>Parameter</th><th>Reference Range</th><th>Units</th></tr>
            <tr><td>pH</td><td>7.35–7.45</td><td></td></tr>
            <tr><td>PaO₂</td><td>10.6–13.3</td><td>kPa</td></tr>
            <tr><td>PaCO₂</td><td>4.7–6.0</td><td>kPa</td></tr>
            <tr><td>HCO₃⁻</td><td>22–26</td><td>mmol/L</td></tr>
            <tr><td>Base excess</td><td>−2 to +2</td><td>mmol/L</td></tr>
            <tr><td>Lactate</td><td>&lt;2.0</td><td>mmol/L</td></tr>
          </table>
          <div class="labs-section-title">Cardiac &amp; Other</div>
          <table class="labs-table">
            <tr><th>Test</th><th>Reference Range</th><th>Units</th></tr>
            <tr><td>Troponin I (hs)</td><td>&lt;52 (male), &lt;16 (female)</td><td>ng/L</td></tr>
            <tr><td>BNP</td><td>&lt;100</td><td>pg/mL</td></tr>
            <tr><td>NT-proBNP</td><td>&lt;125 (age &lt;75)</td><td>pg/mL</td></tr>
            <tr><td>CK (total)</td><td>25–200 (male), 25–170 (female)</td><td>U/L</td></tr>
            <tr><td>D-dimer</td><td>&lt;0.5</td><td>mg/L FEU</td></tr>
            <tr><td>Lipase</td><td>10–140</td><td>U/L</td></tr>
            <tr><td>PSA</td><td>&lt;4.0</td><td>ng/mL</td></tr>
          </table>
          <div class="labs-note">ℹ These are standard reference ranges. Patient-specific results may be adjusted based on local laboratory calibration, age, sex, and clinical context.</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
