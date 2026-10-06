import { newPasswordSchema } from '#/lib/api/schemas'

/**
 * Client-side checks for the auth forms. The forms set `noValidate`, so these messages (shown under the
 * field, announced as alerts) replace the browser's unstyled bubbles. The server still validates.
 */

const EMAIL_SHAPE = /^\S+@\S+\.\S+$/

export function emailError(value: string): string | undefined {
  const email = value.trim()
  if (!email) return 'Enter your email.'
  if (!EMAIL_SHAPE.test(email)) return 'Enter an email like you@example.com.'
  return undefined
}

export function passwordError(value: string): string | undefined {
  return value ? undefined : 'Enter your password.'
}

export function newPasswordError(value: string): string | undefined {
  if (!value) return 'Choose a password.'
  if (Array.from(value).length < 8) return 'Use at least 8 characters.'
  const result = newPasswordSchema.safeParse(value)
  return result.success ? undefined : result.error.issues[0]?.message || 'Choose a different password.'
}

/** Moves focus to the control of the first message, in form order. Returns true when there was one. */
export function focusFirstError(errors: ReadonlyArray<readonly [controlId: string, message: string | undefined]>): boolean {
  const first = errors.find(([, message]) => Boolean(message))
  if (!first) return false
  document.getElementById(first[0])?.focus()
  return true
}
