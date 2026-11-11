import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DesignNavStepper } from '@/components/design/DesignNavStepper'

function renderNavStepper(currentStep: number) {
  render(
    <DesignNavStepper
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

describe('DesignNavStepper', () => {
  it('hides the previous controls on the first step', () => {
    renderNavStepper(1)

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
  })

  it('links first, previous, next, and last from a middle step', () => {
    renderNavStepper(3)

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
  })

  it('hides the next controls on the last step', () => {
    renderNavStepper(4)

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
  })

  it('renders an optional center control between the step clusters', () => {
    render(
      <DesignNavStepper
        currentStep={2}
        totalSteps={4}
        center={<button type="button">Center control</button>}
        renderStepLink={({ step, label, icon }) => (
          <a href={`/step/${step}`} aria-label={label}>
            {icon}
          </a>
        )}
      />,
    )

    const links = screen.getAllByRole('link')
    const center = screen.getByRole('button', { name: 'Center control' })
    expect(
      links[1].compareDocumentPosition(center) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      center.compareDocumentPosition(links[2]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

