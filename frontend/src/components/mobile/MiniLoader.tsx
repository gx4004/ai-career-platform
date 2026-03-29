import { motion } from 'framer-motion'

interface MiniLoaderProps {
  stage: string
  progress: number
  onExpand: () => void
}

export function MiniLoader({ stage, progress, onExpand }: MiniLoaderProps) {
  return (
    <motion.button
      type="button"
      className="mini-loader"
      onClick={onExpand}
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -60, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <div className="mini-loader-spinner" />
      <span className="mini-loader-label">{stage}</span>
      <span className="mini-loader-percent">{Math.round(progress * 100)}%</span>
    </motion.button>
  )
}
