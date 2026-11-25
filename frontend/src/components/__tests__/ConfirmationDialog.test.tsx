import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'
import { renderWithProviders } from '@/test-utils/test-providers'

describe('ConfirmationDialog', () => {
  it('uses the destructive button for a destructive confirm', () => {
    renderWithProviders(
      <ConfirmationDialog
        open
        title="Delete lab entity?"
        message="This cannot be undone."
        confirmText="Delete"
        variant="destructive"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute(
      'data-slot',
      'design-destructive-button',
    )
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('data-type', 'secondary')
  })

  it('keeps a primary confirm when the dialog is not destructive', () => {
    renderWithProviders(
      <ConfirmationDialog
        open
        title="Confirm action"
        message="Review the details."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveAttribute('data-type', 'primary')
    expect(screen.getByRole('button', { name: 'Confirm' })).not.toHaveAttribute(
      'data-slot',
      'design-destructive-button',
    )
  })
})
