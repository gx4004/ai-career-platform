/**
 * The forms read every failure through the one mapper in lib/api/errors, so the same mistake reads the same
 * on sign in, create account, forgot password, reset password and every tool page.
 */
export { describeFailure, formatWait } from '#/lib/api/errors'
export type { FormFailure } from '#/lib/api/errors'
