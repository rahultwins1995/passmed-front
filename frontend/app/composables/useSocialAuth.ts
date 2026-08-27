
export const useSocialAuth = () => {
  const { closeLogin, closeSignup, openSignup } = useLoginModal()
  const router = useRouter()
  const route  = useRoute()
  const api    = useApi()                              // ← uses credentials:'include'

  // LOGIN is a terminal action: authenticate, then send the user to their
  // portal immediately. (Contrast with afterSocialAuthsignup below.)
  async function afterSocialAuth (res: any) {
    if (res.status !== 'success') {
      throw new Error(res.message || 'Authentication failed')
    }

    // Only user state — no cookie writes.
    const userState = useState<any>('auth_user', () => null)
    userState.value = res.user

    closeLogin()
    await usePortalPicker().routeAfterLogin(res?.user, router)
  }

  async function loginWithGoogle (credential: string) {
    const res = await api<any>('/googleauth', {
      method: 'POST',
      body: { credential },
    })
    await afterSocialAuth(res)
  }

  // SIGNUP is mid-flow, NOT terminal: this only authenticates the new user and
  // sets the auth state. It intentionally does NOT redirect — the multi-step
  // signup continues in the caller (SignupForm.vue → handleGoogleSignupSuccess):
  //   • trial plan → submitSignup() creates the subscription, then redirects
  //   • paid plan  → advance to the payment step (3); submitSignup() redirects
  //     after payment succeeds.
  // Adding a router.push() here would break that flow by navigating away before
  // the user picks a plan / pays. Keep this asymmetric with afterSocialAuth.
  async function afterSocialAuthsignup (res: any) {
    if (res.status !== 'success') {
      throw new Error(res.message || 'Authentication failed')
    }
    const userState = useState<any>('auth_user', () => null)
    userState.value = res.user
  }

  async function signupWithGoogle (credential: string) {
    const res = await api<any>('/googleauthsignup', {
      method: 'POST',
      body: {
        credential,
        // Attribution — same params as the email/password signup.
        utm_source: route.query.utm_source ?? null,
        utm_medium: route.query.utm_medium ?? null,
        utm_campaign: route.query.utm_campaign ?? null,
        referrer: import.meta.client ? document.referrer : '',
      },
    })
    await afterSocialAuthsignup(res)
  }

  return { loginWithGoogle, signupWithGoogle }
}
