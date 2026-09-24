import { useId } from 'react'

/** Score colours from design.md: green 70+, amber 41–69, red 0–40. */
export function scoreGradient(score: number) {
  if (score >= 70) return { start: '#16a34a', end: '#4ade80', tone: 'good' as const }
  if (score >= 41) return { start: '#d97706', end: '#fbbf24', tone: 'medium' as const }
  return { start: '#dc2626', end: '#f87171', tone: 'low' as const }
}

export function CvScoreRing({ score, size = 104, label }: { score: number; size?: number; label: string }) {
  const uid = useId().replace(/:/g, '')
  const stroke = size >= 96 ? 8 : 5
  const radius = size / 2 - stroke - 2
  const circumference = 2 * Math.PI * radius
  const safe = Math.max(0, Math.min(100, Math.round(score)))
  const gradient = scoreGradient(safe)
  return (
    <div className={`cvs-ring cvs-ring--${gradient.tone}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}-g`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={gradient.start} />
            <stop offset="100%" stopColor={gradient.end} />
          </linearGradient>
          <filter id={`${uid}-glow`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={stroke} />
        <circle
          className="cvs-ring__value"
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={`url(#${uid}-g)`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference - (safe / 100) * circumference}
          filter={`url(#${uid}-glow)`}
        />
      </svg>
      <span className="cvs-ring__number">{safe}</span>
    </div>
  )
}
