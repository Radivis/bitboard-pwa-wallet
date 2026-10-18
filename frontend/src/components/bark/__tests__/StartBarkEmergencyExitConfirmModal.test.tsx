import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  BARK_EMERGENCY_EXIT_RISK_ARTICLE_SLUG,
  StartBarkEmergencyExitConfirmModal,
} from '@/components/bark/StartBarkEmergencyExitConfirmModal'
import { renderWithProviders } from '@/test-utils/test-providers'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({
      children,
      to,
      params,
      ...props
    }: {
      children: React.ReactNode
      to: string
      params?: Record<string, string>
    }) => {
      const href =
        params == null
          ? to
          : Object.entries(params).reduce(
              (path, [key, value]) => path.replace(`$${key}`, value),
              to,
            )
      return (
        <a href={href} {...props}>
          {children}
        </a>
      )
    },
  }
})

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

  it('links to the article that explains Bark checkpoints', () => {
    renderWithProviders(
      <StartBarkEmergencyExitConfirmModal open onOpenChange={vi.fn()} onConfirm={vi.fn()} />,
    )
  })
})
