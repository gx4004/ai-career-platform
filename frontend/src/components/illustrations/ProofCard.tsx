import type { LucideIcon } from 'lucide-react'
import { cn } from '#/lib/utils'

type ProofCardRow = {
  label: string
  value: string
}

type ProofCardChip = {
  label: string
  tone?: 'neutral' | 'success' | 'warning'
}

export function ProofCard({
  icon: Icon,
  accent,
  eyebrow,
  title,
  value,
  valueLabel,
  description,
  rows = [],
  chips = [],
  progress,
  previewLines = [],
  compact = false,
  className,
}: {
  icon: LucideIcon
  accent: string
  eyebrow: string
  title: string
  value?: string
  valueLabel?: string
  description?: string
  rows?: ProofCardRow[]
  chips?: ProofCardChip[]
  progress?: number
  previewLines?: string[]
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn('proof-card', compact ? 'proof-card--compact' : 'proof-card--feature', className)}
      style={{ ['--proof-accent' as string]: accent }}
    >
      <div className="proof-card-header">
        <div className="proof-card-icon">
          <Icon size={16} />
        </div>
        <div className="proof-card-header-copy">
          <p className="proof-card-eyebrow">{eyebrow}</p>
          <h3 className="proof-card-title">{title}</h3>
        </div>
      </div>
      {value ? (
        <div className="proof-card-value">
          <span className="proof-card-value-text">{value}</span>
          {valueLabel ? <span className="proof-card-value-label">{valueLabel}</span> : null}
        </div>
      ) : null}
      {typeof progress === 'number' ? (
        <div className="proof-card-progress" aria-hidden="true">
          <div className="proof-card-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      {description ? <p className="proof-card-description">{description}</p> : null}
      {previewLines.length > 0 ? (
        <div className="proof-card-preview">
          {previewLines.map((line) => (
            <div key={line} className="proof-card-preview-line">
              {line}
            </div>
          ))}
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div className="proof-card-rows">
          {rows.map((row) => (
            <div key={`${row.label}-${row.value}`} className="proof-card-row">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {chips.length > 0 ? (
        <div className="proof-card-chips">
          {chips.map((chip) => (
            <span
              key={chip.label}
              className={cn(
                'proof-card-chip',
                chip.tone === 'success'
                  ? 'is-success'
                  : chip.tone === 'warning'
                    ? 'is-warning'
                    : '',
              )}
            >
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
