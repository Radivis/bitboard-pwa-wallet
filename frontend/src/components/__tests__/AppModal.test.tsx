import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test-utils/test-providers'
import { AppModal } from '@/components/AppModal'
import { DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

vi.mock('@/components/infomode/InfomodeToggle', () => ({
  InfomodeToggle: () => <button type="button" aria-label="Turn on infomode" />,
}))

describe('AppModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Infomode toggle in the header', () => {
    renderWithProviders(
      <AppModal
        open
        onOpenChange={() => {}}
        onCancel={() => {}}
        title="Test title"
      >
        <DialogDescription>Body</DialogDescription>
      </AppModal>,
    )
    expect(screen.getByRole('button', { name: 'Turn on infomode' })).toBeInTheDocument()
  })

  it('invokes onCancel when the close button is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    renderWithProviders(
      <AppModal open onOpenChange={() => {}} onCancel={onCancel} title="T">
        <DialogDescription>Content</DialogDescription>
      </AppModal>,
    )
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('passes requestClose to footer that matches cancel behavior', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    renderWithProviders(
      <AppModal
        open
        onOpenChange={() => {}}
        onCancel={onCancel}
        title="T"
        footer={(requestClose) => (
          <>
            <Button type="button" variant="outline" onClick={requestClose}>
              Dismiss
            </Button>
            <Button type="button" onClick={() => {}}>
              OK
            </Button>
          </>
        )}
      >
        <DialogDescription>Content</DialogDescription>
      </AppModal>,
    )
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
