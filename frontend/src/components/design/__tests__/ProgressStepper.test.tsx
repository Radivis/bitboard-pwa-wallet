import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressStepper } from '@/components/design/ProgressStepper'

function renderStepper(currentStep: number) {
  render(
    <ProgressStepper
      currentStep={currentStep}
      totalSteps={4}
      renderStepLink={({ step, label, icon }) => (
        <a href={`/guides/how-to-get-bitcoin/exchanges/${step}`} aria-label={label}>
          {icon}
        </a>
      )}
    />,
  )
}

describe('ProgressStepper', () => {
  it('hides the previous controls on the first step and fills a quarter of the bar', () => {
    renderStepper(1)

    expect(screen.getByText('Step 1/4')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Previous step' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'First step' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Next step' })).toHaveAttribute(
      'href',
      '/guides/how-to-get-bitcoin/exchanges/2',
    )
    expect(screen.getByRole('link', { name: 'Last step' })).toHaveAttribute(
      'href',
      '/guides/how-to-get-bitcoin/exchanges/4',
    )

    const progress = screen.getByRole('progressbar', { name: 'Step 1 of 4' })
    expect(progress).toHaveAttribute('aria-valuenow', '1')
    expect(progress).toHaveAttribute('aria-valuemax', '4')
    expect(progress.firstElementChild).toHaveStyle({ width: '25%' })
  })

  it('links first, previous, next, and last from a middle step', () => {
    renderStepper(3)

    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'First step',
      'Previous step',
      'Next step',
      'Last step',
    ])
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/guides/how-to-get-bitcoin/exchanges/1',
      '/guides/how-to-get-bitcoin/exchanges/2',
      '/guides/how-to-get-bitcoin/exchanges/4',
      '/guides/how-to-get-bitcoin/exchanges/4',
    ])
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')
  })

  it('hides the next controls on the last step and fills the bar', () => {
    renderStepper(4)

    expect(screen.getByText('Step 4/4')).toBeInTheDocument()
    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'First step',
      'Previous step',
    ])
    expect(screen.getByRole('link', { name: 'Previous step' })).toHaveAttribute(
      'href',
      '/guides/how-to-get-bitcoin/exchanges/3',
    )
    expect(screen.getByRole('link', { name: 'First step' })).toHaveAttribute(
      'href',
      '/guides/how-to-get-bitcoin/exchanges/1',
    )
    expect(screen.queryByRole('link', { name: 'Next step' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Last step' })).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4')
    expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ width: '100%' })
  })
})
