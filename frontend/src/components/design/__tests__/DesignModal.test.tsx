import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DesignModal } from '@/components/design/DesignModal'
import { renderWithProviders } from '@/test-utils/test-providers'

function OptInModal({ onChange }: { onChange: (checked: boolean) => void }) {
  const [checked, setChecked] = useState(false)
  return (
    <DesignModal
      isOpen
      onOpenChange={() => {}}
      onCancel={() => {}}
      title="Confirm action"
      optIn={{
        id: 'ack',
        label: 'I understand',
        checked,
        onChange: (next) => {
          setChecked(next)
          onChange(next)
        },
      }}
    >
      <p>Review the details.</p>
    </DesignModal>
  )
}

describe('DesignModal', () => {
  it('renders the title, the infomode toggle, and closes through onCancel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    renderWithProviders(
      <DesignModal isOpen onOpenChange={() => {}} onCancel={onCancel} title="Confirm action">
        <p>Review the details.</p>
      </DesignModal>,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Confirm action' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on infomode' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toHaveClass('bg-black/50')

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('reports opt-in changes under the acknowledgement label', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(<OptInModal onChange={onChange} />)

    const checkbox = screen.getByRole('checkbox', { name: 'I understand' })
    expect(checkbox).not.toBeChecked()
    await user.click(checkbox)
    expect(onChange).toHaveBeenCalledWith(true)
    expect(checkbox).toBeChecked()
  })
})
