import { useState } from 'react'
import { X, UserPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '#/components/ui/button'
import { useSession } from '#/hooks/useSession'

const DISMISS_KEY = 'career-workbench:auth-banner-dismissed'

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function persistDismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // ignore
  }
}

export function AuthBanner() {
  const { status, openAuthDialog } = useSession()
  const [dismissed, setDismissed] = useState(isDismissed)

  if (status !== 'guest' || dismissed) return null

  return (
    <AnimatePresence>
      <motion.div
        className="auth-banner"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="auth-banner-inner">
          <div className="auth-banner-content">
            <UserPlus size={16} className="auth-banner-icon" />
            <p className="auth-banner-text">
              Create an account to save your analyses and track progress across sessions.
            </p>
          </div>
          <div className="auth-banner-actions">
            <Button
              size="sm"
              variant="outline"
              className="auth-banner-cta"
              onClick={() =>
                openAuthDialog({
                  to: '/dashboard',
                  reason: 'save-results',
                  label: 'Sign in to save results',
                })
              }
            >
              Sign in
            </Button>
            <button
              className="auth-banner-close"
              aria-label="Dismiss"
              onClick={() => {
                persistDismiss()
                setDismissed(true)
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
