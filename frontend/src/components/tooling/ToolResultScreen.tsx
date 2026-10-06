import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, Check, Copy, Download, FileX2, LockKeyhole, RefreshCw, Star, Undo2 } from 'lucide-react'
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
  List,
  Notice,
  Page,
  PageHeader,
  Panel,
  PanelBody,
  ScoreBar,
  ScoreSeal,
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
import { ApiError, describeFailure } from '#/lib/api/errors'
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
import { seedRegenerate } from '#/lib/tools/regenerateSeed'
import { TrackJobRow } from '#/components/tooling/TrackJob'
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
  const [regenSeeding, setRegenSeeding] = useState(false)
  const [practicing, setPracticing] = useState(false)
  const [scoreDelta, setScoreDelta] = useState<number | null>(null)
  const [parentRunId, setParentRunId] = useState<string | null>(null)
  const [showUndo, setShowUndo] = useState(true)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  // A Copy or PDF export that failed: said on the page, with a way to try again.
  const [actionFailure, setActionFailure] = useState<{ message: string; retry: () => void } | null>(null)
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
    // A guest demo id (`<tool>-demo-N`) only ever lives in this tab: the server never has it, so never ask.
    enabled: !hasLocalData && !isDemoHistoryId(historyId),
  })

  const item = localItem || query.data
  const isDemoResult = Boolean(demoItem || cachedItem) || isDemoHistoryId(historyId)

  // A guest who opens a saved result's link (401, or 404: the server does not say whose run it is) is sent
  // to sign in, and comes straight back to this result afterwards ('open-result' intent on the sign-in page).
  const needsSignIn =
    status === 'guest' &&
    !isDemoResult &&
    query.error instanceof ApiError &&
    (query.error.status === 401 || query.error.status === 404)
  const askedToSignIn = useRef(false)
  useEffect(() => {
    if (!needsSignIn || askedToSignIn.current) return
    askedToSignIn.current = true
    openAuthDialog({ to: window.location.pathname, reason: 'open-result' })
  }, [needsSignIn, openAuthDialog])

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


  // A disabled query (a demo id that is gone from this tab) stays pending forever: fall through to its error state.
  if (!item && query.isPending && !isDemoHistoryId(historyId)) {
    return <ResultLoading toolId={toolId} />
  }

  if (needsSignIn) {
    return (
      <Page className="result-state">
        <ErrorState
          size="page"
          headingLevel={1}
          icon={<LockKeyhole />}
          title="Sign in to open this result"
          description="Saved results belong to an account. Sign in and you'll go straight back to it."
          backAction={
            <>
              <Button
                type="button"
                variant="primary"
                onClick={() => openAuthDialog({ to: window.location.pathname, reason: 'open-result' })}
              >
                Sign in
              </Button>
              <Button asChild variant="secondary">
                <Link to={tools[toolId].route} activeOptions={{ exact: true }}>
                  Run the tool yourself
                </Link>
              </Button>
            </>
          }
        />
      </Page>
    )
  }

  if (query.isError || !item) {
    const isMissingSavedResult =
      query.error instanceof ApiError && query.error.status === 404

    return (
      <Page className="result-state">
        <ErrorState
          size="page"
          headingLevel={1}
          icon={<FileX2 />}
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
                ? 'It may have been deleted, or it belongs to another account.'
                : describeFailure(query.error, "We couldn't reach the server. Check your connection and try again.").message
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
                <Link to={tools[toolId].route} activeOptions={{ exact: true }}>
                  Run the tool again
                </Link>
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
  async function handleRegenSubmit() {
    if (regenSeeding) return
    const params = new URLSearchParams()
    params.set('parent_run_id', historyId)
    // The feedback is free text: it travels in this tab, never in the URL (see WorkflowContextState.regenFeedback).
    try {
      writeWorkflowContext({
        regenFeedback: regenFeedback.trim() ? { parentRunId: historyId, text: regenFeedback.trim() } : undefined,
        updatedAt: Date.now(),
      })
    } catch {
      /* storage unavailable: the run goes ahead without the feedback */
    }
    // A result opened cold has nothing in this tab to carry: fill in what the account still has first.
    if (item && !guestResult) {
      setRegenSeeding(true)
      try {
        await seedRegenerate(item, resolvedTool.id)
      } catch {
        /* seeding is best effort: the form asks for anything missing */
      } finally {
        setRegenSeeding(false)
      }
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
    setActionFailure(null)
    try {
      await navigator.clipboard.writeText(definition.copyText(payload, item!))
    } catch {
      // No clipboard (an insecure page) or the browser refused it (the tab lost focus, a permission).
      setActionFailure({
        message: 'Your browser did not let us copy the result. Try again, or select the text and copy it yourself.',
        retry: () => void handleCopy(),
      })
      return
    }
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
    setActionFailure(null)
    // The letter is saved as you type; wait for the last edit so the PDF is the version on the page.
    await flushLetterEdits(historyId).catch(() => {})
    try {
      await exportPdf(historyId)
    } catch (error) {
      setActionFailure({
        message: `The PDF could not be made. ${describeFailure(error, 'Something went wrong on our side.').message}`,
        retry: () => void handlePdf(),
      })
    }
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
      <Button asChild variant="ghost" size="sm" className="tool-link result-actions__new">
        <Link to={resolvedTool.route} activeOptions={{ exact: true }}>
          New input
        </Link>
      </Button>
      <Button
        type="button"
        variant={practicing ? 'secondary' : 'primary'}
        className="result-actions__primary"
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

  // The guest notice is static (never part of the reveal), so it never holds an empty band open while the seal stamps in.
  // Phones show it under the hero, so the seal and the verdict are the first thing a guest sees.
  const phone = breakpoint === 'mobile'
  // STICKER 4.R.2: a lemon-soft Notice, not a saturated sticker (on a phone it sits right under the Fix-first stickers).
  const unsavedNotice =
    guestResult && !bannerDismissed ? (
      <Notice
        title="This result is not saved"
        onDismiss={() => setBannerDismissed(true)}
        action={
          status !== 'authenticated' ? (
            <Cluster gap={2}>
              <Button type="button" size="sm" variant="secondary" onClick={() => openAuthDialog(createAccountIntent)}>
                Create free account
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => openAuthDialog(signInIntent)}>
                Sign in
              </Button>
            </Cluster>
          ) : undefined
        }
      >
        Guest result: it disappears when you close this tab. Create a free account and your next runs are saved; your resume text stays with this browser until then.
      </Notice>
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

        {actionFailure ? (
          <Notice
            tone="danger"
            onDismiss={() => setActionFailure(null)}
            action={
              <Button type="button" variant="secondary" size="sm" onClick={actionFailure.retry}>
                Try again
              </Button>
            }
          >
            {actionFailure.message}
          </Notice>
        ) : null}

        {phone ? null : unsavedNotice}

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
                    : 'Runs don’t keep their inputs. The next screen fills in what your account has, like your newest CV Studio CV, and asks for the rest.'}
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
                  <Button type="button" variant="secondary" size="sm" loading={regenSeeding} onClick={() => void handleRegenSubmit()}>
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
            phone={phone}
          >
            {hasHeadline ? <Lead size="xl">{headline}</Lead> : null}
            <FixFirstList actions={topActions} />
          </ResultHero>
          {phone ? unsavedNotice : null}
          {definition.render(payload, item, resolvedTool)}
          <ClaimPromotionSection
            toolId={resolvedTool.id}
            payload={payload as Record<string, unknown>}
            authenticated={status === 'authenticated'}
          />
          <WhatNext
            tool={resolvedTool}
            // A saved result opened cold carries no resume: fill in the account's newest CV first, as Re-generate does.
            onOpen={savedResult ? (to) => seedRegenerate(item, to) : undefined}
            lead={
              resolvedTool.id === 'job-match' && savedResult && status === 'authenticated' ? (
                <TrackJobRow item={item} />
              ) : undefined
            }
          />
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
    <div className="result-hero" data-scored={summary.score ? 'true' : undefined}>
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
            </div>
            {/* In the side's top corner, beside the seal: inside the tags row it wrapped onto a line of its own. */}
            <span className="result-hero__help">
              <ScoreHelp toolId={toolId} />
            </span>
          </>
        ) : phone ? null : (
          // The header already carries this tile; on a phone the big one would push the work itself off the first screen.
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

/**
 * The report's frame while the saved run is fetched: the same header (actions included), jump-nav strip,
 * hero and framed panels as the loaded page, so nothing moves when the data lands.
 */
function ResultLoading({ toolId }: { toolId: ToolId }) {
  const tool = tools[toolId]
  const scored = toolId === 'resume' || toolId === 'job-match' || toolId === 'career'
  return (
    <Page>
      <PageHeader
        mark={<ToolTile tone={tool.tone} icon={tool.icon} size="lg" />}
        title={tool.label}
        meta={[<Skeleton key="date" size="meta" width="4rem" />]}
        actions={<Skeleton variant="block" width="28rem" className="result-loading__actions" />}
      />
      <div className="kit-jump-nav result-loading__jump" aria-hidden="true">
        <Skeleton variant="block" width="min(26rem, 100%)" height={40} />
      </div>
      <div className="result-report">
        <div className="result-hero" data-scored={scored ? 'true' : undefined}>
          <div className="result-hero__side">
            {scored ? (
              <Skeleton variant="block" className="result-seal-skeleton" />
            ) : (
              <Skeleton variant="block" width={120} height={120} className="result-tile-skeleton" />
            )}
            <Panel className="result-hero__facts">
              <PanelBody>
                <Skeleton lines={3} width="100%" />
              </PanelBody>
            </Panel>
          </div>
          <div className="result-hero__lead">
            <Skeleton label="Fetching saved output" lines={2} size="title" />
            <Stack gap={3}>
              <Skeleton width="8rem" size="title" />
              <List aria-busy="true">
                <Skeleton variant="row" as="li" count={3} />
              </List>
            </Stack>
          </div>
        </div>
      </div>
    </Page>
  )
}
