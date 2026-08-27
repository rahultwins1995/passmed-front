
export const useAuth = () => {
  const user = useState<any | null>('auth_user', () => null)
  const api  = useApi()

  const isLoggedIn = computed(() => !!user.value)

  async function login(email: string, password: string, turnstileToken: string = '') {
    const res = await api<any>('/login', {
      method: 'POST',
      body: { email, password, turnstileToken },
    })
    // When 2FA is on, the backend returns { status: '2fa_required' } with NO
    // user/token — don't mark the user logged in; the caller shows the OTP step.
    if (res?.user) user.value = res.user
    return res
  }

  // Second step of 2FA login: submit the emailed OTP. On success the backend
  // issues the auth cookie (same as a normal login) and returns the user.
  async function verifyOtp(email: string, otp: string) {
    const res = await api<any>('/login/verify-otp', {
      method: 'POST',
      body: { email, otp },
    })
    if (res?.user) user.value = res.user
    return res
  }

  async function googleAuth(credential: string) {
    const res = await api<any>('/googleauth', {
      method: 'POST',
      body: { credential },
    })
    user.value = res.user
    return res
  }

  async function googleAuthSignup(credential: string) {
    const res = await api<any>('/googleauthsignup', {
      method: 'POST',
      body: { credential },
    })
    user.value = res.user
    return res
  }

  async function logout() {
    try { await api('/logout', { method: 'POST' }) } catch (_) { /* ignore */ }
    user.value = null
    await navigateTo('/')
  }

  async function fetchMe() {
    try {
      const res = await api<any>('/me')
      user.value = res?.user ?? res
      return user.value
    } catch {
      user.value = null
      return null
    }
  }

  return {
    user,
    isLoggedIn,
    login,
    verifyOtp,
    googleAuth,
    googleAuthSignup,
    logout,
    fetchMe,
    fetchUser: fetchMe,   
  }
}
