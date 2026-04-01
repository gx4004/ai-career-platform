import { useState, type ReactNode } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { AdCountdownTimer } from '#/components/tooling/AdCountdownTimer'
import { trackTelemetry } from '#/lib/telemetry/client'
import { useAd } from '#/hooks/useAd'
import { useAdUnlock } from '#/hooks/useAdUnlock'

export function AdGatedLock({
  toolId,
  runId,
  children,
}: {
  toolId: string
  runId?: string
  children: ReactNode
}) {
  const { unlocked, unlock } = useAdUnlock(runId)
  const { adBlocked, showAd } = useAd()
  const [watching, setWatching] = useState(false)

  if (unlocked) {
    return <>{children}</>
  }

  const handleWatchAd = async () => {
    setWatching(true)
    trackTelemetry({ event_name: 'ad_shown', tool_id: toolId })

    const completed = await showAd()
    if (completed) {
      trackTelemetry({ event_name: 'ad_completed', tool_id: toolId, unlock_method: 'ad' })
      unlock()
    } else {
      trackTelemetry({ event_name: 'ad_blocked', tool_id: toolId })
      setWatching(false)
    }
  }

  const handleCountdownComplete = () => {
    trackTelemetry({ event_name: 'countdown_completed', tool_id: toolId, unlock_method: 'countdown' })
    unlock()
  }

  return (
    <div className="ad-gate-card">
      {adBlocked ? (
        <AdCountdownTimer
          durationSeconds={30}
          onComplete={handleCountdownComplete}
        />
      ) : watching ? (
        <>
          <Unlock size={20} className="ad-gate-spinner" />
          <p>Loading content...</p>
        </>
      ) : (
        <>
          <Lock size={20} className="ad-gate-card__icon" />
          <h3>Full analysis ready</h3>
          <p>Watch a short ad to unlock detailed scores, evidence, and export options.</p>
          <Button onClick={handleWatchAd} className="ad-gate-btn">
            Unlock full results
          </Button>
        </>
      )}
    </div>
  )
}
