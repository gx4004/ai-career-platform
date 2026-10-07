import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Notice,
  Stack,
  useToast,
} from '#/components/kit'
import { FormFailureNotice, useFormFailure } from '#/components/auth/FormFailureNotice'
import { PasswordInput } from '#/components/auth/PasswordInput'
import { focusFirstError, newPasswordError } from '#/components/auth/auth-validation'
import { changePassword } from '#/lib/api/client'
import { ApiError } from '#/lib/api/errors'

/** The server's 400 for an account that signs in with Google only (it has no password to change). */
const NO_PASSWORD = /no password yet/i
const WRONG_CURRENT = /current password is incorrect/i

/**
 * POST /auth/change-password. The answer renews this tab's cookies and signs every other session out, so the
 * person stays where they are. A Google-only account learns here that it has no password and can email itself a link.
 */
export function ChangePasswordDialog({
  open,
  onOpenChange,
  onEmailLink,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Sends the reset link to the account's address (the same action as the page's "Forgot it?" link). */
  onEmailLink: () => void
}) {
  const { toast } = useToast()
  const failure = useFormFailure()
  const clearFailure = failure.clear
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [shown, setShown] = useState(false)
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({})
  const [noPassword, setNoPassword] = useState(false)
  const [pending, setPending] = useState(false)
  // Set by a submit that found a problem: once the fields are enabled again, focus goes to the first one to fix,
  // as on the account details and sign-in forms, instead of staying on the submit button.
  const focusProblem = useRef(false)

  // Every opening starts empty: a password never waits in a closed dialog.
  useEffect(() => {
    if (open) return
    setCurrent('')
    setNext('')
    setConfirm('')
    setShown(false)
    setErrors({})
    setNoPassword(false)
    clearFailure()
  }, [open, clearFailure])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    failure.clear()
    const found: typeof errors = {}
    if (!current) found.current = 'Enter your current password.'
    // The same rule and wording as the sign-up and reset forms.
    const nextProblem = newPasswordError(next)
    if (nextProblem) found.next = nextProblem
    else if (next !== confirm) found.confirm = 'Passwords do not match.'
    setErrors(found)
    if (Object.keys(found).length > 0) {
      focusProblem.current = true
      return
    }

    setPending(true)
    try {
      await changePassword({ current_password: current, new_password: next })
      onOpenChange(false)
      toast({ tone: 'success', title: 'Password changed', description: 'Other devices were signed out' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && NO_PASSWORD.test(error.message)) {
        setNoPassword(true)
      } else if (error instanceof ApiError && error.status === 400 && WRONG_CURRENT.test(error.message)) {
        setErrors({ current: "That isn't your current password. Check it and try again." })
        focusProblem.current = true
      } else {
        failure.fail(error, 'Your password could not be changed. Try again.')
        focusProblem.current = true
      }
    } finally {
      setPending(false)
    }
  }

  const fieldError = (local: string | undefined, api: string) => local || failure.failure?.fields[api] || undefined
  const currentError = fieldError(errors.current, 'current_password')
  const nextError = fieldError(errors.next, 'new_password')

  // After every render: the fields are disabled while the request runs, so this waits until they are back.
  useEffect(() => {
    if (pending || !focusProblem.current) return
    focusProblem.current = false
    focusFirstError([
      ['current-password', currentError],
      ['new-password', nextError],
      ['confirm-new-password', errors.confirm],
    ])
  })

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && onOpenChange(value)}>
      <DialogContent size="sm" dismissible={!pending}>
        {noPassword ? (
          <>
            <DialogHeader>
              <DialogTitle>This account has no password yet</DialogTitle>
              <DialogDescription>You sign in with Google. We can email you a link to set a password as well.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="button"
                onClick={() => {
                  onEmailLink()
                  onOpenChange(false)
                }}
              >
                Email me a link
              </Button>
            </DialogFooter>
          </>
        ) : (
          <DialogForm onSubmit={handleSubmit} noValidate>
            <DialogHeader>
              <DialogTitle>Change password</DialogTitle>
              <DialogDescription>You stay signed in here. Every other device is signed out.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Stack gap={4}>
                <Field label="Current password" id="current-password" error={fieldError(errors.current, 'current_password')}>
                  <PasswordInput
                    shown={shown}
                    onShownChange={setShown}
                    value={current}
                    onChange={(event) => {
                      setCurrent(event.target.value)
                      setErrors((state) => ({ ...state, current: undefined }))
                    }}
                    autoComplete="current-password"
                    disabled={pending}
                    required
                  />
                </Field>
                <Field
                  label="New password"
                  id="new-password"
                  help={fieldError(errors.next, 'new_password') ? undefined : 'At least 8 characters.'}
                  error={fieldError(errors.next, 'new_password')}
                >
                  <Input
                    type={shown ? 'text' : 'password'}
                    value={next}
                    onChange={(event) => {
                      setNext(event.target.value)
                      setErrors((state) => ({ ...state, next: undefined }))
                    }}
                    autoComplete="new-password"
                    disabled={pending}
                    required
                    minLength={8}
                  />
                </Field>
                <Field label="Confirm new password" id="confirm-new-password" error={errors.confirm}>
                  <Input
                    type={shown ? 'text' : 'password'}
                    value={confirm}
                    onChange={(event) => {
                      setConfirm(event.target.value)
                      setErrors((state) => ({ ...state, confirm: undefined }))
                    }}
                    autoComplete="new-password"
                    disabled={pending}
                    required
                    minLength={8}
                  />
                </Field>
                <FormFailureNotice failure={failure.failure} remaining={failure.remaining} />
                {failure.failure?.kind === 'validation' && Object.keys(failure.failure.fields).length > 0 &&
                !failure.failure.fields.current_password && !failure.failure.fields.new_password ? (
                  <Notice tone="danger">{failure.failure.message}</Notice>
                ) : null}
              </Stack>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" loading={pending} disabled={failure.remaining > 0}>
                Change password
              </Button>
            </DialogFooter>
          </DialogForm>
        )}
      </DialogContent>
    </Dialog>
  )
}
