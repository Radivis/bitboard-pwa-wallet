import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { CompletedUnilateralExitNotice } from '@/components/wallet/CompletedUnilateralExitNotice'
import { renderWithProviders } from '@/test-utils/test-providers'

describe('CompletedUnilateralExitNotice', () => {
  it('shows the sweep txid and a mutinynet explorer link', () => {
    const txid = 'ef'.repeat(32)
    renderWithProviders(
      <CompletedUnilateralExitNotice txid={txid} networkMode="mutinynet" onDismiss={vi.fn()} />,
    )

    const notice = screen.getByTestId('arkade-complete-exit-txid')
    expect(notice).toHaveTextContent(txid)
    expect(screen.getByRole('link', { name: /view transaction/i })).toHaveAttribute(
      'href',
      `https://mutinynet.com/tx/${txid}`,
    )
  })
})
