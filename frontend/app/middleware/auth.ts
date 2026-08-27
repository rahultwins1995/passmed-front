export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchMe } = useAuth()

  if (!user.value) await fetchMe()

  if (!user.value) {
    // Keep the query param name in sync with login.vue and student-auth.global.ts ('redirect')
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
