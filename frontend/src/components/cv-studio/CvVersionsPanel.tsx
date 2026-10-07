import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Download, Eye, RotateCcw, Save } from 'lucide-react'
import {
  Badge, Button, Card, CardHeader, Cluster, CardTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, EmptyState, Field, Input, MetaRow, Stack,
} from '#/components/kit'
import type { CvSection, CvVariant } from '#/lib/api/schemas'
import { describeDiff, diffVersion } from './versionDiff'
import { isVersionNameTaken, versionNameTakenMessage } from './versionNames'

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export type VersionExport = { variantId: string; format: 'pdf' | 'docx' } | null

/** Saved versions as cards: when, for which job, how it differs from the CV now, and what you can do with it. */
export function CvVersionsPanel({ variants, currentSections, busy, exporting, onSave, onRestore, onPreview, onExport }: {
  variants: CvVariant[]
  /** The CV being edited: versions are compared with it. */
  currentSections: CvSection[]
  /** True while edits are still saving; versions need the saved CV. */
  busy: boolean
  /** The version file being built right now. */
  exporting: VersionExport
  onSave: (name: string) => Promise<boolean>
  onRestore: (variantId: string) => Promise<void>
  onPreview: (variant: CvVariant) => void
  /** Absent while the server cannot build a saved version as a file: no Export menu is shown. */
  onExport?: (variant: CvVariant, format: 'pdf' | 'docx') => void
}) {
  const [name, setName] = useState('')
  /** A name this CV already has: said at the field, which keeps the cursor. */
  const [nameError, setNameError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const ordered = [...variants].sort((a, b) => b.created_at.localeCompare(a.created_at))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim() || busy || saving) return
    if (isVersionNameTaken(name, variants.map((variant) => variant.name))) {
      setNameError(versionNameTakenMessage(name))
      nameRef.current?.focus()
      return
    }
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
      {/* One field holds the name and its button, so a name error runs the panel's full width under both (cv-studio-F06). */}
      <form className="cvs-versions__form" onSubmit={(event) => void submit(event)}>
        <Field
          label="Version name" hideLabel className="cvs-versions__name"
          help={busy ? <span role="status">Saving your latest edits first…</span> : undefined}
          error={nameError || undefined}
        >
          <Cluster gap={2} align="start" className="cvs-versions__row">
            <Input ref={nameRef} value={name} maxLength={120} placeholder="Name this version" onChange={(event) => { setName(event.target.value); setNameError('') }} />
            <Button type="submit" variant="secondary" loading={saving} disabled={!name.trim() || busy}><Save aria-hidden="true" /> Save version</Button>
          </Cluster>
        </Field>
      </form>
      {ordered.length === 0 ? (
        <EmptyState size="inline" title="No versions yet. Save one before big changes so you can always go back." />
      ) : (
        <ul className="cvs-versions" role="list" aria-label="Saved versions">
          {ordered.map((variant) => {
            const confirmingThis = confirming === variant.id
            const building = exporting?.variantId === variant.id
            return (
              <Card key={variant.id} as="li" padding="sm" tone={variant.target_role ? 'lilac' : undefined}>
                <CardHeader>
                  <CardTitle headingLevel={3}>{variant.name}</CardTitle>
                  {variant.target_role ? <Badge size="sm" tone="lilac">Tailored</Badge> : null}
                </CardHeader>
                <MetaRow>
                  {dateFormat.format(new Date(variant.created_at))}
                  {variant.target_role ? `for ${variant.target_role}` : null}
                </MetaRow>
                <p className="cvs-hint">
                  {confirmingThis ? 'Replace your current CV? We’ll keep it in your versions.' : describeDiff(diffVersion(variant.sections, currentSections))}
                </p>
                <div className="cvs-version__actions">
                  {confirmingThis ? (
                    <>
                      <Button type="button" size="sm" variant="ghost" disabled={restoring !== null} onClick={() => setConfirming(null)}>Cancel</Button>
                      <Button type="button" size="sm" variant="secondary" loading={restoring === variant.id} onClick={() => void restore(variant.id)}>Restore</Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" size="sm" variant="secondary" aria-label={`Preview ${variant.name}`} onClick={() => onPreview(variant)}>
                        <Eye aria-hidden="true" /> Preview
                      </Button>
                      {onExport ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" size="sm" variant="secondary" loading={building} aria-label={`Export ${variant.name}`}>
                              <Download aria-hidden="true" /> Export
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onSelect={() => onExport(variant, 'pdf')}>PDF</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => onExport(variant, 'docx')}>DOCX</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                      <Button type="button" size="sm" variant="ghost" disabled={busy} aria-label={`Restore ${variant.name}`} onClick={() => setConfirming(variant.id)}>
                        <RotateCcw aria-hidden="true" /> Restore
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            )
          })}
        </ul>
      )}
    </Stack>
  )
}
