import type { ReactNode } from 'react'
import { ScoreSeal } from '#/components/kit'

/**
 * The payoff of an auth step: a mint seal stamps in above the die-cut panel that says what happened. Used
 * for a new account and a new password. The seal is decoration beside the heading, so it carries a short
 * word, not a score, and is hidden from assistive tech.
 */
export function AuthStamp({ word, children }: { word: string; children: ReactNode }) {
  return (
    <div className="auth-stamp">
      <ScoreSeal value={word} unit={null} label="Confirmation" size={170} tone="mint" reveal="stamp" aria-hidden="true" />
      {children}
    </div>
  )
}
