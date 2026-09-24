import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { History, RotateCcw, Save } from 'lucide-react'
import { Button } from '#/components/ui/button'
import type { CvVariant } from '#/lib/api/schemas'

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export function CvVersionsPanel({ variants, busy, onSave, onRestore }: {
  variants: CvVariant[]
  /** True while edits are still saving; versions need the saved CV. */
  busy: boolean
  onSave: (name: string) => Promise<boolean>
  onRestore: (variantId: string) => Promise<void>
}) {
  const nameId = useId()
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
    <div className="cvs-versions">
      <form className="cvs-versions__form" onSubmit={(event) => void submit(event)}>
        <label htmlFor={nameId} className="sr-only">Version name</label>
        <input id={nameId} className="cvs-input" value={name} maxLength={120} placeholder="Name this version, e.g. Product roles" onChange={(event) => setName(event.target.value)} />
        <Button type="submit" variant="outline" loading={saving} disabled={!name.trim() || busy}><Save size={15} /> Save version</Button>
      </form>
      {busy ? <p className="cvs-versions__hint" role="status">Saving your latest edits first…</p> : null}
      {ordered.length === 0 ? (
        <p className="cvs-versions__empty"><History size={16} aria-hidden="true" /> No versions yet. Save one before big changes so you can always go back.</p>
      ) : (
        <ul className="cvs-versions__list" aria-label="Saved versions">
          {ordered.map((variant) => (
            <li key={variant.id} className="cvs-version">
              <span className="cvs-version__dot" aria-hidden="true" />
              <div className="cvs-version__text">
                <p className="cvs-version__name">{variant.name}</p>
                <p className="cvs-version__meta">
                  {dateFormat.format(new Date(variant.created_at))}
                  {variant.target_role ? ` · for ${variant.target_role}` : ''}
                </p>
              </div>
              {confirming === variant.id ? (
                <span className="cvs-version__confirm">
                  <span>Replace your current CV?</span>
                  <Button type="button" size="sm" variant="ghost" disabled={restoring !== null} onClick={() => setConfirming(null)}>Cancel</Button>
                  <Button type="button" size="sm" loading={restoring === variant.id} onClick={() => void restore(variant.id)}>Restore</Button>
                </span>
              ) : (
                <Button type="button" size="sm" variant="ghost" disabled={busy} aria-label={`Restore ${variant.name}`} onClick={() => setConfirming(variant.id)}>
                  <RotateCcw size={14} /> Restore
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
