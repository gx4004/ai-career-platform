import type { ReactNode } from 'react'
import { ScoreSeal, type SealTone } from '#/components/kit'

/**
 * The payoff (or the dead end) of an auth step: a seal stamps in above the die-cut panel that says what
 * happened. Mint for a new account and a new password, rose for a reset link that no longer works. The seal is
 * decoration beside the heading, so it carries a short word, not a score, and is hidden from assistive tech.
 */
export function AuthStamp({ word, tone = 'mint', children }: { word: string; tone?: SealTone; children: ReactNode }) {
  return (
    <div className="auth-stamp">
      <ScoreSeal value={word} unit={null} label={tone === 'mint' ? 'Confirmation' : 'Problem'} size={170} tone={tone} reveal="stamp" aria-hidden="true" />
      {children}
    </div>
  )
}
