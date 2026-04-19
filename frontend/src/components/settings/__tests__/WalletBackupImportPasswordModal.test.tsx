import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { WalletBackupImportPasswordModal } from '@/components/settings/WalletBackupImportPasswordModal'

vi.mock('@/components/infomode/InfomodeToggle', () => ({
  InfomodeToggle: () => <button type="button" aria-label="Turn on infomode" />,
}))

describe('WalletBackupImportPasswordModal', () => {
  it('shows verification error when provided', () => {
    renderWithProviders(
      <WalletBackupImportPasswordModal
        open
        onOpenChange={() => {}}
        onCancel={() => {}}
        onConfirm={() => {}}
        isBusy={false}
        verificationError="Verification failed. 2 attempt(s) remaining."
      />,
    )

    expect(
      screen.getByText('Verification failed. 2 attempt(s) remaining.'),
    ).toBeInTheDocument()
  })
})
