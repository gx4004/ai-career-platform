import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, Check, Copy, Download, RefreshCw, Star, Undo2, X } from 'lucide-react'
import {
  Button,
  Cluster,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ErrorState,
  KeyValue,
  Lead,
  Page,
  PageHeader,
  Panel,
  PanelBody,
  ScoreBar,
  ScoreSeal,
  Section,
  Skeleton,
  Stack,
  Sticker,
  Textarea,
  ToolTile,
  Tooltip,
} from '#/components/kit'
import { ScoreHelp } from '#/components/tooling/ScoreHelp'
import { ClaimPromotionSection } from '#/components/profile/ClaimPromotionSection'
import { formatRunDate, runSubject } from '#/lib/tools/runLabel'
import { ApiError } from '#/lib/api/errors'
import { getHistoryItem } from '#/lib/api/client'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { useRevealOnce } from '#/hooks/use-reveal-once'
import { useFavoriteToggle } from '#/hooks/useFavoriteToggle'
import { useSession } from '#/hooks/useSession'
import { getTransientResult, isDemoHistoryId } from '#/lib/tools/demoRuns'
import { readWorkflowContext, writeWorkflowContext } from '#/lib/tools/drafts'
import {
  exportPdf,
  formatExportContent,
  readExportableSections,
  sanitizeDownloadTitle,
} from '#/lib/tools/exports'
import { FixFirstList, resultDefinitions } from '#/lib/tools/resultDefinitions'
import { deriveWorkflowUpdateFromHistoryItem } from '#/lib/tools/workflowContext'
import { getToolByHistoryName, tools } from '#/lib/tools/registry'
import type { ToolId } from '#/lib/tools/registry'
import { trackTelemetry } from '#/lib/telemetry/client'
import { ResultChromeContext, ResultJumpNav, WhatNext, flushLetterEdits } from './ResultParts'
import type { ResultSummary } from '#/lib/tools/resultDefinitions'

function downloadTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ToolResultScreen({
  toolId,
  historyId,
}: {
  toolId: ToolId
  historyId: string
}) {
  const navigate = useNavigate()
  const { status, openAuthDialog } = useSession()
  const favoriteToggle = useFavoriteToggle()
  const [copied, setCopied] = useState(false)
  const [regenOpen, setRegenOpen] = useState(false)
  const [regenFeedback, setRegenFeedback] = useState('')
  const [practicing, setPracticing] = useState(false)
  const [scoreDelta, setScoreDelta] = useState<number | null>(null)
  const [parentRunId, setParentRunId] = useState<string | null>(null)
  const [showUndo, setShowUndo] = useState(true)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  // The star answers at once; the server's answer settles it (a saved run read from the cache never refetches).
  const [favoriteOverride, setFavoriteOverride] = useState<{ id: string; value: boolean } | null>(null)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reportRef = useRef<HTMLDivElement | null>(null)
  const queryClient = useQueryClient()
  const reveal = useRevealOnce(historyId)
  const breakpoint = useBreakpoint()
  const demoItem = useMemo(() => getTransientResult(historyId), [historyId])
  const cachedItem = queryClient.getQueryData(['tool-run', historyId]) as ReturnType<typeof getTransientResult> | undefined
  const localItem = demoItem || cachedItem || null

  // Cleanup copy timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])
  const hasLocalData = Boolean(localItem)

  // Track when the result page has no local data and must fetch from backend.
  // This should rarely happen: a cache miss here means the mutation's onSuccess
  // failed to populate the cache, or the cache was cleared between navigation.
  useEffect(() => {
    if (!hasLocalData) {
      trackTelemetry({
        event_name: 'result_page_cache_miss',
        tool_id: toolId,
        session_status: status,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, [])

  const query = useQuery({
    queryKey: ['tool-run', historyId],
    queryFn: () => getHistoryItem(historyId),
    enabled: !hasLocalData,
  })

  const item = localItem || query.data
  const isDemoResult = Boolean(demoItem || cachedItem) || isDemoHistoryId(historyId)

  useEffect(() => {
    if (!item) return
    writeWorkflowContext({
      ...deriveWorkflowUpdateFromHistoryItem(item),
      updatedAt: Date.now(),
    })
  }, [item])

  const viewedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!item || viewedRef.current === item.id) return
    viewedRef.current = item.id
    trackTelemetry({
      event_name: 'result_page_loaded',
      tool_id: toolId,
      access_mode: item.access_mode === 'guest_demo' ? 'guest_demo' : 'authenticated',
      saved: item.saved,
    })
  }, [item, toolId])

  useEffect(() => {
    if (!item) return
    const nestedParentId = (item.result_payload as Record<string, unknown>)?.parent_run_id
    const parentId = typeof item.parent_run_id === 'string' ? item.parent_run_id : nestedParentId
    if (!parentId || typeof parentId !== 'string') {
      setParentRunId(null)
      setScoreDelta(null)
      setShowUndo(false)
      return
    }

    setParentRunId(parentId)
    setShowUndo(true)

    // Hide undo button after 30 seconds
    const timer = setTimeout(() => setShowUndo(false), 30_000)

    let mounted = true
    // A guest's earlier run lives in this tab, not on the server.
    const parentRequest = Promise.resolve(getTransientResult(parentId) ?? (isDemoHistoryId(parentId) ? null : getHistoryItem(parentId)))
    parentRequest
      .then((parent) => {
        if (!mounted || !parent) return
        const parentPayload = parent.result_payload ?? parent
        const pp = parentPayload as Record<string, unknown>
        const rp = item.result_payload as Record<string, unknown>
        const parentScore = (pp.overall_score ?? pp.match_score ?? null) as number | null
        const currentScore = (rp.overall_score ?? rp.match_score ?? null) as number | null
        if (parentScore != null && currentScore != null) {
          setScoreDelta(currentScore - parentScore)
        }
      })
      .catch(() => {
        // The earlier run is gone: there is simply no "what moved" line.
      })

    return () => {
      mounted = false
      clearTimeout(timer)
    }
  }, [item])


  if (!item && query.isPending) {
    return <ResultLoading toolId={toolId} />
  }

  if (query.isError || !item) {
    const isMissingSavedResult =
      query.error instanceof ApiError && query.error.status === 404

    return (
      <Page className="result-state">
        <ErrorState
          size="page"
          headingLevel={1}
          title={
            isDemoResult
              ? 'This guest demo is no longer available'
              : isMissingSavedResult
                ? 'This saved result is no longer available'
                : 'This result could not be loaded'
          }
          description={
            isDemoResult
              ? 'Run the tool again to regenerate the demo, or create a free account to keep future runs in your workspace.'
              : isMissingSavedResult
                ? 'The saved run may have been deleted or no longer matches the current workspace state.'
                : 'The saved run is missing, inaccessible, or the backend is offline.'
          }
          onRetry={isDemoResult || isMissingSavedResult ? undefined : () => void query.refetch()}
          retrying={query.isFetching}
          backAction={
            <>
              {isDemoResult ? null : (
                <Button asChild variant="secondary">
                  <Link to="/history">Back to history</Link>
                </Button>
              )}
              <Button asChild variant="secondary">
                <Link to={tools[toolId].route}>Run the tool again</Link>
              </Button>
              {isDemoResult && status !== 'authenticated' ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() =>
                    openAuthDialog({ to: tools[toolId].route, reason: 'guest-demo-result', label: 'Create account', toolId })
                  }
                >
                  Create a free account
                </Button>
              ) : null}
            </>
          }
        />
      </Page>
    )
  }

  const resolvedTool = getToolByHistoryName(item.tool_name) || tools[toolId]
  const definition = resultDefinitions[resolvedTool.id]
  const payload = item.result_payload
  const summary =
    payload.summary && typeof payload.summary === 'object'
      ? (payload.summary as Record<string, unknown>)
      : {}
  const exportableSections = readExportableSections(payload)
  const downloadTitle =
    typeof payload.download_title === 'string' && payload.download_title.trim()
      ? payload.download_title
      : item.label || resolvedTool.shortLabel
  const savedResult = item.saved
  const guestResult = !savedResult
  function handleRegenSubmit() {
    const params = new URLSearchParams()
    params.set('parent_run_id', historyId)
    if (regenFeedback.trim()) {
      params.set('feedback', regenFeedback.trim())
    }
    void navigate({ to: `${resolvedTool.route}?${params.toString()}` })
  }

  const summaryInfo = definition.summary(payload)
  const topActions = definition.topActions(payload)
  const runDate = item.created_at ? formatRunDate(item.created_at) : ''
  const headline = typeof summary.headline === 'string' ? summary.headline.trim() : ''
  const hasHeadline = headline.length > 0
  // What the run is about, unless the report already says it: "Portfolio Roadmap (Backend Engineer)" and
  // a "Target role: Backend Engineer" fact would print the same words twice.
  const subject = runSubject(item.label, resolvedTool)
  const subjectInFacts = summaryInfo.facts.some(
    (f) => f.value.trim().toLowerCase() === subject.toLowerCase(),
  )
  const runLabel = subjectInFacts ? '' : subject

  async function handleCopy() {
    await navigator.clipboard.writeText(definition.copyText(payload, item!))
    setCopied(true)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1600)
  }

  function handleExport(format: 'txt' | 'md') {
    trackTelemetry({
      event_name: 'export_action_used',
      tool_id: resolvedTool.id,
      access_mode: savedResult ? 'authenticated' : 'guest_demo',
      saved: savedResult,
      export_format: format,
    })
    // Tools with their own download (Cover Letter) export the on-page, possibly edited, text.
    const own = definition.download?.(payload, item!, format)
    if (own) {
      downloadTextFile(own.filename, own.content, format === 'md' ? 'text/markdown;charset=utf-8' : undefined)
    } else if (format === 'md') {
      downloadTextFile(
        sanitizeDownloadTitle(downloadTitle, 'md'),
        formatExportContent(exportableSections, 'md'),
        'text/markdown;charset=utf-8',
      )
    } else {
      downloadTextFile(
        sanitizeDownloadTitle(downloadTitle, 'txt'),
        formatExportContent(exportableSections, 'txt'),
      )
    }
  }

  async function handlePdf() {
    if (status !== 'authenticated' || !savedResult) {
      openAuthDialog({ to: resolvedTool.route, reason: 'export-pdf', label: 'Create account', toolId: resolvedTool.id })
      return
    }
    // The letter is saved as you type; wait for the last edit so the PDF is the version on the page.
    await flushLetterEdits(historyId).catch(() => {})
    await exportPdf(historyId)
  }

  const isFavorite = favoriteOverride?.id === item.id ? favoriteOverride.value : Boolean(item.is_favorite)
  const favoriteLabel = savedResult
    ? isFavorite
      ? 'Remove from favorites'
      : 'Add to favorites'
    : 'Sign in to favorite this result'
  // aria-disabled rather than disabled: the button keeps its focus stop, its name and its tooltip.
  const favoriteBusy = favoriteToggle.isPending
  const favoriteButton = (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      aria-disabled={favoriteBusy || undefined}
      data-disabled={favoriteBusy ? 'true' : undefined}
      onClick={() => {
        if (favoriteBusy) return
        // A guest's click is the sign-up moment: the star offers to keep the result.
        if (!savedResult || status !== 'authenticated') {
          openAuthDialog({ to: resolvedTool.route, reason: 'save-demo-result', label: 'Sign in to save', toolId: resolvedTool.id })
          return
        }
        const next = !isFavorite
        setFavoriteOverride({ id: item.id, value: next })
        favoriteToggle.mutate(
          { historyId: item.id, isFavorite: next },
          {
            onSuccess: () => {
              queryClient.setQueryData(['tool-run', item.id], (old: unknown) =>
                old && typeof old === 'object' ? { ...old, is_favorite: next } : old,
              )
            },
            onError: () => setFavoriteOverride(null),
          },
        )
      }}
      aria-label={favoriteLabel}
      aria-pressed={savedResult ? isFavorite : undefined}
    >
      <Star fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
      {isFavorite ? 'Starred' : 'Star'}
    </Button>
  )

  const hasExport = exportableSections.length > 0 || Boolean(definition.download)
  const hasPdf = resolvedTool.id === 'cover-letter' || resolvedTool.id === 'interview'
  const exportMenu =
    hasExport || hasPdf ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" size="sm" aria-label="Export result">
            <Download aria-hidden="true" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {hasExport ? (
            <>
              <DropdownMenuItem onSelect={() => handleExport('txt')}>Plain text (.txt)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExport('md')}>Markdown (.md)</DropdownMenuItem>
            </>
          ) : null}
          {hasPdf ? <DropdownMenuItem onSelect={() => void handlePdf()}>PDF</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null

  const actions = (
    <Cluster gap={2} className="result-actions">
      <Tooltip content={favoriteLabel}>{favoriteButton}</Tooltip>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleCopy}
        aria-label={copied ? 'Copied to clipboard' : 'Copy result to clipboard'}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
      {exportMenu}
      {parentRunId && showUndo ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Undo: restore previous result"
          onClick={() => navigate({ to: resolvedTool.resultRoute.replace('$historyId', parentRunId) })}
        >
          <Undo2 aria-hidden="true" />
          Undo
        </Button>
      ) : null}
      <Button asChild variant="ghost" size="sm" className="tool-link">
        <Link to={resolvedTool.route}>New input</Link>
      </Button>
      <Button
        type="button"
        variant={practicing ? 'secondary' : 'primary'}
        aria-expanded={regenOpen}
        onClick={() => setRegenOpen((v) => !v)}
      >
        <RefreshCw aria-hidden="true" />
        Re-generate
      </Button>
    </Cluster>
  )

  const carriesInput = Boolean(readWorkflowContext()?.resumeText)
  // The create-account prompt opens on the register view (the intent's `view` is honoured once the session supports it).
  const createAccountIntent = {
    to: resolvedTool.route,
    reason: 'guest-demo-result',
    label: 'Create account',
    toolId: resolvedTool.id,
    view: 'register' as const,
  }
  const signInIntent = { to: resolvedTool.route, reason: 'guest-demo-result', label: 'Sign in', toolId: resolvedTool.id }

  // A saved Job Match belongs to an application: link to it, named for the role when it has one.
  const workspace = item.workspace
  const applicationName = workspace
    ? [workspace.role, workspace.company].filter(Boolean).join(' at ') || workspace.listing?.title || ''
    : ''
  const applicationLink =
    resolvedTool.id === 'job-match' && workspace && savedResult && (workspace.status || workspace.listing) && applicationName ? (
      <Link key="application" to="/campaigns/$campaignId" params={{ campaignId: workspace.id }}>
        In applications: {applicationName}
      </Link>
    ) : null

  return (
    <ResultChromeContext.Provider value={{ setPracticing, reveal }}>
      <Page>
        <PageHeader
          mark={<ToolTile tone={resolvedTool.tone} icon={resolvedTool.icon} size="lg" />}
          title={resolvedTool.label}
          meta={[runLabel, runDate ? `Result from ${runDate}` : '', applicationLink]}
          actions={actions}
        />

        {guestResult && !bannerDismissed ? (
          <Sticker as="aside" role="status" tone="lemon" size="sm" reveal={reveal ? 'slap' : 'none'} revealOrder={3}>
            <div className="result-unsaved">
              <Section
                size="sm"
                title="This result is not saved"
                description="Guest demo: it disappears when you close this tab. Create a free account to keep it. Your resume text stays with this browser until then."
                className="result-unsaved__text"
              />
              {status !== 'authenticated' ? (
                <Cluster gap={2} className="result-unsaved__actions">
                  <Button type="button" size="sm" variant="secondary" onClick={() => openAuthDialog(createAccountIntent)}>
                    Create free account
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => openAuthDialog(signInIntent)}>
                    Sign in
                  </Button>
                </Cluster>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                iconOnly
                aria-label="Dismiss"
                className="result-unsaved__dismiss"
                onClick={() => setBannerDismissed(true)}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          </Sticker>
        ) : null}

        {regenOpen ? (
          <Panel>
            <PanelBody>
              <Stack gap={3} role="group" aria-label="Re-generate with feedback">
                <Textarea
                  autoFocus
                  placeholder="Optional: describe what you'd like changed..."
                  aria-label="Re-generate feedback"
                  value={regenFeedback}
                  onChange={(e) => setRegenFeedback(e.target.value)}
                  rows={3}
                />
                <p className="result-note">
                  {carriesInput
                    ? 'Your resume and job from this session are filled in on the next screen; your feedback goes with them.'
                    : 'This run does not keep your resume text. Paste it again on the next screen; your feedback goes with it.'}
                </p>
                <Cluster justify="end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRegenOpen(false)
                      setRegenFeedback('')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={handleRegenSubmit}>
                    Submit
                  </Button>
                </Cluster>
              </Stack>
            </PanelBody>
          </Panel>
        ) : null}

        <ResultJumpNav containerRef={reportRef} />

        <div ref={reportRef} className="result-report">
          <ResultHero
            summary={summaryInfo}
            toolId={resolvedTool.id}
            tool={resolvedTool}
            scoreDelta={scoreDelta}
            reveal={reveal}
            phone={breakpoint === 'mobile'}
          >
            {hasHeadline ? <Lead size="xl">{headline}</Lead> : null}
            <FixFirstList actions={topActions} />
          </ResultHero>
          {definition.render(payload, item, resolvedTool)}
          <ClaimPromotionSection
            toolId={resolvedTool.id}
            payload={payload as Record<string, unknown>}
            authenticated={status === 'authenticated'}
          />
          <WhatNext tool={resolvedTool} />
          {summaryInfo.note ? <p className="result-footnote">{summaryInfo.note}</p> : null}
        </div>
      </Page>
    </ResultChromeContext.Provider>
  )
}

/** "2 issues", "1 gap". */
function countNoun(count: { value: number; noun: string }) {
  return count.value === 1 ? count.noun : `${count.noun}s`
}

/**
 * The first screen of a report: the score seal with its verdict (left), the lead sentence and the
 * Fix-first stickers (right). Tools without a score show their facts under a large tool tile instead
 * of an invented number.
 */
function ResultHero({
  summary,
  toolId,
  tool,
  scoreDelta,
  reveal,
  phone,
  children,
}: {
  summary: ResultSummary
  toolId: ToolId
  tool: (typeof tools)[ToolId]
  scoreDelta: number | null
  reveal: boolean
  phone: boolean
  children: ReactNode
}) {
  const hasBars = Boolean(summary.bars && summary.bars.length > 0)
  // The verdict and the count are stickers under the seal: the facts list does not say them twice.
  const facts = summary.facts.filter(
    (f) => !(summary.verdict && f.label === 'Verdict') && !(summary.count && f.label === 'Issues'),
  )
  const slap = reveal ? 'slap' : 'none'

  return (
    <div className="result-hero">
      <div className="result-hero__side">
        {summary.score ? (
          <>
            <ScoreSeal
              value={summary.score.value}
              label={summary.score.label}
              unit={summary.score.unit}
              size={phone ? 'lg' : 'xl'}
              reveal={reveal ? 'stamp' : 'none'}
            />
            <div className="result-hero__tags">
              {summary.verdict?.label ? (
                <Sticker as="span" size="sm" tone={summary.verdict.tone} tilt={phone ? 0 : -3} reveal={slap} revealOrder={3} className="result-verdict">
                  {summary.verdict.label}
                </Sticker>
              ) : null}
              {summary.count ? (
                <Sticker as="span" size="sm" tone="white" tilt={phone ? 0 : 2.5} reveal={slap} revealOrder={3} className="result-issues">
                  <b>{summary.count.value}</b> {countNoun(summary.count)}
                </Sticker>
              ) : null}
              {scoreDelta !== null && scoreDelta !== 0 ? (
                <Sticker as="span" size="sm" tone={scoreDelta > 0 ? 'mint' : 'rose'} reveal={slap} revealOrder={3} className="result-delta">
                  {scoreDelta > 0 ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
                  <span>
                    {scoreDelta > 0 ? '+' : ''}
                    {scoreDelta} pts <span className="kit-sr-only">since the previous result</span>
                  </span>
                </Sticker>
              ) : null}
              <ScoreHelp toolId={toolId} />
            </div>
          </>
        ) : (
          <ToolTile tone={tool.tone} icon={tool.icon} size="xl" />
        )}
        {hasBars || facts.length > 0 ? (
          <Panel className="result-hero__facts">
            <PanelBody>
              <Stack gap={3}>
                {hasBars
                  ? summary.bars!.map((bar) => (
                      <ScoreBar key={bar.label} label={bar.label} value={bar.value} max={bar.max} valueLabel={bar.valueLabel} tone="ink" />
                    ))
                  : null}
                {facts.length > 0 ? <KeyValue labelWidth="8.5rem" items={facts} /> : null}
              </Stack>
            </PanelBody>
          </Panel>
        ) : null}
      </div>
      <div className="result-hero__lead">{children}</div>
    </div>
  )
}

/** The report's frame while the saved run is fetched: same header, hero and rows as the loaded page. */
function ResultLoading({ toolId }: { toolId: ToolId }) {
  const tool = tools[toolId]
  return (
    <Page>
      <PageHeader
        mark={<ToolTile tone={tool.tone} icon={tool.icon} size="lg" />}
        title={tool.label}
        meta={[<Skeleton key="date" size="meta" width="4rem" />]}
      />
      <div className="result-report">
        <div className="result-hero">
          <div className="result-hero__side">
            <Skeleton variant="block" width="min(300px, 100%)" className="result-seal-skeleton" />
            <Skeleton lines={3} width="100%" />
          </div>
          <div className="result-hero__lead">
            <Skeleton label="Fetching saved output" lines={2} size="title" />
            <Stack gap={3}>
              <Skeleton width="8rem" />
              <Skeleton variant="row" count={3} />
            </Stack>
          </div>
        </div>
      </div>
    </Page>
  )
}
