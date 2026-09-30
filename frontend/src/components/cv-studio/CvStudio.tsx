import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Check, CheckCircle2, CircleAlert, CloudOff, Download, FileSearch, FileUp, History, Layers, LayoutTemplate,
  ListTree, Loader2, MoreHorizontal, ShieldCheck, Sparkles, Trash2, X,
} from 'lucide-react'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { PageHero } from '#/components/app/PageHero'
import { WorkspaceEmpty, WorkspacePage } from '#/components/app/WorkspacePage'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '#/components/ui/sheet'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { useSession } from '#/hooks/useSession'
import {
  deleteAllCvDocuments, deleteCvDocument, exportCvDocuments, fetchCvArtifactBlob, restoreCvVariant, snapshotCvVariant,
} from '#/lib/api/client'
import type { CvDocument, CvSection, CvStyle, CvVariant } from '#/lib/api/schemas'
import { addSection, moveSection } from '#/lib/cv-studio/editor'
import { readWorkflowContext, writeWorkflowContext } from '#/lib/tools/drafts'
import { cn } from '#/lib/utils'
import { CreateCvDocumentDialog } from './CreateCvDocumentDialog'
import { CvAtsPanel, checklistSummary, useCvQuality } from './CvAtsPanel'
import { CvDesignPanel } from './CvDesignPanel'
import { CvImportDialog } from './CvImportDialog'
import { CvOutline } from './CvOutline'
import { CvPaper, ExactPdfDialog } from './CvPaperPreview'
import { CvSectionEditor } from './CvSectionEditor'
import { CvTailorDialog } from './CvTailorDialog'
import { CvVersionsPanel } from './CvVersionsPanel'
import { LIST_KEY, useCvDraft } from './useCvDraft'
import type { SaveState } from './useCvDraft'

/** What the side panel shows: a studio tool, or the editor of the section clicked on the paper. */
type Tool = 'sections' | 'design' | 'checks' | 'versions'
type Panel = Tool | { sectionId: string }
/** The ATS check renders the real PDF, so it waits until typing settles. */
const QUALITY_SETTLE_MS = 1500
const TOOL_TITLES: Record<Tool, string> = { sections: 'Sections', design: 'Design', checks: 'ATS check', versions: 'Versions' }

function useSettledValue<T>(value: T, delay: number) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return settled
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

function SaveStatus({ state }: { state: SaveState }) {
  const content = state === 'saving'
    ? <><Loader2 size={13} className="cvs-spin" aria-hidden="true" /> Saving…</>
    : state === 'error'
      ? <><CloudOff size={13} aria-hidden="true" /> Couldn’t save</>
      : <><Check size={13} aria-hidden="true" /> Saved</>
  return <span className={cn('cvs-save', `cvs-save--${state}`)} role="status" aria-live="polite" data-testid="save-status">{content}</span>
}

function Banner({ tone, children, onDismiss }: { tone: 'error' | 'ok'; children: ReactNode; onDismiss: () => void }) {
  return (
    <div className={`cvs-banner cvs-banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      <button type="button" onClick={onDismiss}>Dismiss</button>
    </div>
  )
}

export function CvStudio() {
  const { status, openAuthDialog } = useSession()
  const authenticated = status === 'authenticated'
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState('')
  const { listQuery, documentQuery, catalogQuery, documentId, draft, dirty, saveState, edit, open, replace } = useCvDraft(authenticated, setActionError)
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState<'create' | 'import' | 'tailor' | 'pdf' | null>(null)
  const [tailorSeed, setTailorSeed] = useState<{ jobTitle: string; jobDescription: string } | null>(null)
  const autoOpenedTailorRef = useRef(false)
  const [exporting, setExporting] = useState<'pdf' | 'docx' | 'data' | null>(null)
  const [panel, setPanel] = useState<Panel>('sections')
  /** The bottom sheet on narrow screens; on desktop the panel is always shown. */
  const [panelOpen, setPanelOpen] = useState(false)
  const panelHeadingRef = useRef<HTMLHeadingElement>(null)
  const desktop = useBreakpoint() === 'desktop'

  // Job Discovery's "Tailor my CV" leaves a one-shot marker in the workflow
  // context (career-workbench#324). Read it once on mount and clear it
  // immediately so StrictMode's double-invoke or a remount can't reopen it.
  useEffect(() => {
    const context = readWorkflowContext()
    if (context?.tailorPending) {
      setTailorSeed({ jobTitle: context.targetRole ?? '', jobDescription: context.jobDescription ?? '' })
      writeWorkflowContext({ tailorPending: false, updatedAt: Date.now() })
    }
  }, [])

  // The tailor dialog needs `draft.id`: open it once a document has loaded.
  useEffect(() => {
    if (tailorSeed && draft && !autoOpenedTailorRef.current) {
      autoOpenedTailorRef.current = true
      setDialog('tailor')
    }
  }, [tailorSeed, draft])

  const settledRevision = useSettledValue(draft?.updated_at ?? '', QUALITY_SETTLE_MS)
  const qualityRevision = settledRevision || draft?.updated_at || ''
  const quality = useCvQuality(draft?.id ?? '', qualityRevision, draft?.style.template_id ?? 'ats-essential')

  const editSections = (change: (sections: CvSection[]) => CvSection[]) =>
    edit((current) => ({ ...current, sections: change(current.sections) }))
  const editStyle = (patch: Partial<CvStyle>) => edit((current) => ({ ...current, style: { ...current.style, ...patch } }))

  function openPanel(next: Panel) {
    setPanel(next)
    setPanelOpen(true)
    window.requestAnimationFrame(() => panelHeadingRef.current?.focus())
  }

  async function run(fallback: string, action: () => Promise<void>) {
    setActionError('')
    try {
      await action()
      return true
    } catch (error) {
      setActionError(error instanceof Error ? error.message : fallback)
      return false
    }
  }

  const saveVersion = async (name: string) => !draft || dirty ? false : run('The version could not be saved.', async () => {
    await snapshotCvVariant(draft.id, name)
    await documentQuery.refetch()
    setNotice(`Saved “${name}” to your versions.`)
  })

  async function restoreVersion(variantId: string) {
    if (!draft || dirty) return
    await run('The version could not be restored.', async () => {
      replace(await restoreCvVariant(draft.id, variantId))
      await documentQuery.refetch()
      setNotice('Version restored. Your previous CV is kept in your versions.')
    })
  }

  async function exportFile(format: 'pdf' | 'docx' | 'data') {
    if (!draft || exporting || (dirty && format !== 'data')) return
    setExporting(format)
    await run('Your CV data could not be downloaded.', async () => {
      if (format === 'data') {
        const payload = await exportCvDocuments()
        download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), 'career-workbench-cv-data.json')
        return
      }
      // Renderer errors stay generic: the saved CV is untouched either way.
      const blob = await fetchCvArtifactBlob(draft.id, format).catch(() => {
        throw new Error(`We couldn’t create the ${format.toUpperCase()} just now. Please try again.`)
      })
      download(blob, `${safeFilename(draft.name)}.${format}`)
    })
    setExporting(null)
  }

  function openDocument(created: CvDocument) {
    queryClient.setQueryData<{ items: CvDocument[] }>(LIST_KEY, (current) => ({
      items: [created, ...(current?.items ?? []).filter((item) => item.id !== created.id)],
    }))
    switchDocument(created.id)
  }

  function switchDocument(id: string | null) {
    open(id)
    setPanel('sections')
  }

  async function removeDocument(all: boolean) {
    if (!draft || dirty) return
    const message = all
      ? 'Delete all of your CVs and every saved version? This can’t be undone.'
      : `Delete “${draft.name}” and all of its versions? This can’t be undone.`
    if (!window.confirm(message)) return
    await run('The CV could not be deleted.', async () => {
      if (all) await deleteAllCvDocuments()
      else await deleteCvDocument(draft.id)
      switchDocument(null)
      await queryClient.invalidateQueries({ queryKey: LIST_KEY })
    })
  }

  function handleTailorSaved(variant: CvVariant) {
    setNotice(`Saved “${variant.name}” to your versions. Restore it whenever you want to use it.`)
    void documentQuery.refetch()
  }

  if (status === 'loading') return <WorkspacePage wide className="cvs-page"><div className="cvs-skeleton" role="status" aria-label="Checking your session" /></WorkspacePage>
  if (!authenticated) {
    return <AppStatePanel title="CV Studio" description="Sign in to write, design and export your CV, and keep every version safe." actions={[{ label: 'Sign in', onClick: () => openAuthDialog({ to: '/cv-studio', reason: 'CV Studio is private to your account.' }) }]} />
  }
  if (listQuery.isError || catalogQuery.isError || documentQuery.isError) {
    return <AppStatePanel title="CV Studio didn’t load" description="Your CVs are safe and nothing was changed. Try again in a moment." actions={[{ label: 'Try again', onClick: () => { void listQuery.refetch(); void catalogQuery.refetch(); void documentQuery.refetch() } }]} />
  }
  if (listQuery.isPending || catalogQuery.isPending || (documentId && documentQuery.isPending)) {
    return (
      <WorkspacePage wide className="cvs-page">
        <PageHero title="CV Studio" purpose="Write it once, pick a look, and tailor it to every job." />
        <div className="cvs-skeleton" role="status" aria-label="Loading CV Studio" />
      </WorkspacePage>
    )
  }
  const catalog = catalogQuery.data
  const closeDialog = (open: boolean) => { if (!open) setDialog(null) }
  const startDialogs = (
    <>
      <CreateCvDocumentDialog open={dialog === 'create'} onOpenChange={closeDialog} onCreated={openDocument} />
      <CvImportDialog open={dialog === 'import'} onOpenChange={closeDialog} onImported={openDocument} />
    </>
  )

  if (!listQuery.data?.items.length) {
    return (
      <WorkspacePage wide className="cvs-page">
        <PageHero
          title="CV Studio"
          purpose="Write it once, pick a look, and tailor it to every job. We check that application systems can read it."
        />
        <div className="cvs-empty-panel">
          <WorkspaceEmpty
            title="Let’s start with your CV"
            description="Import the CV you already have and we’ll turn it into editable sections. Or start from the facts you’ve saved in your Evidence."
            action={(
              <div className="cvs-empty-actions">
                <Button type="button" onClick={() => setDialog('import')}><FileUp size={16} /> Import your CV (PDF/DOCX)</Button>
                <Button type="button" variant="outline" onClick={() => setDialog('create')}><Layers size={16} /> Start from your Evidence</Button>
              </div>
            )}
          />
        </div>
        {startDialogs}
      </WorkspacePage>
    )
  }
  if (!draft) return null

  const documents = listQuery.data.items
  const checks = quality.data?.checks
  const templateName = catalog.templates.find((template) => template.id === draft.style.template_id)?.name ?? ''
  const activeSection = typeof panel === 'object' ? draft.sections.find((section) => section.id === panel.sectionId) : undefined
  const tool: Tool | null = typeof panel === 'string' ? panel : activeSection ? null : 'sections'

  function addAndOpen(kind: CvSection['kind']) {
    const next = addSection(draft!.sections, kind)
    editSections(() => next)
    openPanel({ sectionId: next[next.length - 1].id })
  }

  const toolButton = (id: Tool, Icon: typeof ListTree, extra?: ReactNode, tone?: 'pass' | 'fail') => (
    <button
      type="button"
      className={cn('cvs-tool', tone && `cvs-tool--${tone}`, tool === id && (desktop || panelOpen) && 'is-active')}
      {...(desktop
        ? { 'aria-pressed': tool === id }
        : { 'aria-haspopup': 'dialog' as const, 'aria-expanded': panelOpen && tool === id })}
      onClick={() => openPanel(id)}
    >
      <Icon size={15} aria-hidden="true" /> {TOOL_TITLES[id]}{extra}
    </button>
  )

  // Desktop: the panel sits beside the paper. Narrower screens: paper first, the panel opens as a bottom sheet.
  const PanelTitle = desktop ? 'h2' : SheetTitle
  const panelHead = (
    <header className="cvs-panel__head">
      {activeSection ? (
        <Button type="button" variant="ghost" size="icon-sm" aria-label="All sections" onClick={() => openPanel('sections')}><ArrowLeft /></Button>
      ) : null}
      <PanelTitle {...(desktop ? { id: 'cvs-panel-title' } : {})} ref={panelHeadingRef} tabIndex={-1} className="cvs-panel__title">
        {activeSection ? `Edit ${activeSection.title || 'section'}` : TOOL_TITLES[tool ?? 'sections']}
      </PanelTitle>
      {desktop ? null : <Button type="button" variant="ghost" size="icon-sm" aria-label="Close panel" onClick={() => setPanelOpen(false)}><X /></Button>}
    </header>
  )
  const panelBody = (
    <div className="cvs-panel__body">
      {activeSection ? (
        <CvSectionEditor key={activeSection.id} section={activeSection} onSections={editSections} />
      ) : tool === 'design' ? (
        <CvDesignPanel style={draft.style} catalog={catalog} onChange={editStyle} />
      ) : tool === 'checks' ? (
        <CvAtsPanel
          quality={quality} sections={draft.sections} onAddSection={addAndOpen}
          onShowSection={(sectionId) => editSections((sections) => sections.map((section) => section.id === sectionId ? { ...section, visible: true } : section))}
          atsMode={draft.style.ats_mode} onTurnOnAtsMode={() => { editStyle({ ats_mode: true }); openPanel('design') }}
        />
      ) : tool === 'versions' ? (
        <CvVersionsPanel variants={draft.variants} busy={dirty} onSave={saveVersion} onRestore={restoreVersion} />
      ) : (
        <>
          <p className="cvs-muted">Click a section on the page to edit it. Reorder, hide or add sections here.</p>
          <CvOutline
            sections={draft.sections}
            onMove={(index, delta) => editSections((sections) => moveSection(sections, index, delta))}
            onToggle={(sectionId) => editSections((sections) => sections.map((section) => section.id === sectionId ? { ...section, visible: !section.visible } : section))}
            onAdd={addAndOpen}
            onOpen={(sectionId) => openPanel({ sectionId })}
          />
        </>
      )}
    </div>
  )

  const hero = (
    <header className="cvs-bar">
      <div className="cvs-bar__doc">
        <span className="sr-only">{draft.name}</span>
        <input
          className="cvs-title" aria-label="Document name" value={draft.name} maxLength={120}
          size={Math.max(8, Math.min(draft.name.length + 1, 40))}
          onChange={(event) => edit((current) => ({ ...current, name: event.target.value }))}
        />
        <span className="cvs-purpose"><SaveStatus state={saveState} />{templateName ? <span className="cvs-purpose__template">{templateName}</span> : null}</span>
      </div>
      <div className="cvs-bar__actions">
        {documents.length > 1 ? (
          <select
            className="cvs-select" aria-label="Your CVs" value={draft.id} disabled={dirty}
            onChange={(event) => switchDocument(event.target.value)}
          >
            {documents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={() => setDialog('tailor')}><Sparkles size={14} /> Tailor to a job</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon-sm" aria-label="More options"><MoreHorizontal size={14} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>New CV</DropdownMenuLabel>
            <DropdownMenuItem disabled={dirty} onSelect={() => setDialog('import')}><FileUp /> Import a PDF or DOCX</DropdownMenuItem>
            <DropdownMenuItem disabled={dirty} onSelect={() => setDialog('create')}><Layers /> Start from your Evidence</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={dirty || exporting === 'docx'} onSelect={() => void exportFile('docx')}><Download /> Export DOCX</DropdownMenuItem>
            <DropdownMenuItem disabled={exporting === 'data'} onSelect={() => void exportFile('data')}><Download /> Download my CV data</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={dirty} onSelect={() => void removeDocument(false)}><Trash2 /> Delete this CV</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" disabled={dirty} onSelect={() => void removeDocument(true)}><Trash2 /> Delete all CVs</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" size="sm" loading={exporting === 'pdf'} disabled={dirty} onClick={() => void exportFile('pdf')}><Download size={14} /> Export PDF</Button>
      </div>
    </header>
  )

  return (
    <WorkspacePage wide className="cvs-page cvs-page--editor">
      {hero}
      {actionError ? <Banner tone="error" onDismiss={() => setActionError('')}>{actionError}</Banner> : null}
      {notice ? <Banner tone="ok" onDismiss={() => setNotice('')}>{notice}</Banner> : null}

      <div className="cvs-studio">
        <div className="cvs-side">
          <nav className="cvs-tabs" aria-label="Studio tools">
            {toolButton('sections', ListTree)}
            {toolButton('design', LayoutTemplate)}
            {toolButton('checks', checks ? (checks.every((check) => check.passed) ? CheckCircle2 : CircleAlert) : ShieldCheck, checks ? (
              <span className={cn('cvs-tool__badge', checks.every((check) => check.passed) ? 'is-pass' : 'is-fail')}>{checklistSummary(checks)}</span>
            ) : null, checks ? (checks.every((check) => check.passed) ? 'pass' : 'fail') : undefined)}
            {toolButton('versions', History, <span className="cvs-tool__count">{draft.variants.length}</span>)}
          </nav>
          {desktop ? (
            <aside className="cvs-panel" aria-labelledby="cvs-panel-title">{panelHead}{panelBody}</aside>
          ) : (
            <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
              <SheetContent side="bottom" showCloseButton={false} aria-describedby={undefined} className="cvs-sheet">{panelHead}{panelBody}</SheetContent>
            </Sheet>
          )}
        </div>

        <div className="cvs-canvas">
          <div className="cvs-canvas__bar">
            <span>Live preview</span>
            <button type="button" className="cvs-tool" disabled={dirty} onClick={() => setDialog('pdf')}><FileSearch size={14} aria-hidden="true" /> View exact PDF</button>
          </div>
          <CvPaper
            name={draft.name} sections={draft.sections} style={draft.style} catalog={catalog}
            activeId={activeSection?.id} onEdit={(sectionId) => openPanel({ sectionId })}
          />
        </div>
      </div>

      {startDialogs}
      <CvTailorDialog
        open={dialog === 'tailor'} onOpenChange={closeDialog} documentId={draft.id} canGenerate={!dirty}
        remainingRuns={draft.tailoring_model_run_limit - draft.tailoring_model_runs} onSaved={handleTailorSaved}
        onGenerated={() => void documentQuery.refetch()} seed={tailorSeed}
      />
      <ExactPdfDialog open={dialog === 'pdf'} onOpenChange={closeDialog} documentId={draft.id} documentName={draft.name} revision={draft.updated_at} style={draft.style} templateName={templateName} />
    </WorkspacePage>
  )
}
