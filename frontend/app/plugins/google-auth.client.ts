import GoogleSignInPlugin from 'vue3-google-signin'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  nuxtApp.vueApp.use(GoogleSignInPlugin, {
    clientId: config.public.googleAuthKey,
  })
})