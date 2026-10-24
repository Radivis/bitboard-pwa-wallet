import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DesignBanner } from '@/components/design/DesignBanner'

describe('DesignBanner', () => {
  it('uses a secondary button for the primary action and a tertiary button for the secondary action', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    const dismiss = vi.fn()
    render(
      <DesignBanner
        status="error"
        title="Exit stopped"
        description="Try the exit again."
        optionalContent={<p>Three VTXOs</p>}
        primaryAction={{ label: 'Retry', onClick: retry }}
        secondaryAction={{ label: 'Dismiss', onClick: dismiss }}
      />
    )
    expect(screen.getByText('Three VTXOs')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    const retryButton = screen.getByRole('button', { name: 'Retry' })
    const dismissButton = screen.getByRole('button', { name: 'Dismiss' })
    expect(retryButton).toHaveAttribute('data-type', 'secondary')
    expect(dismissButton).toHaveAttribute('data-type', 'tertiary')
    await user.click(retryButton)
    await user.click(dismissButton)
    expect(retry).toHaveBeenCalledOnce()
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('omits the action row when neither action is set', () => {
    render(<DesignBanner status="info" title="Notice" description="Nothing to do." />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
