import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Download, Eye, EyeOff, FilePlus2, Plus, RotateCcw, Save } from 'lucide-react'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { PageFrame } from '#/components/app/PageFrame'
import { Button } from '#/components/ui/button'
import { useSession } from '#/hooks/useSession'
import { getCvDocument, listCvDocuments, restoreCvVariant, snapshotCvVariant, updateCvDocument } from '#/lib/api/client'
import type { CvDocument, CvSection } from '#/lib/api/schemas'
import { addEntry, addSection, moveEntry, moveSection, sectionLabels } from '#/lib/cv-studio/editor'
import { CvQualityPanel } from './CvQualityPanel'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
const LIST_KEY = ['cv-studio', 'documents'] as const

export function CvStudio() {
  const { status, openAuthDialog } = useSession()
  const authenticated = status === 'authenticated'
  const queryClient = useQueryClient()
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CvDocument | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [actionError, setActionError] = useState('')
  const [snapshotName, setSnapshotName] = useState('')
  const saveGeneration = useRef(0)
  const saveQueue = useRef<Promise<CvDocument | undefined>>(Promise.resolve(undefined))

  const listQuery = useQuery({ queryKey: LIST_KEY, queryFn: listCvDocuments, enabled: authenticated })
  useEffect(() => {
    if (!documentId && listQuery.data?.items[0]) setDocumentId(listQuery.data.items[0].id)
  }, [documentId, listQuery.data])
  const documentQuery = useQuery({
    queryKey: ['cv-studio', 'document', documentId],
    queryFn: () => getCvDocument(documentId!), enabled: authenticated && Boolean(documentId),
  })
  useEffect(() => {
    if (documentQuery.data && !dirty) setDraft(documentQuery.data)
  }, [documentQuery.data, dirty])

  useEffect(() => {
    if (!dirty || !draft) return
    const generation = ++saveGeneration.current
    setSaveState('saving')
    const timer = window.setTimeout(async () => {
      try {
        // Serialize writes at the network boundary. Generation checks alone keep
        // UI state fresh, but cannot stop an older PATCH committing after a newer
        // one. A queue preserves edit order while still coalescing the debounce.
        saveQueue.current = saveQueue.current
          .catch(() => undefined)
          .then(() => updateCvDocument(draft.id, { name: draft.name, sections: draft.sections }))
        const saved = await saveQueue.current
        if (generation !== saveGeneration.current) return
        if (saved) setDraft(saved)
        setDirty(false)
        setSaveState('saved')
        setActionError('')
        await queryClient.invalidateQueries({ queryKey: LIST_KEY })
      } catch (error) {
        if (generation !== saveGeneration.current) return
        setSaveState('error')
        setActionError(error instanceof Error ? error.message : 'Draft could not be saved.')
      }
    }, 650)
    return () => window.clearTimeout(timer)
  }, [dirty, draft, queryClient])

  function edit(change: (current: CvDocument) => CvDocument) {
    setDraft((current) => current ? change(current) : current)
    setDirty(true)
    setSaveState('saving')
  }
  function editSection(sectionId: string, change: (section: CvSection) => CvSection) {
    edit((current) => ({ ...current, sections: current.sections.map((section) => section.id === sectionId ? change(section) : section) }))
  }
  async function snapshot() {
    if (!draft || !snapshotName.trim() || dirty) return
    setActionError('')
    try {
      await snapshotCvVariant(draft.id, snapshotName.trim())
      setSnapshotName('')
      await documentQuery.refetch()
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Snapshot failed.') }
  }
  async function restore(variantId: string) {
    if (!draft || dirty || !window.confirm('Restore this snapshot? Current saved sections will be replaced.')) return
    try {
      const restored = await restoreCvVariant(draft.id, variantId)
      setDraft(restored); setSaveState('saved'); await documentQuery.refetch()
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Restore failed.') }
  }

  if (status === 'loading') return <PageFrame className="studio-shell"><div className="studio-skeleton" aria-label="Checking your session" /></PageFrame>
  if (!authenticated) return <AppStatePanel title="CV Studio" description="Sign in to edit your structured CV documents and recover named versions." actions={[{ label: 'Sign in', onClick: () => openAuthDialog({ to: '/cv-studio', reason: 'CV Studio is private to your account.' }) }]} />
  if (listQuery.isPending || (documentId && documentQuery.isPending)) return <PageFrame className="studio-shell" ><div className="studio-skeleton" aria-label="Loading CV Studio" /></PageFrame>
  if (listQuery.isError || documentQuery.isError) return <AppStatePanel title="CV Studio is unavailable" description="Your document content was not changed." detail="Try loading the studio again." actions={[{ label: 'Try again', onClick: () => { void listQuery.refetch(); void documentQuery.refetch() } }]} />
  if (!listQuery.data?.items.length) return <AppStatePanel title="Start your CV Studio" description="Import or create a structured CV document first. The editor never turns your document into freeform rich text." icon={<FilePlus2 />} />
  if (!draft) return null

  const exportUrl = `/api/v1/cv-documents/export`
  return (
    <PageFrame className="studio-shell">
      <header className="studio-header">
        <div>{listQuery.data.items.length > 1 ? <><label className="eyebrow" htmlFor="studio-document-picker">Structured document</label><select id="studio-document-picker" className="studio-document-picker" value={draft.id} disabled={dirty} onChange={(event) => { setDirty(false); setDraft(null); setDocumentId(event.target.value); setSaveState('idle') }}>{listQuery.data.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></> : <p className="eyebrow">Structured document</p>}<input className="studio-title-input" aria-label="Document name" value={draft.name} maxLength={120} onChange={(event) => edit((current) => ({ ...current, name: event.target.value }))} /></div>
        <div className="studio-header-actions">
          <span className={`studio-save-state studio-save-state--${saveState}`} role="status" aria-live="polite">{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : saveState === 'saved' ? 'Saved' : 'All changes saved'}</span>
          <Button asChild variant="outline"><a href={exportUrl}><Download size={16} /> Export data</a></Button>
        </div>
      </header>
      {actionError ? <div className="studio-error" role="alert">{actionError} <button type="button" onClick={() => setActionError('')}>Dismiss</button></div> : null}
      <div className="studio-layout">
        <section className="studio-editor" aria-label="CV sections">
          <CvQualityPanel documentId={draft.id} revision={draft.updated_at} />
          <div className="studio-add-row">
            <label htmlFor="add-section">Add a typed section</label>
            <select id="add-section" defaultValue="" onChange={(event) => { if (event.target.value) edit((current) => ({ ...current, sections: addSection(current.sections, event.target.value as CvSection['kind']) })); event.target.value = '' }}>
              <option value="" disabled>Select section type</option>{Object.entries(sectionLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
            </select>
          </div>
          {draft.sections.length === 0 ? <div className="studio-empty"><h2>No sections yet</h2><p>Add a typed section to begin. Summary, experience, skills, education, projects, achievements and certifications are all supported.</p></div> : null}
          {draft.sections.map((section, index) => <article className={`studio-section${section.visible ? '' : ' is-hidden'}`} key={section.id}>
            <div className="studio-section-head">
              <span className="studio-kind">{sectionLabels[section.kind]}</span>
              <input aria-label={`Rename ${section.title} section`} value={section.title} maxLength={120} onChange={(event) => editSection(section.id, (current) => ({ ...current, title: event.target.value }))} />
              <div className="studio-icon-actions">
                <Button type="button" variant="ghost" size="icon" aria-label={`Move ${section.title} up`} disabled={index === 0} onClick={() => edit((current) => ({ ...current, sections: moveSection(current.sections, index, -1) }))}><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Move ${section.title} down`} disabled={index === draft.sections.length - 1} onClick={() => edit((current) => ({ ...current, sections: moveSection(current.sections, index, 1) }))}><ArrowDown /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`${section.visible ? 'Hide' : 'Show'} ${section.title}`} onClick={() => editSection(section.id, (current) => ({ ...current, visible: !current.visible }))}>{section.visible ? <Eye /> : <EyeOff />}</Button>
              </div>
            </div>
            <div className="studio-entries">
              {section.entries.map((entry, entryIndex) => <div className="studio-entry" key={entry.id}>
                <div className="studio-entry-head"><label htmlFor={entry.id}>Entry {entryIndex + 1}</label><div className="studio-icon-actions"><Button type="button" variant="ghost" size="icon" aria-label={`Move entry ${entryIndex + 1} in ${section.title} up`} disabled={entryIndex === 0} onClick={() => edit((current) => ({ ...current, sections: moveEntry(current.sections, section.id, entryIndex, -1) }))}><ArrowUp /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Move entry ${entryIndex + 1} in ${section.title} down`} disabled={entryIndex === section.entries.length - 1} onClick={() => edit((current) => ({ ...current, sections: moveEntry(current.sections, section.id, entryIndex, 1) }))}><ArrowDown /></Button></div></div><textarea id={entry.id} value={entry.body} maxLength={5000} rows={3} placeholder="Write a concise, evidence-grounded entry" onChange={(event) => editSection(section.id, (current) => ({ ...current, entries: current.entries.map((item) => item.id === entry.id ? { ...item, body: event.target.value } : item) }))} />
                <span>{entry.evidence_item_id ? 'Linked to confirmed evidence' : 'Unlinked draft — review before tailoring'}</span>
              </div>)}
              <Button type="button" variant="outline" size="sm" onClick={() => edit((current) => ({ ...current, sections: addEntry(current.sections, section.id) }))}><Plus size={15} /> Add entry</Button>
            </div>
          </article>)}
        </section>
        <aside className="studio-versions" aria-label="Document versions">
          <div><p className="eyebrow">Recovery points</p><h2>Named variants</h2><p>Save the current draft as an immutable snapshot, then restore it whenever needed.</p></div>
          <label htmlFor="snapshot-name">Snapshot name</label><input id="snapshot-name" value={snapshotName} maxLength={120} onChange={(event) => setSnapshotName(event.target.value)} placeholder="e.g. Product design lead" />
          <Button type="button" onClick={() => void snapshot()} disabled={!snapshotName.trim() || dirty}><Save size={16} /> Save snapshot</Button>
          {dirty ? <p className="studio-note">Wait for autosave before snapshotting or restoring.</p> : null}
          <ul>{draft.variants.map((variant) => <li key={variant.id}><div><strong>{variant.name}</strong><span>{new Date(variant.created_at).toLocaleDateString()}</span></div><Button type="button" size="sm" variant="ghost" onClick={() => void restore(variant.id)} disabled={dirty}><RotateCcw size={15} /> Restore</Button></li>)}</ul>
        </aside>
      </div>
    </PageFrame>
  )
}
