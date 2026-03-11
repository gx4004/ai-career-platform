import { useEffect, useState, type CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileSearch, Brain, BarChart3, CheckCircle2 } from 'lucide-react'

const STAGES = [
  { icon: FileSearch, label: 'Parsing resume…', duration: 1500 },
  { icon: Brain, label: 'Analyzing content…', duration: 2500 },
  { icon: BarChart3, label: 'Generating insights…', duration: 2000 },
  { icon: CheckCircle2, label: 'Almost done…', duration: 1500 },
] as const

export function CinematicLoader({
  accent,
  stages,
}: {
  accent?: string
  stages?: Array<{ label: string }>
}) {
  const [stageIndex, setStageIndex] = useState(0)
  const displayStages = stages
    ? stages.map((s, i) => ({ ...STAGES[i % STAGES.length], label: s.label }))
    : STAGES

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
