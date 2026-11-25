import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DesignStepIndicator } from '@/components/design/DesignStepIndicator'

describe('DesignStepIndicator', () => {
  it('shows Step n/total and fills the progress bar by current/total', () => {
    render(<DesignStepIndicator currentStep={1} totalSteps={4} />)

    expect(screen.getByText('Step 1/4')).toBeInTheDocument()
    const progress = screen.getByRole('progressbar', { name: 'Step 1 of 4' })
    expect(progress).toHaveAttribute('aria-valuenow', '1')
    expect(progress).toHaveAttribute('aria-valuemax', '4')
    expect(progress.firstElementChild).toHaveStyle({ width: '25%' })
  })

  it('fills the bar completely on the last step', () => {
    render(<DesignStepIndicator currentStep={4} totalSteps={4} />)

    expect(screen.getByText('Step 4/4')).toBeInTheDocument()
    expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ width: '100%' })
  })
})
