import { useEffect, useMemo, useRef, useState } from 'react'
import type { ToolId } from '#/lib/tools/registry'
import { trackTelemetry } from '#/lib/telemetry/client'

type Stage = {
  label: string
  duration: number
}

// Honest-wording contract (D-056).
//
// These labels are driven by a client-side `setTimeout` schedule; nothing here
// observes what the server is actually doing. So they are NOT status messages
// and must not be worded as one. Two rules keep them truthful:
//
//   1. The label strings themselves carry no trailing ellipsis — "Calculating
//      score…" as a *string* would read as "the server is doing this right
//      now" wherever it surfaces, including the aria-live announcement below.
//      The visible (aria-hidden) stage line appends its own decorative "…" at
//      render time instead, purely as a "more is coming" affordance; it is
//      never present in the announcement, which already states the
//      substantiated claim explicitly ("Typical step: ...").
//   2. They are always rendered under the `STEPS_FRAME_ONE` prefix below, which
//      marks the step as typical rather than observed.
//
// The only claim this component can substantiate is "a request is in flight and
// has not returned yet" — that is `STATUS_WORKING`, and it is the message that
// actually reaches assistive technology as a status.
const TOOL_STAGES: Record<ToolId, Stage[]> = {
  resume: [
    { label: 'Reading your resume', duration: 1500 },
    { label: 'Analyzing sections', duration: 2000 },
    { label: 'Calculating your score', duration: 2000 },
    { label: 'Preparing improvement tips', duration: 1500 },
    { label: 'Finalizing results', duration: 1000 },
  ],
  'job-match': [
    { label: 'Reading your resume', duration: 1200 },
    { label: 'Extracting requirements', duration: 2000 },
    { label: 'Matching qualifications', duration: 2000 },
    { label: 'Calculating fit score', duration: 1500 },
    { label: 'Preparing report', duration: 1000 },
  ],
  'cover-letter': [
    { label: 'Preparing context', duration: 1500 },
    { label: 'Mapping requirements', duration: 1500 },
    { label: 'Writing your letter', duration: 2500 },
    { label: 'Final refinements', duration: 1500 },
    { label: 'Finishing up', duration: 1000 },
  ],
  interview: [
    { label: 'Analyzing the role', duration: 1500 },
    { label: 'Selecting questions', duration: 2000 },
    { label: 'Building answer frameworks', duration: 2000 },
    { label: 'Preparing practice plan', duration: 1500 },
    { label: 'Finishing up', duration: 1000 },
  ],
  career: [
    { label: 'Analyzing your career', duration: 1500 },
    { label: 'Evaluating paths', duration: 2000 },
    { label: 'Identifying skill gaps', duration: 2000 },
    { label: 'Preparing recommendations', duration: 1500 },
    { label: 'Finishing up', duration: 1000 },
  ],
  portfolio: [
    { label: 'Mapping your skills', duration: 1500 },
    { label: 'Selecting projects', duration: 2000 },
    { label: 'Building roadmap', duration: 2000 },
    { label: 'Preparing presentation tips', duration: 1500 },
    { label: 'Finishing up', duration: 1000 },
  ],
}

const DEFAULT_STAGES: Stage[] = [
  { label: 'Parsing', duration: 1500 },
  { label: 'Analyzing', duration: 2500 },
  { label: 'Generating insights', duration: 2000 },
  // Was "Almost done…" — a remaining-time claim the client cannot make.
  { label: 'Finishing up', duration: 1500 },
]

/** Caption that marks the stage list as indicative rather than observed. */
const STEPS_FRAME_ONE = 'Typical step'
/** The only substantiated claim: a request is in flight. */
const STATUS_WORKING = 'Working on your results…'
const STATUS_READY = 'Results are ready.'

const MIN_DISPLAY_MS = 3000
const MIN_PHASES_SHOWN = 2

export function CinematicLoader({
  toolId,
  stages: customStages,
  mutationDone,
  onReady,
  accessMode,
}: {
  toolId?: ToolId
  stages?: Array<{ label: string }>
  /** Signal that the data mutation has resolved */
  mutationDone?: boolean
  /** Called when minimum display time has elapsed and the loader is safe to dismiss */
  onReady?: () => void
  accessMode?: 'authenticated' | 'guest_demo'
}) {
  const displayStages = useMemo(() => {
    if (customStages) {
      return customStages.map((s, i) => ({
        ...DEFAULT_STAGES[i % DEFAULT_STAGES.length],
        label: s.label,
      }))
    }
    if (toolId && TOOL_STAGES[toolId]) {
      return TOOL_STAGES[toolId]
    }
    return DEFAULT_STAGES
  }, [customStages, toolId])

  const [stageIndex, setStageIndex] = useState(0)
  const startTimeRef = useRef(Date.now())
  const doneRef = useRef(Boolean(mutationDone))
  const abandonmentReportedRef = useRef(false)

  useEffect(() => {
    doneRef.current = Boolean(mutationDone)
  }, [mutationDone])

  useEffect(() => {
    const reportAbandonment = () => {
      const durationMs = Date.now() - startTimeRef.current
      if (doneRef.current || abandonmentReportedRef.current || durationMs < 1000 || !toolId) return
      abandonmentReportedRef.current = true
      trackTelemetry({
        event_name: 'generation_loader_abandoned',
        tool_id: toolId,
        access_mode: accessMode,
        duration_ms: Math.min(durationMs, 86_400_000),
      })
    }
    // Only a real page-leave counts as abandonment. Every tool page renders this
    // loader as `{mutation.isPending ? <loader/> : <result/>}`, so unmount is the
    // normal success path — reporting from cleanup fired on every completed run
    // and would have shown the operator ~100% abandonment (#139). Under-reporting
    // an in-app navigation is safe; a false trigger is not.
    window.addEventListener('pagehide', reportAbandonment)
    return () => {
      window.removeEventListener('pagehide', reportAbandonment)
    }
  }, [accessMode, toolId])

  // Prevent accidental navigation while loading
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    let elapsed = 0
    displayStages.forEach((stage, i) => {
      if (i === 0) return
      elapsed += stage.duration
      timers.push(setTimeout(() => setStageIndex(i), elapsed))
    })
    return () => timers.forEach(clearTimeout)
  }, [displayStages])

  // When the LLM call finishes, jump to the final stage so the bar can hit 100%.
  useEffect(() => {
    if (!mutationDone) return
    setStageIndex((current) => Math.max(current, displayStages.length - 1))
  }, [mutationDone, displayStages.length])

  // Enforce minimum display: at least MIN_DISPLAY_MS and MIN_PHASES_SHOWN
  useEffect(() => {
    if (!mutationDone || !onReady) return
    const elapsed = Date.now() - startTimeRef.current
    const phasesOk = stageIndex + 1 >= MIN_PHASES_SHOWN
    if (elapsed >= MIN_DISPLAY_MS && phasesOk) {
      onReady()
    } else {
      const remaining = Math.max(MIN_DISPLAY_MS - elapsed, 0)
      const timer = setTimeout(() => {
        onReady()
      }, remaining)
      return () => clearTimeout(timer)
    }
  }, [mutationDone, onReady, stageIndex])

  const totalStages = displayStages.length
  // Until mutationDone, the timer-driven stageIndex is capped at the
  // penultimate slot — the final 100% slot is reserved for real completion.
  const displayedStageIndex = mutationDone
    ? stageIndex
    : Math.min(stageIndex, Math.max(totalStages - 2, 0))
  const stage = displayStages[displayedStageIndex]
  const progress = mutationDone
    ? 100
    : displayedStageIndex >= totalStages - 2
      ? 90
      : ((displayedStageIndex + 1) / totalStages) * 100

  // Spoken form of what the screen shows: the substantiated claim first, then
  // the current step explicitly marked as typical (see the STEPS_FRAME comment).
  const announcement = mutationDone
    ? STATUS_READY
    : `Working on your results. Typical step: ${stage.label}.`

  return (
    <div
      className="cinematic-loader"
      data-progress={Math.round(progress)}
      data-stage-index={displayedStageIndex}
    >
      {/*
        Accessibility contract (WCAG 2.2 4.1.3 Status Messages).

        - This <p> is the ONLY node this component exposes to assistive
          technology, and it is a stable element (never keyed, never inside an
          animation wrapper), so React rewrites its text in place and a stage
          change produces exactly one polite announcement.
        - Deliberately no `aria-busy` on the root: `aria-busy="true"` on an
          ancestor of a live region tells AT to withhold updates until it flips
          to false, and this loader unmounts on completion rather than flipping.
        - The visible line below is `aria-hidden` so it is not read twice.
      */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <div className="cinematic-line" aria-hidden="true">
        <span className="tool-spinner" />
        {/* Decorative-only ellipsis (see the D-056 comment above): the
            aria-live announcement never carries this. */}
        <span className="cinematic-status">{mutationDone ? STATUS_READY : `${STATUS_WORKING} ${STEPS_FRAME_ONE}: ${stage.label}…`}</span>
      </div>

      {/*
        Indeterminate progressbar: `aria-valuenow` is deliberately omitted, which
        is the ARIA-defined way to say "in progress, amount unknown". The width
        below comes from the client-side stage timer, not from the server, so
        publishing it as `aria-valuenow` would assert a completion ratio the
        client cannot observe — exactly what D-056 forbids.
      */}
      <div className="cinematic-progress" role="progressbar" aria-label="Generating results">
        <div className="cinematic-progress-bar" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}
