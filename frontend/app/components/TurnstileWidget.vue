<!--
  Cloudflare Turnstile widget — env-gated.

  Renders nothing (and produces no token) unless a site key is configured via
  NUXT_PUBLIC_TURNSTILE_SITE_KEY. This lets the anti-spam wiring ship now and
  activate later, once the key is set AND the backend verifies the token
  server-side (the only thing that provides real protection).

  Usage:
    const token = ref('')
    <TurnstileWidget v-model="token" ref="tsRef" />
    // after submit: tsRef.value?.reset()
-->
<script setup>
const token = defineModel({ type: String, default: '' })

// ONE shared Cloudflare Turnstile widget for every market. The site key is PUBLIC
// (it ships in the widget markup). We deliberately do NOT read the per-project
// NUXT_PUBLIC_TURNSTILE_SITE_KEY: those envs had drifted to different, mis-
// configured widgets (e.g. SA pointed at 0x4AAAAAADl3LNrE0DYiwhmw, which isn't
// allowed on passmed.co.za) — which is exactly why the captcha only worked on US.
// This widget lists all six production hostnames and its secret is set server-side
// (config services.turnstile.secret), so site key + secret stay a matched pair.
const siteKey = '0x4AAAAAADlGf3BsegbqLNa7'

const el = ref(null)
let widgetId = null

function renderWidget () {
  if (!siteKey || !el.value || !window.turnstile) return
  widgetId = window.turnstile.render(el.value, {
    sitekey: siteKey,
    callback: (t) => { token.value = t },
    'error-callback':  () => { token.value = '' },
    'expired-callback': () => { token.value = '' },
  })
}

function reset () {
  if (window.turnstile && widgetId != null) {
    window.turnstile.reset(widgetId)
    token.value = ''
  }
}
defineExpose({ reset })

onMounted(() => {
  if (!siteKey) return // inert until configured

  if (window.turnstile) { renderWidget(); return }

  const scriptId = 'cf-turnstile-script'
  const existing = document.getElementById(scriptId)
  if (existing) {
    // Script tag present but API may not be ready yet — poll briefly.
    const iv = setInterval(() => {
      if (window.turnstile) { clearInterval(iv); renderWidget() }
    }, 100)
    setTimeout(() => clearInterval(iv), 5000)
    return
  }

  const s = document.createElement('script')
  s.id = scriptId
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
  s.async = true
  s.defer = true
  s.onload = renderWidget
  document.head.appendChild(s)
})

onBeforeUnmount(() => {
  if (window.turnstile && widgetId != null) {
    try { window.turnstile.remove(widgetId) } catch {}
  }
})
</script>

<template>
  <div v-if="siteKey" ref="el" class="cf-turnstile-widget" style="margin:8px 0;"></div>
</template>
