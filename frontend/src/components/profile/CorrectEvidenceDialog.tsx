import { useEffect, useId, useState } from 'react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import type { EvidenceItem } from '#/lib/api/schemas'
import {
  KIND_LABELS,
  PROVENANCE_LABELS,
  contentToEditableText,
  parseEditableText,
} from '#/lib/profile/evidence'

export type CorrectionSubmit = {
  content: Record<string, unknown>
}

export function CorrectEvidenceDialog({
  item,
  open,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: {
  item: EvidenceItem | null
  open: boolean
  submitting: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: CorrectionSubmit) => void
}) {
  const textareaId = useId()
  const errorId = useId()
  const [text, setText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  // Reseed the editor whenever a different item opens.
  useEffect(() => {
    if (open && item) {
      setText(contentToEditableText(item.content))
      setParseError(null)
    }
  }, [open, item])

  function handleSubmit() {
    const parsed = parseEditableText(text)
    if (!parsed.ok) {
      setParseError(parsed.error)
      return
    }
    setParseError(null)
    onSubmit({ content: parsed.value })
  }

  const shownError = parseError ?? error

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>Correct this item</DialogTitle>
          <DialogDescription>
            {item ? (
              <>
                Editing a {KIND_LABELS[item.kind].toLowerCase()} item
                {' '}({PROVENANCE_LABELS[item.provenance].toLowerCase()}). Saving marks it{' '}
                <strong>Saved</strong> — you typed it, so it is trusted right away.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor={textareaId}>Content (JSON fields)</Label>
          <Textarea
            id={textareaId}
            className="evidence-correct__editor"
            value={text}
            spellCheck={false}
            rows={8}
            disabled={submitting}
            aria-invalid={shownError ? true : undefined}
            aria-describedby={shownError ? errorId : undefined}
            onChange={(event) => setText(event.target.value)}
          />
        </div>

        {shownError ? (
          <p id={errorId} role="alert" className="small-copy" style={{ color: 'var(--destructive)' }}>
            {shownError}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting} disabled={submitting}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
