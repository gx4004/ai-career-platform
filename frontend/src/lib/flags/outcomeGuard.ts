import { notFound } from '@tanstack/react-router'

export function requireEnabledOutcome(enabled: boolean): void {
  if (!enabled) throw notFound()
}
