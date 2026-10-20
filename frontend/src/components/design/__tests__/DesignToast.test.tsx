import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { DesignToast } from '@/components/design/DesignToast'
import { DesignToaster } from '@/components/design/DesignToaster'

describe('DesignToast', () => {
  it('closes when the close control is used and can render without one', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(
      <DesignToast status="success" title="Saved" description="The address is stored." onClose={onClose} />,
    )
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()

    rerender(<DesignToast status="risk" title="Review" />)
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(screen.getByText('Review')).toBeInTheDocument()
  })
})

describe('DesignToaster', () => {
  it('shows a Sonner toast with a close control', async () => {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
    render(<DesignToaster />)
    toast.success('Copied')
    expect(await screen.findByText('Copied')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    toast.dismiss()
  })
})
