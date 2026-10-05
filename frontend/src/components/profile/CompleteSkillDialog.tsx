import { useEffect, useRef, useState } from 'react'
import {
  Button, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogForm, DialogHeader,
  DialogTitle, Field, Notice, ScoreSeal, Stack, Textarea,
} from '#/components/kit'
import type { DevelopmentItem } from '#/lib/api/developmentSchemas'
import { GAP_KIND_LABELS } from '#/lib/development/plan'

/** What completing produced: the fact that now sits on the profile, and whether it is already saved. */
export type CompletionResult = { evidenceItemId: string | null; saved: boolean }

/**
 * Finishing a skill adds something to the profile, so it asks first: "What did you do?". Words typed here are
 * the owner's own and land as a saved fact; left empty, the profile gets an honest generic suggestion to
 * review. The same dialog then shows the payoff (a mint seal) and offers to show the new fact.
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

  useEffect(() => {
    if (item) setNotes(item.notes ?? '')
  }, [item])

  const kind = current ? GAP_KIND_LABELS[current.gap_kind] : 'skill'

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
              <DialogTitle>{result.saved ? 'Added to your profile' : 'Suggestion added'}</DialogTitle>
              <DialogDescription>
                {result.saved
                  ? 'What you wrote is now a saved fact. CV Studio and the tools can use it.'
                  : 'We added a suggestion to your profile. Nothing counts until you review and save it.'}
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="profile-payoff">
                <ScoreSeal
                  value="✓"
                  unit={null}
                  label={result.saved ? 'Saved to your profile' : 'Suggestion added to your profile'}
                  tone="mint"
                  size={132}
                  reveal="stamp"
                />
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="secondary">Done</Button></DialogClose>
              {result.evidenceItemId ? (
                <Button type="button" onClick={() => onShow(result.evidenceItemId as string)}>
                  {result.saved ? 'Show me the fact' : 'Show me the suggestion'}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        ) : (
          <DialogForm onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>What did you do?</DialogTitle>
              <DialogDescription>
                Finishing “{kind}” adds to your profile. Say what you did in your own words and it is saved as a fact.
                Leave it empty and we add a suggestion for you to review.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Stack gap={4}>
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
