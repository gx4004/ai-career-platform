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
    { icon: FileSearch, label: 'CV okunuyor…', duration: 1500 },
    { icon: Brain, label: 'Bölümler analiz ediliyor…', duration: 2000 },
    { icon: BarChart3, label: 'Skor hesaplanıyor…', duration: 2000 },
    { icon: Lightbulb, label: 'İyileştirme önerileri hazırlanıyor…', duration: 1500 },
    { icon: CheckCircle2, label: 'Sonuçlar hazırlanıyor…', duration: 1000 },
  ],
  'job-match': [
    { icon: FileSearch, label: 'CV okunuyor…', duration: 1200 },
    { icon: ClipboardList, label: 'Gereksinimler çıkarılıyor…', duration: 2000 },
    { icon: Target, label: 'Eşleştirme yapılıyor…', duration: 2000 },
    { icon: BarChart3, label: 'Uyum skoru hesaplanıyor…', duration: 1500 },
    { icon: CheckCircle2, label: 'Rapor hazırlanıyor…', duration: 1000 },
  ],
  'cover-letter': [
    { icon: FileSearch, label: 'Bağlam hazırlanıyor…', duration: 1500 },
    { icon: Target, label: 'Gereksinimler haritalanıyor…', duration: 1500 },
    { icon: PenTool, label: 'Mektup yazılıyor…', duration: 2500 },
    { icon: Lightbulb, label: 'Son düzenlemeler yapılıyor…', duration: 1500 },
    { icon: CheckCircle2, label: 'Tamamlanıyor…', duration: 1000 },
  ],
  interview: [
    { icon: Brain, label: 'Rol analiz ediliyor…', duration: 1500 },
    { icon: MessageSquare, label: 'Sorular belirleniyor…', duration: 2000 },
    { icon: Lightbulb, label: 'Cevap çerçeveleri oluşturuluyor…', duration: 2000 },
    { icon: ClipboardList, label: 'Pratik planı hazırlanıyor…', duration: 1500 },
    { icon: CheckCircle2, label: 'Tamamlanıyor…', duration: 1000 },
  ],
  career: [
    { icon: Compass, label: 'Kariyer analizi yapılıyor…', duration: 1500 },
    { icon: Map, label: 'Yollar değerlendiriliyor…', duration: 2000 },
    { icon: Briefcase, label: 'Beceri boşlukları belirleniyor…', duration: 2000 },
    { icon: Lightbulb, label: 'Öneriler hazırlanıyor…', duration: 1500 },
    { icon: CheckCircle2, label: 'Tamamlanıyor…', duration: 1000 },
  ],
  portfolio: [
    { icon: Layers, label: 'Beceriler haritalanıyor…', duration: 1500 },
    { icon: FolderOpen, label: 'Projeler seçiliyor…', duration: 2000 },
    { icon: Map, label: 'Yol haritası oluşturuluyor…', duration: 2000 },
    { icon: Lightbulb, label: 'Sunum önerileri hazırlanıyor…', duration: 1500 },
    { icon: CheckCircle2, label: 'Tamamlanıyor…', duration: 1000 },
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

  const stage = displayStages[stageIndex]
  const Icon = stage.icon
  const progress = ((stageIndex + 1) / displayStages.length) * 100

  return (
    <motion.div
      className="cinematic-loader"
      style={{ '--tool-accent': accent } as CSSProperties}
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
            key={stageIndex}
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
