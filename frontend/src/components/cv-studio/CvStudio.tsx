import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check, ChevronDown, CloudOff, Download, FileSearch, FileText, FileUp, Layers, LayoutTemplate, ListTree,
  Loader2, MoreHorizontal, PenLine, Plus, Sparkles, Trash2,
} from 'lucide-react'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { WorkspaceEmpty, WorkspaceHero, WorkspacePage, WorkspacePanel } from '#/components/app/WorkspacePage'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { useSession } from '#/hooks/useSession'
import {
  deleteAllCvDocuments, deleteCvDocument, exportCvDocuments, fetchCvArtifactBlob, getCvDocument, getCvStyleCatalog,
  listCvDocuments, restoreCvVariant, snapshotCvVariant, updateCvDocument,
} from '#/lib/api/client'
import type { CvDocument, CvSection, CvStyle, CvStyleCatalog, CvVariant } from '#/lib/api/schemas'
import { FALLBACK_STYLE_CATALOG, TEMPLATE_NAMES, friendlyAtsFixes } from '#/lib/cv-studio/catalog'
import { addSection, moveSection, moveSectionTo, toSavableSections } from '#/lib/cv-studio/editor'
import { cn } from '#/lib/utils'
import { CreateCvDocumentDialog } from './CreateCvDocumentDialog'
import { CvAtsPanel, useCvQuality } from './CvAtsPanel'
import { CvDesignPanel } from './CvDesignPanel'
import { CvImportDialog } from './CvImportDialog'
import { CvOutline } from './CvOutline'
import { CvPaper, ExactPdfDialog } from './CvPaperPreview'
import { CvScoreRing, scoreGradient } from './CvScoreRing'
import { CvSectionEditor } from './CvSectionEditor'
import { CvTailorDialog } from './CvTailorDialog'
import { CvVersionsPanel } from './CvVersionsPanel'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type MobileView = 'edit' | 'design' | 'preview'
type RailTab = 'outline' | 'design'
const LIST_KEY = ['cv-studio', 'documents'] as const
const AUTOSAVE_DELAY_MS = 650
/** The ATS check renders the real PDF, so it waits until typing settles. */
const QUALITY_SETTLE_MS = 1500

function useSettledValue<T>(value: T, delay: number) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return settled
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

function timeAgo(iso: string, now: number) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 45) return 'Just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const safeFilename = (name: string) => name.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'cv'

function resolveCatalog(data: CvStyleCatalog | undefined): CvStyleCatalog {
  if (!data) return FALLBACK_STYLE_CATALOG
  return {
    templates: data.templates.length ? data.templates : FALLBACK_STYLE_CATALOG.templates,
    fonts: data.fonts.length ? data.fonts : FALLBACK_STYLE_CATALOG.fonts,
    palette: data.palette.length ? data.palette : FALLBACK_STYLE_CATALOG.palette,
    densities: data.densities.length ? data.densities : FALLBACK_STYLE_CATALOG.densities,
  }
}

function SaveStatus({ state }: { state: SaveState }) {
  const content = state === 'saving'
    ? <><Loader2 size={13} className="cvs-spin" aria-hidden="true" /> Saving…</>
    : state === 'error'
      ? <><CloudOff size={13} aria-hidden="true" /> Couldn’t save</>
      : <><Check size={13} aria-hidden="true" /> Saved</>
  return (
    <span className={cn('cvs-save', `cvs-save--${state}`)} role="status" aria-live="polite" data-testid="save-status">
      {content}
    </span>
  )
}

function StudioSkeleton({ label }: { label: string }) {
  return (
    <WorkspacePage wide className="cvs-page">
      <div className="cvs-loading" role="status" aria-label={label}>
        <span className="cvs-skeleton cvs-skeleton--hero" />
        <div className="cvs-loading__grid">
          <span className="cvs-skeleton" /><span className="cvs-skeleton" /><span className="cvs-skeleton" />
        </div>
      </div>
    </WorkspacePage>
  )
}

export function CvStudio() {
  const { status, openAuthDialog } = useSession()
  const authenticated = status === 'authenticated'
  const queryClient = useQueryClient()
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CvDocument | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [tailorOpen, setTailorOpen] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [exporting, setExporting] = useState<'pdf' | 'docx' | 'data' | null>(null)
  const [railTab, setRailTab] = useState<RailTab>('outline')
  const [mobileView, setMobileView] = useState<MobileView>('edit')
  const saveGeneration = useRef(0)
  const saveQueue = useRef<Promise<CvDocument | undefined>>(Promise.resolve(undefined))
  const now = useNow(30_000)

  const listQuery = useQuery({ queryKey: LIST_KEY, queryFn: listCvDocuments, enabled: authenticated })
  useEffect(() => {
    if (!documentId && listQuery.data?.items[0]) setDocumentId(listQuery.data.items[0].id)
  }, [documentId, listQuery.data])
  const documentQuery = useQuery({
    queryKey: ['cv-studio', 'document', documentId],
    queryFn: () => getCvDocument(documentId!),
    enabled: authenticated && Boolean(documentId),
    refetchOnWindowFocus: false,
  })
  useEffect(() => {
    if (documentQuery.data && !dirty) setDraft(documentQuery.data)
  }, [documentQuery.data, dirty])
  const catalogQuery = useQuery({
    queryKey: ['cv-studio', 'style-catalog'],
    queryFn: getCvStyleCatalog,
    enabled: authenticated,
    staleTime: Infinity,
  })
  const catalog = resolveCatalog(catalogQuery.data)

  useEffect(() => {
    if (!dirty || !draft) return
    const generation = ++saveGeneration.current
    setSaveState('saving')
    const timer = window.setTimeout(async () => {
      try {
        // Serialize writes at the network boundary. Generation checks alone keep
        // UI state fresh, but cannot stop an older PATCH committing after a newer
        // one. A queue preserves edit order while still coalescing the debounce.
        const payload = {
          ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
          sections: toSavableSections(draft.sections),
          style: draft.style,
        }
        saveQueue.current = saveQueue.current
          .catch(() => undefined)
          .then(() => updateCvDocument(draft.id, payload))
        const saved = await saveQueue.current
        if (generation !== saveGeneration.current) return
        // Keep the local sections: they may hold entries the person has only
        // just started (blank entries are left out of the saved payload).
        // Newer edits bumped the generation above, so `draft` is the latest.
        if (saved) {
          const merged = { ...saved, name: draft.name, sections: draft.sections, style: draft.style }
          // Keep the cached document in step so the "sync from server" effect
          // below can't swap the draft back to the pre-save copy.
          queryClient.setQueryData(['cv-studio', 'document', draft.id], merged)
          setDraft(merged)
        }
        setDirty(false)
        setSaveState('saved')
        await queryClient.invalidateQueries({ queryKey: LIST_KEY })
      } catch (error) {
        if (generation !== saveGeneration.current) return
        setSaveState('error')
        setActionError(error instanceof Error ? error.message : 'Your latest changes could not be saved.')
      }
    }, AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [dirty, draft, queryClient])

  const settledRevision = useSettledValue(draft?.updated_at ?? '', QUALITY_SETTLE_MS)
  const qualityRevision = settledRevision || draft?.updated_at || ''
  const quality = useCvQuality(draft?.id ?? '', qualityRevision, draft?.style.template_id ?? 'ats-essential')

  function edit(change: (current: CvDocument) => CvDocument) {
    setDraft((current) => current ? change(current) : current)
    setDirty(true)
    setSaveState('saving')
  }
  const editSections = (change: (sections: CvSection[]) => CvSection[]) =>
    edit((current) => ({ ...current, sections: change(current.sections) }))
  const editStyle = (patch: Partial<CvStyle>) => edit((current) => ({ ...current, style: { ...current.style, ...patch } }))

  function chooseMobileView(view: MobileView) {
    setMobileView(view)
    if (view === 'design') setRailTab('design')
    if (view === 'edit') setRailTab('outline')
  }

  function focusSection(sectionId: string) {
    const target = document.getElementById(`cv-section-${sectionId}`)
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    target?.focus({ preventScroll: true })
  }

  async function saveVersion(name: string) {
    if (!draft || dirty) return false
    setActionError('')
    try {
      await snapshotCvVariant(draft.id, name)
      await documentQuery.refetch()
      setNotice(`Saved “${name}” to your versions.`)
      return true
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The version could not be saved.')
      return false
    }
  }

  async function restoreVersion(variantId: string) {
    if (!draft || dirty) return
    setActionError('')
    try {
      const restored = await restoreCvVariant(draft.id, variantId)
      setDraft(restored)
      setSaveState('saved')
      await documentQuery.refetch()
      setNotice('Version restored. Your CV now matches it.')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The version could not be restored.')
    }
  }

  async function exportArtifact(format: 'pdf' | 'docx') {
    if (!draft || dirty || exporting) return
    setExporting(format)
    setActionError('')
    try {
      const blob = await fetchCvArtifactBlob(draft.id, draft.style.template_id, format)
      download(blob, `${safeFilename(draft.name)}.${format}`)
    } catch {
      setActionError(`We couldn’t create the ${format.toUpperCase()} just now. Please try again.`)
    } finally {
      setExporting(null)
    }
  }

  async function exportData() {
    if (exporting) return
    setExporting('data')
    setActionError('')
    try {
      const payload = await exportCvDocuments()
      download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), 'career-workbench-cv-data.json')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Your CV data could not be downloaded.')
    } finally {
      setExporting(null)
    }
  }

  function openDocument(created: CvDocument) {
    queryClient.setQueryData<{ items: CvDocument[] }>(LIST_KEY, (current) => ({
      items: [created, ...(current?.items ?? []).filter((item) => item.id !== created.id)],
    }))
    setDraft(null)
    setDirty(false)
    setDocumentId(created.id)
    setSaveState('idle')
  }

  async function removeDocument(all: boolean) {
    if (!draft || dirty) return
    const message = all
      ? 'Delete all of your CVs and every saved version? This can’t be undone.'
      : `Delete “${draft.name}” and all of its versions? This can’t be undone.`
    if (!window.confirm(message)) return
    setActionError('')
    try {
      if (all) await deleteAllCvDocuments()
      else await deleteCvDocument(draft.id)
      setDraft(null)
      setDocumentId(null)
      await queryClient.invalidateQueries({ queryKey: LIST_KEY })
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The CV could not be deleted.')
    }
  }

  function handleTailorSaved(variant: CvVariant) {
    setNotice(`Saved “${variant.name}” to your versions. Restore it whenever you want to use it.`)
    void documentQuery.refetch()
  }

  if (status === 'loading') return <StudioSkeleton label="Checking your session" />
  if (!authenticated) {
    return <AppStatePanel title="CV Studio" description="Sign in to write, design and export your CV, and keep every version safe." actions={[{ label: 'Sign in', onClick: () => openAuthDialog({ to: '/cv-studio', reason: 'CV Studio is private to your account.' }) }]} />
  }
  if (listQuery.isPending || (documentId && documentQuery.isPending)) return <StudioSkeleton label="Loading CV Studio" />
  if (listQuery.isError || documentQuery.isError) {
    return <AppStatePanel title="CV Studio didn’t load" description="Your CVs are safe. Nothing was changed." detail="Try loading the studio again." actions={[{ label: 'Try again', onClick: () => { void listQuery.refetch(); void documentQuery.refetch() } }]} />
  }

  const dialogs = (
    <>
      <CreateCvDocumentDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={openDocument} />
      <CvImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={openDocument} />
    </>
  )

  if (!listQuery.data?.items.length) {
    return (
      <WorkspacePage wide className="cvs-page">
        <WorkspaceHero
          icon={FileText}
          eyebrow="CV Studio"
          title="Build a CV you’re proud to send"
          subtitle="Write it once, pick a look, and tailor it to every job. We check that application systems can read it, and keep every version safe."
        >
          <ul className="cvs-chips" aria-label="What you can do here">
            {['Structured editor', 'Live preview', 'ATS check', 'Tailor to a job', 'Versions'].map((chip) => <li key={chip}>{chip}</li>)}
          </ul>
        </WorkspaceHero>
        <WorkspacePanel className="cvs-empty-panel">
          <WorkspaceEmpty
            icon={FileUp}
            title="Let’s start with your CV"
            description="Import the CV you already have and we’ll turn it into editable sections. Or start from the facts you’ve saved in your Evidence."
            action={(
              <div className="cvs-empty-actions">
                <Button type="button" onClick={() => setImportOpen(true)}><FileUp size={16} /> Import your CV (PDF/DOCX)</Button>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}><Layers size={16} /> Start from your Evidence</Button>
              </div>
            )}
          />
        </WorkspacePanel>
        {dialogs}
      </WorkspacePage>
    )
  }
  if (!draft) return null

  const documents = listQuery.data.items
  const visibleSections = draft.sections.filter((section) => section.visible).length
  const atsScore = quality.data?.ats_score
  const atsFixCount = quality.data ? friendlyAtsFixes(quality.data).length : 0
  const remainingTailorRuns = draft.tailoring_model_run_limit - draft.tailoring_model_runs
  const templateName = TEMPLATE_NAMES[draft.style.template_id]

  const heroActions = (
    <>
      <Button type="button" onClick={() => setTailorOpen(true)}><Sparkles size={16} /> Tailor to a job</Button>
      <Button type="button" variant="outline" loading={exporting === 'pdf'} disabled={dirty} onClick={() => void exportArtifact('pdf')}><Download size={16} /> Export PDF</Button>
      <Button type="button" variant="outline" loading={exporting === 'docx'} disabled={dirty} onClick={() => void exportArtifact('docx')}><Download size={16} /> Export DOCX</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" disabled={dirty}><Plus size={16} /> New CV <ChevronDown size={14} /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => setImportOpen(true)}><FileUp /> Import a PDF or DOCX</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}><Layers /> Start from your Evidence</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label="More options"><MoreHorizontal size={16} /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem disabled={exporting === 'data'} onSelect={() => void exportData()}><Download /> Download my CV data</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={dirty} onSelect={() => void removeDocument(false)}><Trash2 /> Delete this CV</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" disabled={dirty} onSelect={() => void removeDocument(true)}><Trash2 /> Delete all CVs</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )

  const stats = [
    {
      label: 'ATS score',
      value: atsScore === undefined ? <span className="cvs-stat-pending">{quality.isError ? 'Unavailable' : 'Checking…'}</span> : (
        <span className={`cvs-stat-score cvs-stat-score--${scoreGradient(atsScore).tone}`}>{atsScore}<small>/100</small></span>
      ),
    },
    { label: 'Sections', value: `${visibleSections}`, hint: visibleSections === draft.sections.length ? 'All shown' : `${draft.sections.length - visibleSections} hidden` },
    { label: 'Last saved', value: saveState === 'saving' ? 'Saving…' : timeAgo(draft.updated_at, now) },
    { label: 'Versions', value: `${draft.variants.length}` },
  ]

  return (
    <WorkspacePage wide className="cvs-page">
      <WorkspaceHero
        icon={FileText}
        eyebrow="CV Studio"
        title={(
          <>
            <span className="sr-only">{draft.name}</span>
            <span className="cvs-title">
              <input
                className="cvs-title__input" aria-label="Document name" value={draft.name} maxLength={120}
                size={Math.max(8, Math.min(draft.name.length + 1, 40))}
                onChange={(event) => edit((current) => ({ ...current, name: event.target.value }))}
              />
              <PenLine size={18} className="cvs-title__icon" aria-hidden="true" />
            </span>
          </>
        )}
        subtitle={(
          <span className="cvs-subtitle">
            <SaveStatus state={saveState} />
            <span>Edit on the left, see it on the right. Everything saves as you type.</span>
          </span>
        )}
        actions={heroActions}
        stats={stats}
      >
        {documents.length > 1 ? (
          <div className="cvs-switcher">
            <label htmlFor="cvs-document-picker">Your CVs</label>
            <select
              id="cvs-document-picker" className="cvs-select" value={draft.id} disabled={dirty}
              onChange={(event) => { setDirty(false); setDraft(null); setDocumentId(event.target.value); setSaveState('idle') }}
            >
              {documents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
        ) : null}
      </WorkspaceHero>

      {actionError ? (
        <div className="cvs-banner cvs-banner--error" role="alert">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')}>Dismiss</button>
        </div>
      ) : null}
      {notice ? (
        <div className="cvs-banner cvs-banner--ok" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')}>Dismiss</button>
        </div>
      ) : null}

      <div className="cvs-mobile-tabs" role="tablist" aria-label="Studio view">
        {([['edit', 'Edit'], ['design', 'Design'], ['preview', 'Preview']] as const).map(([view, label]) => (
          <button key={view} type="button" role="tab" aria-selected={mobileView === view} className={cn('cvs-mobile-tabs__tab', mobileView === view && 'is-active')} onClick={() => chooseMobileView(view)}>
            {label}
          </button>
        ))}
      </div>

      <div className="cvs-studio" data-view={mobileView}>
        <aside className="cvs-rail" aria-label="Outline and design">
          <div className="cvs-rail__tabs" role="tablist" aria-label="Side panel">
            <button type="button" role="tab" id="cvs-tab-outline" aria-controls="cvs-panel-outline" aria-selected={railTab === 'outline'} className={cn('cvs-rail__tab', railTab === 'outline' && 'is-active')} onClick={() => setRailTab('outline')}>
              <ListTree size={15} aria-hidden="true" /> Outline
            </button>
            <button type="button" role="tab" id="cvs-tab-design" aria-controls="cvs-panel-design" aria-selected={railTab === 'design'} className={cn('cvs-rail__tab', railTab === 'design' && 'is-active')} onClick={() => setRailTab('design')}>
              <LayoutTemplate size={15} aria-hidden="true" /> Design
            </button>
          </div>
          <div id="cvs-panel-outline" role="tabpanel" aria-labelledby="cvs-tab-outline" hidden={railTab !== 'outline'} className="cvs-rail__panel">
            <CvOutline
              sections={draft.sections}
              onMove={(index, delta) => editSections((sections) => moveSection(sections, index, delta))}
              onMoveTo={(from, to) => editSections((sections) => moveSectionTo(sections, from, to))}
              onToggle={(sectionId) => editSections((sections) => sections.map((section) => section.id === sectionId ? { ...section, visible: !section.visible } : section))}
              onAdd={(kind) => editSections((sections) => addSection(sections, kind))}
              onFocusSection={focusSection}
            />
          </div>
          <div id="cvs-panel-design" role="tabpanel" aria-labelledby="cvs-tab-design" hidden={railTab !== 'design'} className="cvs-rail__panel">
            <CvDesignPanel style={draft.style} catalog={catalog} onChange={editStyle} />
          </div>
        </aside>

        <section className="cvs-editor" aria-label="CV sections">
          {draft.sections.length === 0 ? (
            <WorkspaceEmpty icon={ListTree} title="Your CV has no sections yet" description="Use “Add section” in the outline to add a summary, your experience, education and skills." />
          ) : draft.sections.map((section) => (
            <CvSectionEditor key={section.id} section={section} onSections={editSections} />
          ))}
        </section>

        <aside className="cvs-preview-col" aria-label="Preview">
          <div className="cvs-preview-col__head">
            <div>
              <p className="cvs-preview-col__kicker">Preview</p>
              <p className="cvs-preview-col__template">{draft.style.ats_mode ? 'ATS-friendly mode' : templateName}</p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={dirty} onClick={() => setPdfOpen(true)}><FileSearch size={15} /> View exact PDF</Button>
          </div>
          <CvPaper name={draft.name} sections={draft.sections} style={draft.style} />
          {atsScore !== undefined ? (
            <a className="cvs-ats-mini" href="#cvs-ats-check">
              <CvScoreRing score={atsScore} size={52} />
              <span className="cvs-ats-mini__text">
                <span className="cvs-ats-mini__title">ATS check<span className="sr-only">: {atsScore} out of 100.</span></span>
                <span className="cvs-ats-mini__hint">
                  {atsFixCount === 0 ? 'Reads cleanly. Nothing to fix.' : `${atsFixCount} ${atsFixCount === 1 ? 'fix' : 'fixes'} to make it safer`}
                </span>
              </span>
            </a>
          ) : null}
        </aside>
      </div>

      <div className="cvs-lower">
        <WorkspacePanel id="cvs-ats-check" kicker="Quality" title="ATS check" description="How well application tracking systems can read your CV." className="cvs-lower__ats" delay={0.1}>
          <CvAtsPanel
            documentId={draft.id} revision={qualityRevision} template={draft.style.template_id} atsMode={draft.style.ats_mode}
            onTurnOnAtsMode={() => { editStyle({ ats_mode: true }); setRailTab('design') }}
          />
        </WorkspacePanel>
        <WorkspacePanel kicker="History" title="Versions" description="Snapshots of this CV you can go back to at any time." className="cvs-lower__versions" delay={0.14}>
          <CvVersionsPanel variants={draft.variants} busy={dirty} onSave={saveVersion} onRestore={restoreVersion} />
        </WorkspacePanel>
      </div>

      {dialogs}
      <CvTailorDialog
        open={tailorOpen} onOpenChange={setTailorOpen} documentId={draft.id} canGenerate={!dirty}
        remainingRuns={remainingTailorRuns} onSaved={handleTailorSaved} onGenerated={() => void documentQuery.refetch()}
      />
      <ExactPdfDialog open={pdfOpen} onOpenChange={setPdfOpen} documentId={draft.id} documentName={draft.name} revision={draft.updated_at} style={draft.style} />
    </WorkspacePage>
  )
}
