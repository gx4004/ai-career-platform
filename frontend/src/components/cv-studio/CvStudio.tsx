import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, FileText, FileUp, LayoutTemplate, Layers, MoreHorizontal, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import {
  Badge, Button, Cluster, ConfirmDialog, Count, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger, EmptyState, ErrorState, Input, List, Notice, Page, PageHeader, Select, Sheet, SheetBody,
  SheetContent, SheetHeader, SheetTitle, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger,
} from '#/components/kit'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { useMediaQuery } from '#/hooks/use-media-query'
import { useSession } from '#/hooks/useSession'
import {
  deleteAllCvDocuments, deleteCvDocument, exportCvDocuments, fetchCvArtifactBlob, restoreCvVariant, snapshotCvVariant,
} from '#/lib/api/client'
import type { CvDocument, CvHeader, CvSection, CvStyle, CvVariant } from '#/lib/api/schemas'
import { addSection, moveSection, moveSectionTo } from '#/lib/cv-studio/editor'
import { EMPTY_HEADER } from '#/lib/cv-studio/header'
import { readWorkflowContext, writeWorkflowContext } from '#/lib/tools/drafts'
import { safeFileName } from '#/lib/tools/exports'
import { CreateCvDocumentDialog } from './CreateCvDocumentDialog'
import { CvAtsPanel, useCvQuality } from './CvAtsPanel'
import { CvDesignTool } from './CvDesignPanel'
import { CvDesk } from './CvDesk'
import { CvExportMoment, countPdfPages } from './CvExportMoment'
import type { ExportMoment } from './CvExportMoment'
import { CvImportDialog } from './CvImportDialog'
import { CvOutline } from './CvOutline'
import { ExactPdfDialog } from './CvExactPdfDialog'
import { CvPagePreview } from './CvPagePreview'
import { CvSaveStatus } from './CvSaveStatus'
import { CvHeaderEditor, CvSectionEditor } from './CvSectionEditor'
import { CvTailorDialog } from './CvTailorDialog'
import { isVersionNameConflict, versionNameTakenMessage } from './versionNames'
import { CvVersionPreviewDialog } from './CvVersionPreviewDialog'
import { CvVersionsPanel } from './CvVersionsPanel'
import type { VersionExport } from './CvVersionsPanel'
import { VersionExportUnavailable, fetchVariantArtifactBlob } from './cvApi'
import { LIST_KEY, useCvDraft } from './useCvDraft'

/** What the side panel shows: a studio tool, or the editor of the header or of the section clicked on the paper. */
type Tool = 'sections' | 'design' | 'checks' | 'versions'
type Panel = Tool | 'header' | { sectionId: string }
/** The ATS check renders the real PDF, so it waits until typing settles. */
const QUALITY_SETTLE_MS = 1500
const TOOL_TITLES: Record<Tool, string> = { sections: 'Sections', design: 'Design', checks: 'ATS check', versions: 'Versions' }
const STUDIO_LEAD = 'Write it once, pick a look, and tailor it to every job. We check that application systems can read it.'

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

const cvFileBase = (name: string) => safeFileName(name) || 'cv'

/** The studio's frame while the CV loads: the same bar, tools column and desk, so nothing moves when it arrives. */
function StudioSkeleton() {
  return (
    <Page width="full" className="cvs-page">
      <h1 className="kit-sr-only">CV Studio</h1>
      <div className="cvs-bar">
        <div className="cvs-bar__doc">
          <Skeleton variant="block" width="16.25rem" height={48} label="Loading CV Studio" />
          <Skeleton variant="block" width="5.5rem" height={24} />
          <Skeleton variant="block" width="9rem" height={24} />
        </div>
        <div className="cvs-bar__actions" aria-hidden="true">
          <Skeleton variant="block" width="10rem" height={44} />
          <Skeleton variant="block" width="2.75rem" height={44} />
          <Skeleton variant="block" width="9rem" height={44} />
        </div>
      </div>
      <div className="cvs-studio" aria-hidden="true">
        <div className="cvs-side">
          <div className="cvs-side__tabs">
            <Skeleton variant="block" width="5.5rem" height={44} />
            <Skeleton variant="block" width="4.5rem" height={44} />
            <Skeleton variant="block" width="6rem" height={44} />
            <Skeleton variant="block" width="5.5rem" height={44} />
          </div>
          <div className="cvs-side__frame">
            <List framed={false} className="cvs-outline"><Skeleton variant="row" as="li" count={4} /></List>
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

export function CvStudio({
  startFrom,
  onStartHandled,
}: {
  /** `profile`: the profile's "Start a CV from these facts" sent the user here; open Start a new CV once. */
  startFrom?: 'profile'
  onStartHandled?: () => void
} = {}) {
  const { status, openAuthDialog } = useSession()
  const authenticated = status === 'authenticated'
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState('')
  const {
    listQuery, documentQuery, catalogQuery, documentId, draft, dirty, saveState, edit: editDraft, open, replace, retrySave,
    conflict, lastSavedAt, lastCheckedAt, reloadNewer, keepMine,
  } = useCvDraft(authenticated)
  /**
   * A line under the bar, with the version it is about when there is one (a freshly tailored version). It is news
   * only until the next edit or until a save problem takes its place: the Versions tab keeps the fact.
   */
  const [notice, setNotice] = useState<{ text: string; variant?: CvVariant } | null>(null)
  const edit: typeof editDraft = (change) => {
    setNotice(null)
    editDraft(change)
  }
  const saveProblem = saveState === 'error' || conflict
  useEffect(() => { if (saveProblem) setNotice(null) }, [saveProblem])
  const barRef = useRef<HTMLElement>(null)
  /**
   * Set when "Your CVs" picks another CV: the studio shows its skeleton while that CV loads, which unmounts the select,
   * so focus would fall to the page. It returns to the switcher once the CV is open (cv-studio-G05).
   */
  const refocusSwitcher = useRef(false)
  /**
   * Set when a delete succeeds: the confirm dialog's trigger goes with the deleted CV (the skeleton, then the next CV
   * or the empty state, takes its place), so focus would fall to the page (cv-studio-G17). It lands on the next CV's
   * More options, where the delete started, or on the empty state's first action.
   */
  const refocusAfterDelete = useRef<'one' | 'all' | null>(null)
  const importRef = useRef<HTMLButtonElement>(null)
  /** The notice whose button was used is gone: keep keyboard and screen-reader users on the save state it changed. */
  const focusSaveStatus = () => window.requestAnimationFrame(() => {
    barRef.current?.querySelector<HTMLElement>('[data-testid="save-status"]')?.focus()
  })
  const [moment, setMoment] = useState<ExportMoment | null>(null)
  const momentCount = useRef(0)
  const [momentVariant, setMomentVariant] = useState<CvVariant | null>(null)
  const [zoom, setZoom] = useState<'fit' | 'read'>('fit')
  const [previewVariant, setPreviewVariant] = useState<CvVariant | null>(null)
  const [versionExport, setVersionExport] = useState<VersionExport>(null)
  const [dialog, setDialog] = useState<'create' | 'import' | 'tailor' | 'pdf' | null>(null)
  /** Start a new CV opened by the profile hand-off ticks every saved fact (the URL flag is cleared at once, so keep it here). */
  const [createFromProfile, setCreateFromProfile] = useState(false)
  const [tailorSeed, setTailorSeed] = useState<{ jobTitle: string; jobDescription: string } | null>(null)
  const autoOpenedTailorRef = useRef(false)
  const [exporting, setExporting] = useState<'pdf' | 'docx' | 'txt' | 'data' | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  /** Kept while the dialog fades out, so its text does not flip to the other variant. */
  const [confirmKind, setConfirmKind] = useState<'one' | 'all'>('one')
  const [deleting, setDeleting] = useState(false)
  const [panel, setPanel] = useState<Panel>('sections')
  /** The bottom sheet on narrow screens; on desktop the panel is always shown. */
  const [panelOpen, setPanelOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  /** The two "new CV" dialogs open from the overflow menu, whose item is gone by the time they close. */
  const returnToMenu = (event: Event) => {
    if (!menuTriggerRef.current) return
    event.preventDefault()
    menuTriggerRef.current.focus()
  }
  const desktop = useBreakpoint() === 'desktop'
  /** The phone bar (styles: max-width 767px) puts the CV switcher beside the save state, in the order it is seen. */
  const narrowBar = useMediaQuery('(max-width: 767px)')

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

  // From the profile: open Start a new CV (it lists the saved facts) as soon as the studio is ready, once.
  const listReady = authenticated && listQuery.isSuccess
  const startHandled = useRef(false)
  useEffect(() => {
    if (startFrom !== 'profile' || !listReady || startHandled.current) return
    startHandled.current = true
    setCreateFromProfile(true)
    setDialog('create')
    onStartHandled?.()
  }, [startFrom, listReady, onStartHandled])

  useEffect(() => {
    if (!draft || !refocusSwitcher.current) return
    refocusSwitcher.current = false
    barRef.current?.querySelector<HTMLElement>('[aria-label="Your CVs"]')?.focus()
  }, [draft?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- only when another CV has opened

  useEffect(() => {
    if (!draft || refocusAfterDelete.current !== 'one') return
    refocusAfterDelete.current = null
    menuTriggerRef.current?.focus()
  }, [draft?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- only when the next CV has opened

  // Every CV was deleted: the empty state is all that is left, so its first action takes focus, once.
  const emptyList = listQuery.isSuccess && listQuery.data.items.length === 0
  useEffect(() => {
    if (!emptyList || refocusAfterDelete.current !== 'all' || !importRef.current) return
    refocusAfterDelete.current = null
    importRef.current.focus()
  })

  // The tailor dialog needs `draft.id`: open it once a document has loaded.
  useEffect(() => {
    if (tailorSeed && draft && !autoOpenedTailorRef.current) {
      autoOpenedTailorRef.current = true
      setDialog('tailor')
    }
  }, [tailorSeed, draft])

  // The tool panel scrolls inside the viewport: `data-more` shows its bottom fade while there is more below.
  // The tools column ends inside the first screen too, not only once it is stuck: `--cvs-side-top` is where it starts
  // now (under the bar and any notice, or its sticky offset), and its height is the screen below that (cv-studio-F04).
  // Both are written straight to the elements, so scrolling never re-renders the studio.
  const hasDraft = Boolean(draft)
  useEffect(() => {
    const panelElement = panelRef.current
    if (!desktop || !panelElement) return
    const side = panelElement.closest<HTMLElement>('.cvs-side')
    const page = panelElement.closest<HTMLElement>('.cvs-page')
    const fit = () => {
      if (!side) return
      const top = `${Math.max(Math.round(side.getBoundingClientRect().top), Number.parseFloat(getComputedStyle(side).top) || 0)}px`
      if (side.style.getPropertyValue('--cvs-side-top') !== top) side.style.setProperty('--cvs-side-top', top)
    }
    const measure = () => {
      panelElement.dataset.more = panelElement.scrollHeight - panelElement.clientHeight - panelElement.scrollTop > 1 ? 'true' : 'false'
    }
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    const observeChildren = () => { for (const child of panelElement.children) resize?.observe(child) }
    resize?.observe(panelElement)
    observeChildren()
    const children = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => { observeChildren(); measure() })
    children?.observe(panelElement, { childList: true })
    // A notice above the studio moves the column without a scroll.
    const pageResize = typeof ResizeObserver === 'undefined' || !page ? null : new ResizeObserver(fit)
    pageResize?.observe(page!)
    panelElement.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('scroll', fit, { passive: true })
    window.addEventListener('resize', fit)
    fit()
    measure()
    return () => {
      panelElement.removeEventListener('scroll', measure)
      window.removeEventListener('scroll', fit)
      window.removeEventListener('resize', fit)
      resize?.disconnect()
      pageResize?.disconnect()
      children?.disconnect()
      side?.style.removeProperty('--cvs-side-top')
    }
  }, [desktop, hasDraft])

  const settledRevision = useSettledValue(draft?.updated_at ?? '', QUALITY_SETTLE_MS)
  const qualityRevision = settledRevision || draft?.updated_at || ''
  const quality = useCvQuality(draft?.id ?? '', qualityRevision, draft?.style.template_id ?? 'classic')

  const editSections = (change: (sections: CvSection[]) => CvSection[]) =>
    edit((current) => ({ ...current, sections: change(current.sections) }))
  const editHeader = (patch: Partial<CvHeader>) =>
    edit((current) => ({ ...current, header: { ...(current.header ?? EMPTY_HEADER), ...patch } }))
  const editStyle = (patch: Partial<CvStyle>) => edit((current) => ({ ...current, style: { ...current.style, ...patch } }))

  /**
   * Show a tool or a section's editor. An editor takes focus to its heading: the panel's on desktop, the sheet's title
   * when the sheet is already open (the Sections row that was used is gone). A sheet that opens takes focus itself.
   */
  function openPanel(next: Panel) {
    const editor = next !== 'sections' && next !== 'design' && next !== 'checks' && next !== 'versions'
    setPanel(next)
    setPanelOpen(true)
    if (editor && (desktop || panelOpen)) {
      window.requestAnimationFrame(() => {
        const heading = desktop
          ? panelRef.current?.querySelector<HTMLElement>('h2')
          : sheetRef.current?.querySelector<HTMLElement>('h2')
        heading?.setAttribute('tabindex', '-1')
        heading?.focus({ preventScroll: !desktop })
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
    try {
      await snapshotCvVariant(draft.id, name)
    } catch (error) {
      // Another tab saved this name since the list was loaded; the panel catches the names it knows about.
      throw isVersionNameConflict(error) ? new Error(versionNameTakenMessage(name)) : error
    }
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
  async function celebrate(format: 'pdf' | 'docx' | 'txt', filename: string, blob: Blob, variant: CvVariant | null = null) {
    // The ATS checks were run on the working CV: a saved version's file does not borrow them.
    const checks = variant ? undefined : quality.data?.checks
    momentCount.current += 1
    setMomentVariant(variant)
    setMoment({
      id: momentCount.current, format, filename,
      note: format === 'docx' ? docxNote : null,
      pages: format === 'pdf' ? await countPdfPages(blob) : null,
      checks: checks && checks.length > 0 ? { passing: checks.filter((check) => check.passed).length, total: checks.length } : null,
    })
  }

  async function exportFile(format: 'pdf' | 'docx' | 'txt' | 'data') {
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
      const filename = `${cvFileBase(draft.name)}.${format}`
      download(blob, filename)
      await celebrate(format, filename, blob)
    })
    setExporting(null)
  }

  /** A saved version as a file, without touching the working CV. */
  async function exportVersion(variant: CvVariant, format: 'pdf' | 'docx' | 'txt') {
    if (!draft || versionExport) return
    setVersionExport({ variantId: variant.id, format })
    await run('The version could not be exported.', async () => {
      const blob = await fetchVariantArtifactBlob(draft.id, variant.id, format).catch((error) => {
        throw new Error(error instanceof VersionExportUnavailable
          ? 'Exporting a saved version isn’t available on this server yet. Use it as your CV, then export that.'
          : `We couldn’t create the ${format.toUpperCase()} just now. Please try again.`)
      })
      const filename = `${cvFileBase(variant.name)}.${format}`
      download(blob, filename)
      await celebrate(format, filename, blob, variant)
    })
    setVersionExport(null)
  }

  function openDocument(created: CvDocument) {
    queryClient.setQueryData<{ items: CvDocument[] }>(LIST_KEY, (current) => ({
      items: [created, ...(current?.items ?? []).filter((item) => item.id !== created.id)],
    }))
    switchDocument(created.id)
  }

  /**
   * Another CV (or none) opens. The export moment, the notice (a tailored one carries buttons for its version) and an
   * action error all speak about the CV they came from, so they go too (cv-studio-R3-02, cv-studio-R2-01).
   */
  function switchDocument(id: string | null) {
    if (id === documentId) return
    open(id)
    setPanel('sections')
    setMoment(null)
    setMomentVariant(null)
    setNotice(null)
    setActionError('')
  }

  async function removeDocument(all: boolean) {
    if (!draft || dirty) return
    const name = draft.name.trim()
    setDeleting(true)
    await run('The CV could not be deleted.', async () => {
      if (all) await deleteAllCvDocuments()
      else await deleteCvDocument(draft.id)
      // Closed now, before the studio unmounts it: if the next CV loads before the list refetches, the dialog must not
      // come back open over it.
      setConfirmOpen(false)
      refocusAfterDelete.current = all ? 'all' : 'one'
      // Out of the cached list first, so the studio opens a CV that still exists while the list refetches.
      queryClient.setQueryData<{ items: CvDocument[] }>(LIST_KEY, (current) => current && {
        items: all ? [] : current.items.filter((item) => item.id !== draft.id),
      })
      switchDocument(null)
      await queryClient.invalidateQueries({ queryKey: LIST_KEY })
      // Another CV (or the empty state) opens in its place: say what happened (cv-studio-G09).
      setNotice({ text: all ? 'All your CVs were deleted.' : name ? `Deleted “${name}”.` : 'Your CV was deleted.' })
    })
    setDeleting(false)
    setConfirmOpen(false)
  }

  function handleTailorSaved(variant: CvVariant) {
    setNotice({ text: `Saved “${variant.name}” to your versions.`, variant })
    void documentQuery.refetch()
  }

  async function reload() {
    if (await reloadNewer()) focusSaveStatus()
    else setActionError('We couldn’t load the newer version just now. Your CV hasn’t changed.')
  }

  // 'unreachable' is a signed-in browser that cannot reach the server, not a guest: keep the skeleton (the
  // shell's service banner explains the outage) instead of offering sign-in.
  if (status === 'loading' || status === 'unreachable') return <StudioSkeleton />
  if (!authenticated) {
    return (
      <Page>
        <PageHeader title="CV Studio" lead={STUDIO_LEAD} />
        <EmptyState
          headingLevel={2} title="Sign in to use CV Studio" icon={<FileText />}
          description="Sign in to write, design and export your CV, and keep every version safe."
          action={<Button type="button" onClick={() => openAuthDialog({ to: '/cv-studio', reason: 'CV Studio is private to your account.' })}>Sign in</Button>}
        />
      </Page>
    )
  }
  if (listQuery.isError || catalogQuery.isError || documentQuery.isError) {
    return (
      <Page>
        <PageHeader title="CV Studio" lead={STUDIO_LEAD} />
        <ErrorState
          headingLevel={2} title="CV Studio didn’t load" icon={<TriangleAlert />}
          description="Your CVs are safe and nothing was changed. Try again in a moment."
          // No CV id yet (the list failed): refetch ignores `enabled` and would ask for /cv-documents/null (cv-studio-G10).
          retrying={listQuery.isFetching || catalogQuery.isFetching || (Boolean(documentId) && documentQuery.isFetching)}
          onRetry={() => { void listQuery.refetch(); void catalogQuery.refetch(); if (documentId) void documentQuery.refetch() }}
        />
      </Page>
    )
  }
  if (listQuery.isPending || catalogQuery.isPending || (documentId && documentQuery.isPending)) return <StudioSkeleton />

  const catalog = catalogQuery.data
  const closeDialog = (next: boolean) => { if (!next) { setDialog(null); setCreateFromProfile(false) } }
  const startDialogs = (
    <>
      <CreateCvDocumentDialog open={dialog === 'create'} preselectAll={createFromProfile} onOpenChange={closeDialog} onCreated={openDocument} onCloseAutoFocus={returnToMenu} />
      <CvImportDialog open={dialog === 'import'} onOpenChange={closeDialog} onImported={openDocument} onCloseAutoFocus={returnToMenu} />
    </>
  )

  if (!listQuery.data?.items.length) {
    return (
      <Page>
        <PageHeader title="CV Studio" lead={STUDIO_LEAD} />
        {notice ? <Notice tone="success" onDismiss={() => setNotice(null)}>{notice.text}</Notice> : null}
        <EmptyState
          headingLevel={2} icon={<FileText />} className="cvs-empty"
          title="Let’s start with your CV"
          description="Import the CV you already have and we’ll turn it into editable sections. Or start from the facts you’ve saved on your profile."
          action={(
            // md, as every compact or page empty state's buttons (consistency-F02); sm is only for size="inline".
            <Cluster gap={2}>
              <Button ref={importRef} type="button" onClick={() => setDialog('import')}><FileUp aria-hidden="true" /> <span>Import your CV <span className="cvs-narrowest-sr">(PDF/DOCX)</span></span></Button>
              <Button type="button" variant="secondary" onClick={() => setDialog('create')}><Layers aria-hidden="true" /> Start from your profile</Button>
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
  // ATS-friendly mode prints Classic, which is one column everywhere.
  const docxNote = draft.style.ats_mode ? null : catalog.templates.find((template) => template.id === draft.style.template_id)?.docx_note ?? null
  const activeSection = typeof panel === 'object' ? draft.sections.find((section) => section.id === panel.sectionId) : undefined
  /** The tab that is selected: a section's editor belongs to Sections. */
  const tool: Tool = typeof panel === 'string' && panel !== 'header' ? panel : 'sections'
  const headerOpen = panel === 'header'

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

  const headerEditor = headerOpen ? (
    <>
      {desktop ? <h2 className="kit-sr-only">Edit header</h2> : null}
      <CvHeaderEditor header={draft.header ?? EMPTY_HEADER} documentName={draft.name} onChange={editHeader} inline={desktop} />
    </>
  ) : null

  const panelBody = (activeSection || headerOpen) && phone ? (sectionEditor ?? headerEditor) : (
    <>
      {desktop && !activeSection && !headerOpen ? <h2 className="kit-sr-only">{TOOL_TITLES[tool]}</h2> : null}
      {tool === 'design' ? (
        <CvDesignTool style={draft.style} catalog={catalog} onChange={editStyle} />
      ) : tool === 'checks' ? (
        <CvAtsPanel
          quality={quality} sections={draft.sections} onAddSection={addAndOpen}
          onShowSection={(sectionId) => editSections((sections) => sections.map((section) => section.id === sectionId ? { ...section, visible: true } : section))}
          onOpenSection={(sectionId) => openPanel({ sectionId })}
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
          header={draft.header} documentName={draft.name} headerOpen={headerOpen} headerEditor={headerEditor}
          onOpenHeader={() => openPanel('header')}
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
      value={id} count={count} onClick={() => chooseTool(id)} className={`cvs-tab--${id}`}
      {...(phone ? { 'aria-haspopup': 'dialog' as const, 'aria-controls': undefined } : {})}
    >
      {/* Phones show "ATS"; the tab's name stays "ATS check". */}
      {id === 'checks' ? <span>ATS <span className="cvs-tab__long">check</span></span> : TOOL_TITLES[id]}{content ? ' ' : null}{content}
    </TabsTrigger>
  )

  const tools = (
    // On a phone or tablet a tab opens its sheet: only the open sheet's tab reads as selected (cv-studio-F03).
    <Tabs variant={desktop ? 'folder' : 'plain'} value={desktop || panelOpen ? tool : ''} onValueChange={(next) => { if (desktop) setPanel(next as Tool) }} activationMode={desktop ? 'automatic' : 'manual'} className="cvs-tabs">
      <TabsList aria-label="Studio tools">
        {tab('sections')}
        {tab('design')}
        {tab('checks', checks && !checksPass ? (
          <><Count value={failingChecks} variant="pill" tone="rose" />{' '}<span className="kit-sr-only">to fix</span></>
        ) : null)}
        {tab('versions', null, draft.variants.length)}
      </TabsList>
      {desktop ? (
        <TabsContent value={tool} ref={panelRef} className="cvs-panel">{panelBody}</TabsContent>
      ) : (
        <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
          <SheetContent
            ref={sheetRef} side="bottom" closeLabel="Close panel" aria-describedby={undefined}
            // A tool sheet opens on its title, not its first field: a focused field raises the phone keyboard
            // over the list (Versions' name field). A section's or the header's editor keeps the kit default (on a touch
            // screen the sheet itself takes focus, so the keyboard waits for a tap on a field).
            onOpenAutoFocus={(event) => {
              if (activeSection || headerOpen || !(event.target instanceof HTMLElement)) return
              const title = event.target.querySelector<HTMLElement>('h2')
              if (!title) return
              event.preventDefault()
              title.setAttribute('tabindex', '-1')
              title.focus({ preventScroll: true })
            }}
          >
            <SheetHeader>
              <SheetTitle>{activeSection ? `Edit ${activeSection.title || 'section'}` : headerOpen ? 'Edit header' : TOOL_TITLES[tool]}</SheetTitle>
            </SheetHeader>
            {/* Mounted while the sheet fades out, when no tab is selected any more. */}
            <SheetBody><TabsContent value={tool} forceMount tabIndex={-1} className="cvs-panel cvs-panel--sheet">{panelBody}</TabsContent></SheetBody>
          </SheetContent>
        </Sheet>
      )}
    </Tabs>
  )

  // "CV 1 of 2" and a chevron: the open CV's name is already in the bar, and the native list names every CV (cv-studio-F13).
  const switcher = documents.length > 1 ? (
    <Select size="sm" className="cvs-bar__select" aria-label="Your CVs" leading={`CV ${documents.findIndex((item) => item.id === draft.id) + 1} of ${documents.length}`} value={draft.id} disabled={dirty} onChange={(event) => { refocusSwitcher.current = true; switchDocument(event.target.value) }}>
      {documents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </Select>
  ) : null

  const newerNotice = conflict ? (
    <Notice
      tone="warning"
      title={dirty ? 'This CV was saved somewhere else' : 'A newer version of this CV is available'}
      // A choice of two buttons: on its own line under the text, so the sentence keeps the width (cv-studio-G06).
      actionPlacement="below"
      action={(
        <Cluster gap={2}>
          <Button type="button" size="sm" variant="secondary" onClick={() => void reload()}>Reload newer version</Button>
          {dirty ? <Button type="button" size="sm" variant="ghost" onClick={() => { void keepMine().then(focusSaveStatus) }}>Keep my version</Button> : null}
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
      <header className="cvs-bar" ref={barRef}>
        <div className="cvs-bar__doc">
          <Input
            className="cvs-bar__name" aria-label="Document name" value={draft.name} maxLength={120}
            onChange={(event) => edit((current) => ({ ...current, name: event.target.value }))}
          />
          <CvSaveStatus
            state={saveState} savedAt={lastSavedAt ?? (Date.parse(draft.updated_at) || null)} checkedAt={lastCheckedAt}
          />
          {templateName ? <Badge tone="white" className="cvs-bar__template"><LayoutTemplate aria-hidden="true" />{templateName}</Badge> : null}
          {narrowBar ? switcher : null}
        </div>
        <div className="cvs-bar__actions">
          {narrowBar ? null : switcher}
          <Button type="button" variant="secondary" className="cvs-bar__tailor" onClick={() => setDialog('tailor')}><Sparkles aria-hidden="true" /> Tailor to a job</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button ref={menuTriggerRef} type="button" variant="secondary" iconOnly aria-label="More options"><MoreHorizontal aria-hidden="true" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>New CV</DropdownMenuLabel>
              <DropdownMenuItem icon={<FileUp />} disabled={dirty} onSelect={() => setDialog('import')}>Import a PDF or DOCX</DropdownMenuItem>
              <DropdownMenuItem icon={<Layers />} disabled={dirty} onSelect={() => setDialog('create')}>Start from your profile</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Download />} disabled={dirty || exporting === 'docx'} onSelect={() => void exportFile('docx')}>Export DOCX</DropdownMenuItem>
              {docxNote ? <DropdownMenuLabel>{docxNote}</DropdownMenuLabel> : null}
              <DropdownMenuItem icon={<Download />} disabled={dirty || exporting === 'txt'} onSelect={() => void exportFile('txt')}>Export plain text</DropdownMenuItem>
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
            <Notice tone="danger" action={<Button type="button" size="sm" variant="secondary" onClick={() => { retrySave(); focusSaveStatus() }}>Try again</Button>}>
              We couldn’t save your latest changes. Keep this page open and try again.
            </Notice>
          ) : null}
          {actionError ? <Notice tone="danger" onDismiss={() => setActionError('')}>{actionError}</Notice> : null}
          {notice ? (
            <Notice
              tone="success" onDismiss={() => setNotice(null)}
              action={notice.variant ? (
                <Cluster gap={2}>
                  <Button type="button" size="sm" variant="secondary" onClick={() => { setPreviewVariant(notice.variant ?? null); setNotice(null) }}>Preview version</Button>
                  <Button type="button" size="sm" variant="secondary" loading={versionExport?.variantId === notice.variant.id && versionExport.format === 'pdf'} onClick={() => notice.variant && void exportVersion(notice.variant, 'pdf')}>Export this version</Button>
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
          <CvPagePreview
            documentId={draft.id} draft={draft}
            // A closed editor sheet edits nothing: the pages mark a section only while its editor is in view.
            activeId={desktop || panelOpen ? activeSection?.id : undefined} onEdit={(sectionId) => openPanel({ sectionId })}
            headerActive={(desktop || panelOpen) && headerOpen} onEditHeader={() => openPanel('header')}
            onStyleChange={editStyle}
          />
        </CvDesk>
      </div>

      {moment ? (
        <CvExportMoment
          moment={moment} onClose={() => setMoment(null)}
          otherBusy={momentVariant
            ? versionExport?.variantId === momentVariant.id && versionExport.format !== moment.format
            : exporting === (moment.format === 'pdf' ? 'docx' : 'pdf')}
          // The other format of the same file: a saved version's moment offers that version, never the working CV.
          onDownloadOther={() => {
            const other = moment.format === 'pdf' ? 'docx' : 'pdf'
            if (momentVariant) void exportVersion(momentVariant, other)
            else void exportFile(other)
          }}
        />
      ) : null}

      {startDialogs}
      <CvTailorDialog
        open={dialog === 'tailor'} onOpenChange={closeDialog} documentId={draft.id} canGenerate={!dirty}
        remainingRuns={draft.tailoring_model_run_limit - draft.tailoring_model_runs} onSaved={handleTailorSaved}
        onGenerated={() => void documentQuery.refetch()} seed={tailorSeed} versionNames={draft.variants.map((variant) => variant.name)}
      />
      <ExactPdfDialog open={dialog === 'pdf'} onOpenChange={closeDialog} documentId={draft.id} documentName={draft.name} revision={draft.updated_at} style={draft.style} templateName={templateName} />
      <CvVersionPreviewDialog
        variant={previewVariant} documentId={draft.id} documentName={draft.name} header={draft.header} style={draft.style} currentSections={draft.sections}
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
