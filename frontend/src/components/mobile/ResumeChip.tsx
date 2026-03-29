import { CheckCircle, X } from 'lucide-react'
import { useResumeCarry } from '#/hooks/use-resume-carry'

interface ResumeChipProps {
  onReview?: () => void
}

export function ResumeChip({ onReview }: ResumeChipProps) {
  const { filename, hasResume, clearResume } = useResumeCarry()

  if (!hasResume) return null

  return (
    <div className="resume-chip">
      <button type="button" className="resume-chip-body" onClick={onReview}>
        <CheckCircle size={14} />
        <span className="resume-chip-label">{filename || 'Resume loaded'}</span>
      </button>
      <button
        type="button"
        className="resume-chip-clear"
        onClick={clearResume}
        aria-label="Remove resume"
      >
        <X size={14} />
      </button>
    </div>
  )
}
