export type AuthView = 'login' | 'register'

/** What each view is called: the standalone page and the dialog both head the surface with this. */
export const AUTH_COPY: Record<AuthView, { title: string; intro: string }> = {
  login: {
    title: 'Sign in to your workspace',
    intro: 'Keep your runs and favorites across every tool.',
  },
  register: {
    title: 'Create your workspace account',
    intro: 'Keep your runs and favorites across every tool.',
  },
}

/** The reset-password step of the sign-in form: it replaces the view's title and intro, and the tabs go away. */
export const RESET_COPY = {
  title: 'Reset your password',
  intro: "Enter your email and we'll send a link to reset your password.",
}

/** What to head the surface with: the view, or the reset step while it is open. */
export function authCopy(view: AuthView, resetting: boolean) {
  return resetting ? RESET_COPY : AUTH_COPY[view]
}
