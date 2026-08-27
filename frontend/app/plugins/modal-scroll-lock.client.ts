export default defineNuxtPlugin(() => {
  const { isLoginOpen, isSignupOpen, isInviteOpen } = useLoginModal()
  const { lock, unlock } = useScrollLock()

  const anyModalOpen = computed(() =>
    isLoginOpen.value || isSignupOpen.value || isInviteOpen.value
  )

  watch(anyModalOpen, (open) => {
    if (open) lock('login-modal')
    else unlock('login-modal')
  })
})