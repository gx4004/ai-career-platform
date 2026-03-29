import { useState, type ReactNode } from 'react'
import { Lock, Unlock, AlertTriangle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { trackTelemetry } from '#/lib/telemetry/client'

export function AdGatedLock({
  toolId,
  children,
}: {
  toolId: string
  children: ReactNode
}) {
  const [unlocked, setUnlocked] = useState(false)
  const [adBlocked, setAdBlocked] = useState(false)
  const [watching, setWatching] = useState(false)

  if (unlocked) {
    return <>{children}</>
  }

  const handleWatchAd = () => {
    setWatching(true)
    trackTelemetry({ event_name: 'ad_shown', tool_id: toolId })

    // Simulate ad interaction (replace with real ad SDK later)
    // In production: load ad from provider, wait for completion callback
    setTimeout(() => {
      trackTelemetry({ event_name: 'ad_completed', tool_id: toolId })
      setUnlocked(true)
      setWatching(false)
    }, 3000)
  }

  return (
    <div className="ad-gate">
      <div className="ad-gate-locked-content">
        {children}
      </div>
      <div className="ad-gate-overlay">
        <div className="ad-gate-prompt">
          {adBlocked ? (
            <>
              <AlertTriangle size={24} />
              <h3>Ad blocker detected</h3>
              <p>Please disable your ad blocker to view detailed results.</p>
            </>
          ) : watching ? (
            <>
              <Unlock size={24} className="ad-gate-spinner" />
              <p>Loading content...</p>
            </>
          ) : (
            <>
              <Lock size={24} />
              <h3>Detailed results</h3>
              <p>Watch a short ad to unlock the full analysis, evidence, and export options.</p>
              <Button onClick={handleWatchAd} className="ad-gate-btn">
                Unlock full results
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
