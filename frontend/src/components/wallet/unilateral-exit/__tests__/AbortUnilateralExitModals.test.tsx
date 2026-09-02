import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/library/article-shared', () => ({
  ArticleLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

import { AbortUnilateralExitConfirmModal } from '@/components/wallet/unilateral-exit/AbortUnilateralExitConfirmModal'
import { AbortUnilateralExitInfoModal } from '@/components/wallet/unilateral-exit/AbortUnilateralExitInfoModal'
import { renderWithProviders } from '@/test-utils/test-providers'

describe('AbortUnilateralExitModals', () => {
  it('info modal continue opens confirm step via callback', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn()

    renderWithProviders(
      <AbortUnilateralExitInfoModal open onOpenChange={vi.fn()} onContinue={onContinue} />,
    )

    await user.click(screen.getByTestId('unilateral-exit-abort-info-continue'))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('confirm modal requires checkbox before abort', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    renderWithProviders(
      <AbortUnilateralExitConfirmModal open onOpenChange={vi.fn()} onConfirm={onConfirm} />,
    )

    const confirmButton = screen.getByTestId('unilateral-exit-abort-confirm')
    expect(confirmButton).toBeDisabled()

    await user.click(screen.getByTestId('unilateral-exit-abort-acknowledge'))
    expect(confirmButton).not.toBeDisabled()

    await user.click(confirmButton)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
