import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StartUnilateralExitConfirmModal } from '@/components/wallet/unilateral-exit/StartUnilateralExitConfirmModal'
import { renderWithProviders } from '@/test-utils/test-providers'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'

describe('StartUnilateralExitConfirmModal', () => {
  it('keeps Start unroll disabled until risks are acknowledged', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    renderWithProviders(
      <StartUnilateralExitConfirmModal open onOpenChange={vi.fn()} onConfirm={onConfirm} />,
    )

    const confirmButton = screen.getByTestId('unilateral-exit-start-confirm')
    expect(confirmButton).toBeDisabled()

    await user.click(screen.getByTestId('unilateral-exit-start-ack'))
    expect(confirmButton).toBeEnabled()

    await user.click(confirmButton)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('links to exit overview and risk articles', () => {
    renderWithProviders(
      <StartUnilateralExitConfirmModal open onOpenChange={vi.fn()} onConfirm={vi.fn()} />,
    )

    expect(screen.getByRole('link', { name: 'Exiting Arkade to on-chain' })).toHaveAttribute(
      'href',
      `/library/articles/${ARKADE_LIBRARY_SLUGS.exits}`,
    )
    expect(screen.getByRole('link', { name: 'Risks of unilateral exit' })).toHaveAttribute(
      'href',
      `/library/articles/${ARKADE_LIBRARY_SLUGS.unilateralExitRisks}`,
    )
  })
})
