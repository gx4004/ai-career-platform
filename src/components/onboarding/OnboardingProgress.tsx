import { cn } from '#/lib/utils'

export function OnboardingProgress({
  currentStep,
  totalSteps,
}: {
  currentStep: number
  totalSteps: number
}) {
  return (
    <div className="onboarding-progress">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div
          key={i}
          className={cn(
            'onboarding-progress-dot',
            i === currentStep && 'is-active',
            i < currentStep && 'is-completed',
          )}
        />
      ))}
    </div>
  )
}
