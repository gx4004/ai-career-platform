import { useState, useEffect, useRef } from 'react'
import { Timer } from 'lucide-react'

export function AdCountdownTimer({
  durationSeconds = 30,
  onComplete,
}: {
  durationSeconds?: number
  onComplete: () => void
}) {
  const [remaining, setRemaining] = useState(durationSeconds)
  const completedRef = useRef(false)

  useEffect(() => {
    if (remaining <= 0 && !completedRef.current) {
      completedRef.current = true
      onComplete()
      return
    }

    const timer = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1))
    }, 1000)

    return () => clearInterval(timer)
  }, [remaining, onComplete])

  const progress = ((durationSeconds - remaining) / durationSeconds) * 100

  return (
    <div className="ad-countdown">
      <div className="ad-countdown-ring">
        <svg viewBox="0 0 48 48" width={48} height={48}>
          <circle
            cx={24}
            cy={24}
            r={20}
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            opacity={0.15}
          />
          <circle
            cx={24}
            cy={24}
            r={20}
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeDasharray={125.66}
            strokeDashoffset={125.66 * (1 - progress / 100)}
            strokeLinecap="round"
            transform="rotate(-90 24 24)"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <span className="ad-countdown-number">{remaining}</span>
      </div>
      <div className="ad-countdown-text">
        <Timer size={16} />
        <span>Results unlocking in {remaining}s...</span>
      </div>
    </div>
  )
}
