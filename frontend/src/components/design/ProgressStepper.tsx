import type { ReactElement, ReactNode } from 'react'
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react'

import { DesignNavButton } from '@/components/design/DesignNavButton'
import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'

export interface ProgressStepLink {
  step: number
  label: string
  icon: ReactNode
}

interface ProgressStepperProps {
  currentStep: number
  totalSteps: number
  renderStepLink: (link: ProgressStepLink) => ReactElement
}

const stepperClusterClassName = 'flex h-12 w-[104px] shrink-0 items-center justify-center gap-2'
const stepperButtonClassName = 'size-12 p-3'

export function ProgressStepper({
  currentStep,
  totalSteps,
  renderStepLink,
}: ProgressStepperProps) {
  const showPrevious = currentStep > 1
  const showNext = currentStep < totalSteps
  const fillPercent = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0

  return (
    <nav aria-label="Guide progress" className="flex w-full max-w-[300px] flex-col">
      <div className="flex items-center justify-between px-3 pb-4 pt-2">
        <div className={stepperClusterClassName}>
          {showPrevious ? (
            <>
              <StepControl
                step={1}
                label="First step"
                icon={<ChevronFirst aria-hidden />}
                renderStepLink={renderStepLink}
              />
              <StepControl
                step={currentStep - 1}
                label="Previous step"
                icon={<ChevronLeft aria-hidden />}
                renderStepLink={renderStepLink}
              />
            </>
          ) : null}
        </div>
        <p className={cn(designTypeClassName.metadata, 'text-[var(--design-text-regular)]')}>
          Step {currentStep}/{totalSteps}
        </p>
        <div className={stepperClusterClassName}>
          {showNext ? (
            <>
              <StepControl
                step={currentStep + 1}
                label="Next step"
                icon={<ChevronRight aria-hidden />}
                renderStepLink={renderStepLink}
              />
              <StepControl
                step={totalSteps}
                label="Last step"
                icon={<ChevronLast aria-hidden />}
                renderStepLink={renderStepLink}
              />
            </>
          ) : null}
        </div>
      </div>
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
    </nav>
  )
}
function StepControl({
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

