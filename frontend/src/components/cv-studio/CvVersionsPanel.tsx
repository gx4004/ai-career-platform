import { useState } from 'react'
import type { FormEvent } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import {
  Button, EmptyState, Field, Input, List, MetaRow, Row, RowActions, RowBody, RowSubtitle, RowTitle, Stack,
} from '#/components/kit'
import type { CvVariant } from '#/lib/api/schemas'

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export function CvVersionsPanel({ variants, busy, onSave, onRestore }: {
  variants: CvVariant[]
  /** True while edits are still saving; versions need the saved CV. */
  busy: boolean
  onSave: (name: string) => Promise<boolean>
  onRestore: (variantId: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const ordered = [...variants].sort((a, b) => b.created_at.localeCompare(a.created_at))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim() || busy || saving) return
    setSaving(true)
    if (await onSave(name.trim())) setName('')
    setSaving(false)
  }

  async function restore(variantId: string) {
    setRestoring(variantId)
    await onRestore(variantId)
    setRestoring(null)
    setConfirming(null)
  }

  return (
    <Stack gap={4}>
      <form className="cvs-versions__form" onSubmit={(event) => void submit(event)}>
        <Field
          label="Version name" hideLabel className="cvs-versions__name"
          help={busy ? <span role="status">Saving your latest edits first…</span> : undefined}
        >
          <Input value={name} maxLength={120} placeholder="Name this version" onChange={(event) => setName(event.target.value)} />
        </Field>
        <Button type="submit" variant="secondary" loading={saving} disabled={!name.trim() || busy}><Save aria-hidden="true" /> Save version</Button>
      </form>
      {ordered.length === 0 ? (
        <EmptyState title="No versions yet" description="Save one before big changes so you can always go back." />
      ) : (
        <List aria-label="Saved versions">
          {ordered.map((variant) => (
            <Row key={variant.id}>
              <RowBody>
                <RowTitle>{variant.name}</RowTitle>
                <RowSubtitle>
                  {confirming === variant.id
                    ? 'Replace your current CV? We’ll keep it in your versions.'
                    : <MetaRow>{dateFormat.format(new Date(variant.created_at))}{variant.target_role ? `for ${variant.target_role}` : null}</MetaRow>}
                </RowSubtitle>
              </RowBody>
              <RowActions reveal={false}>
                {confirming === variant.id ? (
                  <>
                    <Button type="button" size="sm" variant="ghost" disabled={restoring !== null} onClick={() => setConfirming(null)}>Cancel</Button>
                    <Button type="button" size="sm" variant="secondary" loading={restoring === variant.id} onClick={() => void restore(variant.id)}>Restore</Button>
                  </>
                ) : (
                  <Button type="button" size="sm" variant="ghost" disabled={busy} aria-label={`Restore ${variant.name}`} onClick={() => setConfirming(variant.id)}>
                    <RotateCcw aria-hidden="true" /> Restore
                  </Button>
                )}
              </RowActions>
            </Row>
          ))}
        </List>
      )}
    </Stack>
  )
}
