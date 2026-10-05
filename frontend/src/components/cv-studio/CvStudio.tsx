import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, FileUp, LayoutTemplate, Layers, MoreHorizontal, Sparkles, Trash2 } from 'lucide-react'
import {
  Badge, Button, Cluster, ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger, EmptyState, ErrorState, Input, Notice, Page, PageHeader, Select, Sheet, SheetBody,
  SheetContent, SheetHeader, SheetTitle, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger,
} from '#/components/kit'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { useSession } from '#/hooks/useSession'
import {
  deleteAllCvDocuments, deleteCvDocument, exportCvDocuments, fetchCvArtifactBlob, restoreCvVariant, snapshotCvVariant,
} from '#/lib/api/client'
import type { CvDocument, CvSection, CvStyle, CvVariant } from '#/lib/api/schemas'
import { addSection, moveSection, moveSectionTo } from '#/lib/cv-studio/editor'
import { readWorkflowContext, writeWorkflowContext } from '#/lib/tools/drafts'
import { CreateCvDocumentDialog } from './CreateCvDocumentDialog'
import { CvAtsPanel, useCvQuality } from './CvAtsPanel'
import { CvDesignPanel } from './CvDesignPanel'
import { CvDesk } from './CvDesk'
import { CvExportMoment, countPdfPages } from './CvExportMoment'
import type { ExportMoment } from './CvExportMoment'
import { CvImportDialog } from './CvImportDialog'
import { CvOutline } from './CvOutline'
import { CvPaper, ExactPdfDialog } from './CvPaperPreview'
import { CvSaveStatus } from './CvSaveStatus'
import { CvSectionEditor } from './CvSectionEditor'
import { CvTailorDialog } from './CvTailorDialog'
import { CvVersionPreviewDialog } from './CvVersionPreviewDialog'
import { CvVersionsPanel } from './CvVersionsPanel'
import type { VersionExport } from './CvVersionsPanel'
import { VersionExportUnavailable, fetchVariantArtifactBlob } from './cvApi'
import { LIST_KEY, useCvDraft } from './useCvDraft'

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

/** The studio's frame while the CV loads: the same bar, tools column and desk, so nothing moves when it arrives. */
function StudioSkeleton() {
  return (
    <Page width="full" className="cvs-page">
      <h1 className="kit-sr-only">CV Studio</h1>
      <div className="cvs-bar">
        <Skeleton variant="block" width="16rem" height={48} label="Loading CV Studio" />
        <Skeleton variant="block" width="16rem" height={44} />
      </div>
      <div className="cvs-studio" aria-hidden="true">
        <div className="cvs-side">
          <div className="cvs-side__tabs">
            <Skeleton variant="block" width="5.5rem" height={44} />
            <Skeleton variant="block" width="4.5rem" height={44} />
            <Skeleton variant="block" width="6rem" height={44} />
          </div>
          <div className="cvs-side__frame">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="cvs-sec">
                <div className="cvs-sec__head"><span /><Skeleton variant="block" width="9rem" height={18} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="cvs-desk">
          <div className="cvs-desk__top"><Skeleton variant="block" width="13rem" height={40} /><Skeleton variant="block" width="8rem" height={24} /></div>
          <div className="cvs-paper-skeleton"><Skeleton lines={6} /></div>
        </div>
      </div>
    </Page>
  )
}

export function CvStudio() {
  const { status, openAuthDialog } = useSession()
  const authenticated = status === 'authenticated'
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState('')
  const {
    listQuery, documentQuery, catalogQuery, documentId, draft, dirty, saveState, edit, open, replace, retrySave,
    conflict, lastSavedAt, lastCheckedAt, reloadNewer, keepMine,
  } = useCvDraft(authenticated)
  /** A line under the bar, with the version it is about when there is one (a freshly tailored version). */
  const [notice, setNotice] = useState<{ text: string; variant?: CvVariant } | null>(null)
  const [moment, setMoment] = useState<ExportMoment | null>(null)
  const momentCount = useRef(0)
  const [zoom, setZoom] = useState<'fit' | 'read'>('fit')
  const [previewVariant, setPreviewVariant] = useState<CvVariant | null>(null)
  const [versionExport, setVersionExport] = useState<VersionExport>(null)
  const [dialog, setDialog] = useState<'create' | 'import' | 'tailor' | 'pdf' | null>(null)
  const [tailorSeed, setTailorSeed] = useState<{ jobTitle: string; jobDescription: string } | null>(null)
  const autoOpenedTailorRef = useRef(false)
  const [exporting, setExporting] = useState<'pdf' | 'docx' | 'data' | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  /** Kept while the dialog fades out, so its text does not flip to the other variant. */
  const [confirmKind, setConfirmKind] = useState<'one' | 'all'>('one')
  const [deleting, setDeleting] = useState(false)
  const [panel, setPanel] = useState<Panel>('sections')
  /** The bottom sheet on narrow screens; on desktop the panel is always shown. */
  const [panelOpen, setPanelOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  /** The two "new CV" dialogs open from the overflow menu, whose item is gone by the time they close. */
  const returnToMenu = (event: Event) => {
    if (!menuTriggerRef.current) return
    event.preventDefault()
    menuTriggerRef.current.focus()
  }
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

  /** Show a tool or a section's editor. On desktop focus moves to the panel heading; on narrow screens the sheet takes focus itself. */
  function openPanel(next: Panel) {
    setPanel(next)
    setPanelOpen(true)
    if (desktop && typeof next === 'object') {
      window.requestAnimationFrame(() => {
        const heading = panelRef.current?.querySelector<HTMLElement>('h2')
        heading?.setAttribute('tabindex', '-1')
        heading?.focus()
      })
    }
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
    setNotice({ text: `Saved “${name}” to your versions.` })
  })

  async function restoreVersion(variantId: string) {
    if (!draft || dirty) return
    await run('The version could not be restored.', async () => {
      replace(await restoreCvVariant(draft.id, variantId))
      await documentQuery.refetch()
      setNotice({ text: 'Version restored. Your previous CV is kept in your versions.' })
    })
  }

  /** The moment an export lands: the page count comes from the file itself, the checks from this CV's last ATS run. */
  async function celebrate(format: 'pdf' | 'docx', filename: string, blob: Blob) {
    const checks = quality.data?.checks
    momentCount.current += 1
    setMoment({
      id: momentCount.current, format, filename,
      pages: format === 'pdf' ? await countPdfPages(blob) : null,
      checks: checks && checks.length > 0 ? { passing: checks.filter((check) => check.passed).length, total: checks.length } : null,
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
      const filename = `${safeFilename(draft.name)}.${format}`
      download(blob, filename)
      await celebrate(format, filename, blob)
    })
    setExporting(null)
  }

  /** A saved version as a file, without touching the working CV. */
  async function exportVersion(variant: CvVariant, format: 'pdf' | 'docx') {
    if (!draft || versionExport) return
    setVersionExport({ variantId: variant.id, format })
    await run('The version could not be exported.', async () => {
      const blob = await fetchVariantArtifactBlob(draft.id, variant.id, format).catch((error) => {
        throw new Error(error instanceof VersionExportUnavailable
          ? 'Exporting a saved version isn’t available on this server yet. Use it as your CV, then export that.'
          : `We couldn’t create the ${format.toUpperCase()} just now. Please try again.`)
      })
      const filename = `${safeFilename(variant.name)}.${format}`
      download(blob, filename)
      await celebrate(format, filename, blob)
    })
    setVersionExport(null)
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
    setDeleting(true)
    await run('The CV could not be deleted.', async () => {
      if (all) await deleteAllCvDocuments()
      else await deleteCvDocument(draft.id)
      switchDocument(null)
      await queryClient.invalidateQueries({ queryKey: LIST_KEY })
    })
    setDeleting(false)
    setConfirmOpen(false)
  }

  function handleTailorSaved(variant: CvVariant) {
    setNotice({ text: `Saved “${variant.name}” to your versions.`, variant })
    void documentQuery.refetch()
  }

  async function reload() {
    if (!(await reloadNewer())) setActionError('We couldn’t load the newer version just now. Your CV hasn’t changed.')
  }

  if (status === 'loading') return <StudioSkeleton />
  if (!authenticated) {
    return (
      <Page>
        <EmptyState
          size="page" headingLevel={1} title="CV Studio"
          description="Sign in to write, design and export your CV, and keep every version safe."
          action={<Button type="button" onClick={() => openAuthDialog({ to: '/cv-studio', reason: 'CV Studio is private to your account.' })}>Sign in</Button>}
        />
      </Page>
    )
  }
  if (listQuery.isError || catalogQuery.isError || documentQuery.isError) {
    return (
      <Page>
        <PageHeader title="CV Studio" />
        <ErrorState
          headingLevel={2} title="CV Studio didn’t load"
          description="Your CVs are safe and nothing was changed. Try again in a moment."
          retrying={listQuery.isFetching || catalogQuery.isFetching || documentQuery.isFetching}
          onRetry={() => { void listQuery.refetch(); void catalogQuery.refetch(); void documentQuery.refetch() }}
        />
      </Page>
    )
  }
  if (listQuery.isPending || catalogQuery.isPending || (documentId && documentQuery.isPending)) return <StudioSkeleton />

  const catalog = catalogQuery.data
  const closeDialog = (next: boolean) => { if (!next) setDialog(null) }
  const startDialogs = (
    <>
      <CreateCvDocumentDialog open={dialog === 'create'} onOpenChange={closeDialog} onCreated={openDocument} onCloseAutoFocus={returnToMenu} />
      <CvImportDialog open={dialog === 'import'} onOpenChange={closeDialog} onImported={openDocument} onCloseAutoFocus={returnToMenu} />
    </>
  )

  if (!listQuery.data?.items.length) {
    return (
      <Page>
        <PageHeader title="CV Studio" lead="Write it once, pick a look, and tailor it to every job. We check that application systems can read it." />
        <EmptyState
          headingLevel={2}
          title="Let’s start with your CV"
          description="Import the CV you already have and we’ll turn it into editable sections. Or start from the facts you’ve saved in your Evidence."
          action={(
            <Cluster gap={2}>
              <Button type="button" onClick={() => setDialog('import')}><FileUp aria-hidden="true" /> Import your CV (PDF/DOCX)</Button>
              <Button type="button" variant="secondary" onClick={() => setDialog('create')}><Layers aria-hidden="true" /> Start from your Evidence</Button>
            </Cluster>
          )}
        />
        {startDialogs}
      </Page>
    )
  }
  if (!draft) return <StudioSkeleton />

  const documents = listQuery.data.items
  const checks = quality.data?.checks
  const failingChecks = checks?.filter((check) => !check.passed).length ?? 0
  const checksPass = failingChecks === 0
  const templateName = catalog.templates.find((template) => template.id === draft.style.template_id)?.name ?? ''
  const activeSection = typeof panel === 'object' ? draft.sections.find((section) => section.id === panel.sectionId) : undefined
  /** The tab that is selected: a section's editor belongs to Sections. */
  const tool: Tool = typeof panel === 'string' ? panel : 'sections'

  function addAndOpen(kind: CvSection['kind']) {
    const next = addSection(draft!.sections, kind)
    editSections(() => next)
    openPanel({ sectionId: next[next.length - 1].id })
  }

  const chooseTool = (id: Tool) => { if (desktop) setPanel(id); else openPanel(id) }
  const phone = !desktop

  const restoreFromPreview = (variant: CvVariant) => {
    setPreviewVariant(null)
    void restoreVersion(variant.id)
  }

  const sectionEditor = activeSection ? (
    <>
      {desktop ? <h2 className="kit-sr-only">{`Edit ${activeSection.title || 'section'}`}</h2> : null}
      <CvSectionEditor key={activeSection.id} section={activeSection} onSections={editSections} onBack={() => openPanel('sections')} inline={desktop} />
    </>
  ) : null

  const panelBody = activeSection && phone ? sectionEditor : (
    <>
      {desktop && !activeSection ? <h2 className="kit-sr-only">{TOOL_TITLES[tool]}</h2> : null}
      {tool === 'design' ? (
        <CvDesignPanel style={draft.style} catalog={catalog} onChange={editStyle} />
      ) : tool === 'checks' ? (
        <CvAtsPanel
          quality={quality} sections={draft.sections} onAddSection={addAndOpen}
          onShowSection={(sectionId) => editSections((sections) => sections.map((section) => section.id === sectionId ? { ...section, visible: true } : section))}
          atsMode={draft.style.ats_mode} density={draft.style.density}
          onTurnOnAtsMode={() => { editStyle({ ats_mode: true }); openPanel('design') }}
          onCompactSpacing={() => editStyle({ density: 'compact' })}
          onExportPdf={() => void exportFile('pdf')} exporting={exporting === 'pdf'} canExport={!dirty}
        />
      ) : tool === 'versions' ? (
        <CvVersionsPanel
          variants={draft.variants} currentSections={draft.sections} busy={dirty} exporting={versionExport}
          onSave={saveVersion} onRestore={restoreVersion} onPreview={setPreviewVariant} onExport={(variant, format) => void exportVersion(variant, format)}
        />
      ) : (
        <CvOutline
          sections={draft.sections} activeId={activeSection?.id} editor={sectionEditor}
          onMove={(index, delta) => editSections((sections) => moveSection(sections, index, delta))}
          onMoveTo={(from, to) => editSections((sections) => moveSectionTo(sections, from, to))}
          onToggle={(sectionId) => editSections((sections) => sections.map((section) => section.id === sectionId ? { ...section, visible: !section.visible } : section))}
          onAdd={addAndOpen}
          onOpen={(sectionId) => openPanel({ sectionId })}
          onClose={() => setPanel('sections')}
        />
      )}
    </>
  )

  const tab = (id: Tool, content?: ReactNode, count?: number) => (
    <TabsTrigger
      value={id} count={count} onClick={() => chooseTool(id)}
      {...(phone ? { 'aria-haspopup': 'dialog' as const, 'aria-controls': undefined } : {})}
    >
      {TOOL_TITLES[id]}{content ? ' ' : null}{content}
    </TabsTrigger>
  )

  const tools = (
    <Tabs variant={desktop ? 'folder' : 'plain'} value={tool} onValueChange={(next) => { if (desktop) setPanel(next as Tool) }} activationMode={desktop ? 'automatic' : 'manual'} className="cvs-tabs">
      <TabsList aria-label="Studio tools">
        {tab('sections')}
        {tab('design')}
        {tab('checks', checks && !checksPass ? (
          <Badge size="sm" tone="rose">{failingChecks}{' '}<span className="kit-sr-only">to fix</span></Badge>
        ) : null)}
        {tab('versions', null, draft.variants.length)}
      </TabsList>
      {desktop ? (
        <TabsContent value={tool} ref={panelRef} className="cvs-panel">{panelBody}</TabsContent>
      ) : (
        <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
          <SheetContent side="bottom" closeLabel="Close panel" aria-describedby={undefined}>
            <SheetHeader>
              <SheetTitle>{activeSection ? `Edit ${activeSection.title || 'section'}` : TOOL_TITLES[tool]}</SheetTitle>
            </SheetHeader>
            <SheetBody><TabsContent value={tool} tabIndex={-1} className="cvs-panel cvs-panel--sheet">{panelBody}</TabsContent></SheetBody>
          </SheetContent>
        </Sheet>
      )}
    </Tabs>
  )

  const newerNotice = conflict ? (
    <Notice
      tone="warning"
      title={dirty ? 'This CV was saved somewhere else' : 'A newer version of this CV is available'}
      action={(
        <Cluster gap={2}>
          <Button type="button" size="sm" variant="secondary" onClick={() => void reload()}>Reload newer version</Button>
          {dirty ? <Button type="button" size="sm" variant="ghost" onClick={() => void keepMine()}>Keep my version</Button> : null}
        </Cluster>
      )}
    >
      {dirty
        ? 'Another tab or device saved this CV after you opened it. Your latest edits here are not saved yet: reload the newer version, or keep yours and replace it.'
        : 'Another tab or device saved this CV after you opened it. Reload it so your next edit builds on the latest version.'}
    </Notice>
  ) : null

  return (
    <Page width="full" className="cvs-page">
      <h1 className="kit-sr-only">CV Studio</h1>
      <header className="cvs-bar">
        <div className="cvs-bar__doc">
          <Input
            className="cvs-bar__name" aria-label="Document name" value={draft.name} maxLength={120}
            onChange={(event) => edit((current) => ({ ...current, name: event.target.value }))}
          />
          <CvSaveStatus
            state={saveState} savedAt={lastSavedAt ?? (Date.parse(draft.updated_at) || null)} checkedAt={lastCheckedAt} onRetry={retrySave}
          />
          {templateName ? <Badge tone="white" className="cvs-bar__template"><LayoutTemplate aria-hidden="true" />{templateName}</Badge> : null}
        </div>
        <div className="cvs-bar__actions">
          {documents.length > 1 ? (
            <Select size="sm" className="cvs-bar__select" aria-label="Your CVs" leading={`${documents.findIndex((item) => item.id === draft.id) + 1} of ${documents.length}`} value={draft.id} disabled={dirty} onChange={(event) => switchDocument(event.target.value)}>
              {documents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          ) : null}
          <Button type="button" variant="secondary" className="cvs-bar__tailor" onClick={() => setDialog('tailor')}><Sparkles aria-hidden="true" /> Tailor to a job</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button ref={menuTriggerRef} type="button" variant="secondary" iconOnly aria-label="More options"><MoreHorizontal aria-hidden="true" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>New CV</DropdownMenuLabel>
              <DropdownMenuItem icon={<FileUp />} disabled={dirty} onSelect={() => setDialog('import')}>Import a PDF or DOCX</DropdownMenuItem>
              <DropdownMenuItem icon={<Layers />} disabled={dirty} onSelect={() => setDialog('create')}>Start from your Evidence</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Download />} disabled={dirty || exporting === 'docx'} onSelect={() => void exportFile('docx')}>Export DOCX</DropdownMenuItem>
              <DropdownMenuItem icon={<Download />} disabled={exporting === 'data'} onSelect={() => void exportFile('data')}>Download my CV data</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive icon={<Trash2 />} disabled={dirty} onSelect={() => { setConfirmKind('one'); setConfirmOpen(true) }}>Delete this CV</DropdownMenuItem>
              <DropdownMenuItem destructive icon={<Trash2 />} disabled={dirty} onSelect={() => { setConfirmKind('all'); setConfirmOpen(true) }}>Delete all CVs</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" className="cvs-bar__export" loading={exporting === 'pdf'} disabled={dirty} onClick={() => void exportFile('pdf')}><Download aria-hidden="true" /> Export PDF</Button>
        </div>
      </header>

      {actionError || notice || saveState === 'error' || conflict ? (
        <div className="cvs-notices">
          {newerNotice}
          {saveState === 'error' ? (
            <Notice tone="danger" action={<Button type="button" size="sm" variant="secondary" onClick={retrySave}>Try again</Button>}>
              We couldn’t save your latest changes. Keep this page open and try again.
            </Notice>
          ) : null}
          {actionError ? <Notice tone="danger" onDismiss={() => setActionError('')}>{actionError}</Notice> : null}
          {notice ? (
            <Notice
              tone="success" onDismiss={() => setNotice(null)}
              action={notice.variant ? (
                <Cluster gap={2}>
                  <Button type="button" size="sm" variant="secondary" onClick={() => { setPreviewVariant(notice.variant ?? null); setNotice(null) }}>Preview</Button>
                  <Button type="button" size="sm" variant="secondary" loading={versionExport?.variantId === notice.variant.id && versionExport.format === 'pdf'} onClick={() => notice.variant && void exportVersion(notice.variant, 'pdf')}>Export PDF</Button>
                </Cluster>
              ) : undefined}
            >
              {notice.text}
            </Notice>
          ) : null}
        </div>
      ) : null}

      <div className="cvs-studio">
        {desktop ? <aside className="cvs-side" aria-label="CV tools">{tools}</aside> : <div className="cvs-side">{tools}</div>}

        <CvDesk phone={phone} zoom={zoom} onZoomChange={setZoom} pdfDisabled={dirty} onViewPdf={() => setDialog('pdf')}>
          <CvPaper
            name={draft.name} sections={draft.sections} style={draft.style} catalog={catalog}
            activeId={activeSection?.id} onEdit={(sectionId) => openPanel({ sectionId })}
          />
        </CvDesk>
      </div>

      {moment ? (
        <CvExportMoment
          moment={moment} raised={previewVariant !== null || dialog !== null} otherBusy={exporting === (moment.format === 'pdf' ? 'docx' : 'pdf')} onClose={() => setMoment(null)}
          onDownloadOther={() => void exportFile(moment.format === 'pdf' ? 'docx' : 'pdf')}
        />
      ) : null}

      {startDialogs}
      <CvTailorDialog
        open={dialog === 'tailor'} onOpenChange={closeDialog} documentId={draft.id} canGenerate={!dirty}
        remainingRuns={draft.tailoring_model_run_limit - draft.tailoring_model_runs} onSaved={handleTailorSaved}
        onGenerated={() => void documentQuery.refetch()} seed={tailorSeed}
      />
      <ExactPdfDialog open={dialog === 'pdf'} onOpenChange={closeDialog} documentId={draft.id} documentName={draft.name} revision={draft.updated_at} style={draft.style} templateName={templateName} />
      <CvVersionPreviewDialog
        variant={previewVariant} documentName={draft.name} style={draft.style} catalog={catalog} currentSections={draft.sections}
        exporting={versionExport} canRestore={!dirty} error={actionError}
        onOpenChange={(next) => { if (!next) setPreviewVariant(null) }} onExport={(variant, format) => void exportVersion(variant, format)} onRestore={restoreFromPreview}
      />
      <ConfirmDialog
        open={confirmOpen} onOpenChange={setConfirmOpen} pending={deleting}
        title={confirmKind === 'all' ? 'Delete all your CVs?' : 'Delete this CV?'}
        description={confirmKind === 'all'
          ? 'Delete all of your CVs and every saved version? This can’t be undone.'
          : `Delete “${draft.name}” and all of its versions? This can’t be undone.`}
        confirmLabel={confirmKind === 'all' ? 'Delete all CVs' : 'Delete CV'} icon={<Trash2 />}
        onConfirm={() => void removeDocument(confirmKind === 'all')}
        onCloseAutoFocus={(event) => { event.preventDefault(); menuTriggerRef.current?.focus() }}
      />
    </Page>
  )
}
