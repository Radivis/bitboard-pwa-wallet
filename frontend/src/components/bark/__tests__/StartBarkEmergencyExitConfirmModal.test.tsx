import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StartBarkEmergencyExitConfirmModal } from '@/components/bark/StartBarkEmergencyExitConfirmModal'
import { renderWithProviders } from '@/test-utils/test-providers'

describe('StartBarkEmergencyExitConfirmModal', () => {
  it('keeps Start emergency exit disabled until risks are acknowledged', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    renderWithProviders(
      <StartBarkEmergencyExitConfirmModal open onOpenChange={vi.fn()} onConfirm={onConfirm} />,
    )

    const confirmButton = screen.getByTestId('bark-emergency-exit-start-confirm')
    expect(confirmButton).toBeDisabled()
    expect(screen.getByText(/Loss of funds if the server is still online/)).toBeInTheDocument()
    expect(screen.getByText(/High on-chain fees/)).toBeInTheDocument()

    await user.click(screen.getByTestId('bark-emergency-exit-start-ack'))
    expect(confirmButton).toBeEnabled()

    await user.click(confirmButton)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
