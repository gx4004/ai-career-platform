import { AlertTriangle } from 'lucide-react'
import { ErrorState } from '#/components/kit'

/**
 * An admin list that failed to load: the rose icon disc (STICKER 4.O), what failed, one sentence on what it means, and
 * Try again. The same words on Users, Runs and Discovery sources.
 */
export function AdminLoadError({ what, onRetry, retrying }: { what: string; onRetry: () => void; retrying: boolean }) {
  return (
    <ErrorState
      icon={<AlertTriangle aria-hidden />}
      title={`Couldn't load ${what}`}
      description="The server didn't send the list. Nothing was changed."
      onRetry={onRetry}
      retrying={retrying}
    />
  )
}
