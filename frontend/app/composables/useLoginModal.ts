export const useLoginModal = () => {
  const isLoginOpen  = useState<boolean>('login-modal-open',  () => false)
  const isSignupOpen = useState<boolean>('signup-modal-open', () => false)
  const isInviteOpen    = useState<boolean>('invite-modal-open', () => false)
  const selectedPlan = useState<string | null>('modal-plan',  () => null)
  const signupExamSlug = useState<string | null>('signup-exam-slug', () => null)
  const loginView = useState<'login' | 'forgot' | 'forgot-sent' | 'otp'>('login-view', () => 'login')
  // Email the 2FA code was sent to — shared between LoginForm and OtpVerify.
  const otpEmail = useState<string>('login-otp-email', () => '')

  const signupStripe = useState<string | null>('signup-stripe', () => null)
  // Email to pre-fill the signup form with (abandoned-cart resume link). Set before
  // openSignup(); SignupForm reads and clears it when the modal opens.
  const signupPrefillEmail = useState<string | null>('signup-prefill-email', () => null)

  const openLogin = () => {
    isSignupOpen.value = false
    isLoginOpen.value  = true 
    loginView.value    = 'login'   // reset to login when opening

  }

  const closeLogin = () => {
    isLoginOpen.value = false
  }

  const openForgot = () => {
  loginView.value   = 'forgot'
  isSignupOpen.value = false
  isInviteOpen.value = false
  isLoginOpen.value = true   // ← this is what was missing — opens the global modal
}

const backToLogin = () => {
  loginView.value = 'login'
}

// Switch the modal to the 2FA OTP step (after a 2fa_required login response).
const openOtp = (email: string) => {
  otpEmail.value  = email
  loginView.value = 'otp'
}

const showForgotSent = () => {
  loginView.value = 'forgot-sent'
}

  const openSignup = (
    slug?: string | null,
    plan?: string | null,
    stripepriceid?: string | null,
) => {
  if (slug          !== undefined) signupExamSlug.value = slug
  if (plan          !== undefined) selectedPlan.value   = plan
  if (stripepriceid !== undefined) signupStripe.value   = stripepriceid

  isLoginOpen.value  = false
  isSignupOpen.value = true
}

const closeSignup = () => {
    isSignupOpen.value = false
  }

  const openInvite = () => {
    isLoginOpen.value  = false
    isSignupOpen.value = false
    isInviteOpen.value = true
  }
  const closeInvite = () => { isInviteOpen.value = false }
  
  return { isLoginOpen, isSignupOpen,isInviteOpen, selectedPlan, signupExamSlug,signupStripe, signupPrefillEmail, loginView, otpEmail, openForgot, backToLogin, showForgotSent, openOtp,
 openLogin, closeLogin, openSignup, closeSignup,openInvite, closeInvite}
}