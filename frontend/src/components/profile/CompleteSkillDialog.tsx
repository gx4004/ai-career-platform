import { useEffect, useRef, useState } from 'react'
import {
  Button, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogForm, DialogHeader,
  DialogTitle, Field, KeyValue, Notice, ScoreSeal, Stack, Textarea,
} from '#/components/kit'
import type { DevelopmentItem } from '#/lib/api/developmentSchemas'
import { GAP_KIND_LABELS } from '#/lib/development/plan'

/** What completing produced, as the server reports it: the fact now on the profile, or none. */
export type CompletionResult = { evidenceItemId: string | null }

/**
 * Finishing a skill can add to the profile, so it asks first: "What did you do?". Words typed here are the
 * owner's own and the server saves them as a fact; left empty, the skill is only marked done and nothing is
 * added. The skill's notes are its PLAN ("What you plan to do to close this gap"), not what was done, so they
 * are shown read-only above the field and never pre-filled into it: one click must not turn a plan into a
 * confirmed fact. The same dialog then shows the payoff (a mint seal) when a fact was added, and offers to show it.
 */
export function CompleteSkillDialog({
  item,
  submitting,
  error,
  result,
  onSubmit,
  onClose,
  onShow,
}: {
  item: DevelopmentItem | null
  submitting: boolean
  error: string | null
  result: CompletionResult | null
  onSubmit: (notes: string) => void
  onClose: () => void
  onShow: (evidenceItemId: string) => void
}) {
  const [notes, setNotes] = useState('')
  // The dialog keeps its content while it fades out after `item` is cleared.
  const shown = useRef<DevelopmentItem | null>(null)
  if (item) shown.current = item
  const current = item ?? shown.current

  // Each opening starts empty: the plan is not what was done.
  useEffect(() => {
    if (item) setNotes('')
  }, [item])

  const kind = current ? current.label?.trim() || GAP_KIND_LABELS[current.gap_kind] : 'skill'
  const plan = current?.notes?.trim() || null

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    onSubmit(notes.trim())
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dismissible={!submitting}>
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>{result.evidenceItemId ? 'Added to your profile' : 'Marked complete'}</DialogTitle>
              <DialogDescription>
                {result.evidenceItemId
                  ? 'What you wrote is now a saved fact. CV Studio and the tools can use it.'
                  : 'Nothing was added to your profile, since nothing was written. You can add what you did as a fact on your profile any time.'}
              </DialogDescription>
            </DialogHeader>
            {result.evidenceItemId ? (
              <DialogBody>
                <div className="profile-payoff">
                  <ScoreSeal value="✓" unit={null} label="Saved to your profile" tone="mint" size={132} reveal="stamp" />
                </div>
              </DialogBody>
            ) : null}
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="secondary">Done</Button></DialogClose>
              {result.evidenceItemId ? (
                <Button type="button" onClick={() => onShow(result.evidenceItemId as string)}>Show me the fact</Button>
              ) : null}
            </DialogFooter>
          </>
        ) : (
          <DialogForm onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>What did you do?</DialogTitle>
              <DialogDescription>
                Say what you did for “{kind}” in your own words and it is saved as a fact on your profile.
                Leave it empty to just mark it done.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Stack gap={4}>
                {plan ? <KeyValue layout="stacked" divided={false} items={[{ label: 'Your plan', value: plan }]} /> : null}
                <Field label="What you did" optional>
                  <Textarea
                    autosize maxRows={10} rows={4} value={notes} maxLength={2000} disabled={submitting}
                    placeholder="e.g. Built a small FastAPI service and deployed it to Railway."
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </Field>
                {error ? <Notice tone="danger">{error}</Notice> : null}
              </Stack>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="secondary" disabled={submitting}>Cancel</Button></DialogClose>
              <Button type="submit" loading={submitting}>Mark complete</Button>
            </DialogFooter>
          </DialogForm>
        )}
      </DialogContent>
    </Dialog>
  )
}
