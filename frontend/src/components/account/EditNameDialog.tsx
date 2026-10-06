import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
  useToast,
} from '#/components/kit'
import { updateMe } from '#/lib/api/client'
import { describeFailure } from '#/lib/api/errors'
import { CURRENT_USER_QUERY_KEY } from '#/lib/auth/currentUser'

const NAME_MAX = 200

/** The account's own name (PATCH /auth/me). Empty clears it, and the app shows the email address instead. */
export function EditNameDialog({
  open,
  onOpenChange,
  currentName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentName: string | null | undefined
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState(currentName ?? '')
  const save = useMutation({
    mutationFn: (fullName: string | null) => updateMe({ full_name: fullName }),
    onSuccess: (user) => {
      // The session reads the user from this query: the sidebar and the account menu change without a reload.
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, user)
      toast({ tone: 'success', title: user.full_name ? 'Name saved' : 'Name cleared' })
      onOpenChange(false)
    },
  })

  // Every opening starts from the saved name, with no failure left over from last time.
  useEffect(() => {
    if (!open) return
    setName(currentName ?? '')
    save.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reseed on open only
  }, [open])

  const failure = save.isError ? describeFailure(save.error, 'Your name could not be saved. Try again.') : null

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent size="sm" dismissible={!save.isPending}>
        <DialogForm
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate(name.trim() || null)
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit your name</DialogTitle>
            <DialogDescription>Shown in the sidebar and on your account. Leave it empty to show your email instead.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Name" id="account-name" error={failure?.fields.full_name}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                maxLength={NAME_MAX}
                disabled={save.isPending}
                clearable
                onClear={() => setName('')}
              />
            </Field>
            {failure && !failure.fields.full_name ? <Notice tone="danger">{failure.message}</Notice> : null}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={save.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={save.isPending}>
              Save name
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}
