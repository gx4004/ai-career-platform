import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileSearch, Brain, BarChart3, CheckCircle2,
  Target, PenTool, MessageSquare, Compass, FolderOpen,
  ClipboardList, Lightbulb, Briefcase, Map, Layers,
} from 'lucide-react'
import type { ToolId } from '#/lib/tools/registry'

type Stage = {
  icon: typeof FileSearch
  label: string
  duration: number
}

const TOOL_STAGES: Record<ToolId, Stage[]> = {
  resume: [
    { icon: FileSearch, label: 'Reading your resume…', duration: 1500 },
    { icon: Brain, label: 'Analyzing sections…', duration: 2000 },
    { icon: BarChart3, label: 'Calculating score…', duration: 2000 },
    { icon: Lightbulb, label: 'Preparing improvement tips…', duration: 1500 },
    { icon: CheckCircle2, label: 'Finalizing results…', duration: 1000 },
  ],
  'job-match': [
    { icon: FileSearch, label: 'Reading your resume…', duration: 1200 },
    { icon: ClipboardList, label: 'Extracting requirements…', duration: 2000 },
    { icon: Target, label: 'Matching qualifications…', duration: 2000 },
    { icon: BarChart3, label: 'Calculating fit score…', duration: 1500 },
    { icon: CheckCircle2, label: 'Preparing report…', duration: 1000 },
  ],
  'cover-letter': [
    { icon: FileSearch, label: 'Preparing context…', duration: 1500 },
    { icon: Target, label: 'Mapping requirements…', duration: 1500 },
    { icon: PenTool, label: 'Writing your letter…', duration: 2500 },
    { icon: Lightbulb, label: 'Final refinements…', duration: 1500 },
    { icon: CheckCircle2, label: 'Finishing up…', duration: 1000 },
  ],
  interview: [
    { icon: Brain, label: 'Analyzing the role…', duration: 1500 },
    { icon: MessageSquare, label: 'Selecting questions…', duration: 2000 },
    { icon: Lightbulb, label: 'Building answer frameworks…', duration: 2000 },
    { icon: ClipboardList, label: 'Preparing practice plan…', duration: 1500 },
    { icon: CheckCircle2, label: 'Finishing up…', duration: 1000 },
  ],
  career: [
    { icon: Compass, label: 'Analyzing your career…', duration: 1500 },
    { icon: Map, label: 'Evaluating paths…', duration: 2000 },
    { icon: Briefcase, label: 'Identifying skill gaps…', duration: 2000 },
    { icon: Lightbulb, label: 'Preparing recommendations…', duration: 1500 },
    { icon: CheckCircle2, label: 'Finishing up…', duration: 1000 },
  ],
  portfolio: [
    { icon: Layers, label: 'Mapping your skills…', duration: 1500 },
    { icon: FolderOpen, label: 'Selecting projects…', duration: 2000 },
    { icon: Map, label: 'Building roadmap…', duration: 2000 },
    { icon: Lightbulb, label: 'Preparing presentation tips…', duration: 1500 },
    { icon: CheckCircle2, label: 'Finishing up…', duration: 1000 },
  ],
}

const DEFAULT_STAGES: Stage[] = [
  { icon: FileSearch, label: 'Parsing…', duration: 1500 },
  { icon: Brain, label: 'Analyzing…', duration: 2500 },
  { icon: BarChart3, label: 'Generating insights…', duration: 2000 },
  { icon: CheckCircle2, label: 'Almost done…', duration: 1500 },
]

const MIN_DISPLAY_MS = 3000
const MIN_PHASES_SHOWN = 2

export function CinematicLoader({
  accent,
  toolId,
  stages: customStages,
  mutationDone,
  onReady,
}: {
  accent?: string
  toolId?: ToolId
  stages?: Array<{ label: string }>
  /** Signal that the data mutation has resolved */
  mutationDone?: boolean
  /** Called when minimum display time has elapsed and the loader is safe to dismiss */
  onReady?: () => void
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
  const Icon = stage.icon
  const progress = mutationDone
    ? 100
    : displayedStageIndex >= totalStages - 2
      ? 90
      : ((displayedStageIndex + 1) / totalStages) * 100

  return (
    <motion.div
      className="cinematic-loader"
      style={{ '--tool-accent': accent } as CSSProperties}
      data-progress={Math.round(progress)}
      data-stage-index={displayedStageIndex}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="cinematic-scanner">
        <div className="cinematic-doc">
          <div className="cinematic-doc-lines">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="cinematic-doc-line" style={{ width: `${60 + Math.random() * 30}%` }} />
            ))}
          </div>
          <div className="cinematic-scan-beam" />
        </div>
      </div>

      <div className="cinematic-stage">
        <AnimatePresence mode="wait">
          <motion.div
            key={displayedStageIndex}
            className="cinematic-stage-content"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <Icon size={20} style={{ color: accent }} />
            <span>{stage.label}</span>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="cinematic-progress">
        <motion.div
          className="cinematic-progress-bar"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </motion.div>
  )
}
