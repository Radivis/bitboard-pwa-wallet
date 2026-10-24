import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { DesignToast } from '@/components/design/DesignToast'
import { DesignToaster } from '@/components/design/DesignToaster'

function installMatchMedia() {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}

function toastElement(text: string) {
  const title = screen.getByText(text)
  const toastEl = title.closest('[data-sonner-toast]')
  expect(toastEl).not.toBeNull()
  return toastEl as HTMLElement
}

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
  beforeEach(() => {
    installMatchMedia()
    render(<DesignToaster />)
  })

  afterEach(() => {
    toast.dismiss()
  })

  it('shows an unstyled success toast with title, description, and close', async () => {
    toast.success('Copied', { description: 'Address is on the clipboard.' })

    expect(await screen.findByText('Copied')).toBeInTheDocument()
    const toastEl = toastElement('Copied')
    expect(toastEl).toHaveAttribute('data-type', 'success')
    expect(toastEl).toHaveAttribute('data-styled', 'false')
    expect(document.querySelector('[data-sonner-toaster]')).toHaveClass('design-toaster')
    expect(screen.getByText('Address is on the clipboard.')).toBeInTheDocument()
    expect(toastEl).toHaveClass('items-center')
    const closeButton = screen.getByRole('button', { name: 'Close' })
    expect(closeButton).toHaveClass('order-last', 'self-center')
    expect(toastEl.querySelector('[data-icon]')).toHaveClass('self-center')
  })

  it('keeps the error type on error toasts', async () => {
    toast.error('Sync failed')

    expect(await screen.findByText('Sync failed')).toBeInTheDocument()
    expect(toastElement('Sync failed')).toHaveAttribute('data-type', 'error')
  })

  it('shows an info toast with the info icon and a close control', async () => {
    toast.info('Infomode on', { description: 'Highlights explain each control.' })

    expect(await screen.findByText('Infomode on')).toBeInTheDocument()
    const toastEl = toastElement('Infomode on')
    expect(toastEl).toHaveAttribute('data-type', 'info')
    expect(toastEl.querySelector('[data-icon] svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('shows a loading toast with a spinner and no close control', async () => {
    toast.loading('Scanning blockchain…')

    expect(await screen.findByText('Scanning blockchain…')).toBeInTheDocument()
    const toastEl = toastElement('Scanning blockchain…')
    expect(toastEl).toHaveAttribute('data-type', 'loading')
    expect(toastEl.querySelector('.animate-spin')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })
})
