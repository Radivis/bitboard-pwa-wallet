import { designTypeClassName } from '@/components/design/design-type'
import { StepProgressBar } from '@/components/design/stepper-shared'
import { cn } from '@/lib/shared/utils'

interface DesignStepIndicatorProps {
  currentStep: number
  totalSteps: number
}

export function DesignStepIndicator({ currentStep, totalSteps }: DesignStepIndicatorProps) {
  return (
    <div className="flex w-full max-w-[300px] flex-col gap-2">
      <p className={cn(designTypeClassName.metadata, 'text-[var(--design-text-regular)]')}>
        Step {currentStep}/{totalSteps}
      </p>
      <StepProgressBar currentStep={currentStep} totalSteps={totalSteps} />
    </div>
  )
}
