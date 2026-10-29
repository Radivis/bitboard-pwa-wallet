import type { ReactElement, ReactNode } from 'react'

import { DesignNavButton } from '@/components/design/DesignNavButton'

export interface ProgressStepLink {
  step: number
  label: string
  icon: ReactNode
}

export const stepperClusterClassName = 'flex h-12 w-[104px] shrink-0 items-center justify-center gap-2'
export const stepperButtonClassName = 'size-12 p-3'

export function StepProgressBar({
  currentStep,
  totalSteps,
}: {
  currentStep: number
  totalSteps: number
}) {
  const fillPercent = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0

  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-valuenow={currentStep}
      aria-label={`Step ${currentStep} of ${totalSteps}`}
      className="h-2 w-full overflow-hidden rounded-[4px] bg-[var(--design-status-info-surface)]"
    >
      <div
        className="h-full bg-[var(--design-status-info-foreground)]"
        style={{ width: `${fillPercent}%` }}
      />
    </div>
  )
}

export function StepControl({
  step,
  label,
  icon,
  renderStepLink,
}: ProgressStepLink & {
  renderStepLink: (link: ProgressStepLink) => ReactElement
}) {
  return (
    <DesignNavButton asChild className={stepperButtonClassName}>
      {renderStepLink({ step, label, icon })}
    </DesignNavButton>
  )
}
