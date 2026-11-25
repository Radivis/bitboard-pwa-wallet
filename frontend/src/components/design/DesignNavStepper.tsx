import type { ReactElement, ReactNode } from 'react'
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react'

import {
  StepControl,
  stepperClusterClassName,
  type ProgressStepLink,
} from '@/components/design/stepper-shared'

export type { ProgressStepLink }

interface DesignNavStepperProps {
  currentStep: number
  totalSteps: number
  renderStepLink: (link: ProgressStepLink) => ReactElement
  /** Optional control rendered between the previous and next clusters (e.g. nav toggle). */
  center?: ReactNode
}

export function DesignNavStepper({
  currentStep,
  totalSteps,
  renderStepLink,
  center,
}: DesignNavStepperProps) {
  const showPrevious = currentStep > 1
  const showNext = currentStep < totalSteps

  return (
    <div className="flex w-full items-center justify-between gap-2">
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
      <div className="flex shrink-0 items-center justify-center">{center}</div>
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
  )
}
