import type { ReactNode } from 'react'

export function OnboardingStep({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="onboarding-step">
      <div className="onboarding-step-header">
        <h3 className="display-lg text-gradient-aurora">{title}</h3>
        <p className="muted-copy">{description}</p>
      </div>
      {children && <div className="onboarding-step-content">{children}</div>}
    </div>
  )
}
