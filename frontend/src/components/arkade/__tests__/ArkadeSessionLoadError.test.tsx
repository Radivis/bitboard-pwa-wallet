import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ArkadeSessionLoadError } from '@/components/arkade/ArkadeSessionLoadError'

const retryLoad = vi.hoisted(() => vi.fn())

vi.mock('@/lib/wallet/lifecycle/arkade-load-lifecycle-orchestrator', () => ({
  orchestrateArkadeRetryLoad: () => retryLoad(),
}))

describe('ArkadeSessionLoadError', () => {
  it('shows a tilted red mark, the failure heading, and a sanitized error', () => {
    render(
      <ArkadeSessionLoadError errorMessage="connect failed https://operator.example/v1" />,
    )

    expect(
      screen.getByRole('heading', { name: 'Arkade session could not be established' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('arkade-session-load-error-message')).toHaveTextContent(
      'connect failed [url]',
    )

    const icon = screen.getByTestId('arkade-session-load-error').querySelector('[aria-hidden="true"]')
    expect(icon).toHaveClass('rotate-[160deg]')
    expect(icon).toHaveClass('text-red-600')
    expect(icon).not.toHaveClass('animate-spin')
  })

  it('omits the error line when there is no message', () => {
    render(<ArkadeSessionLoadError errorMessage={null} />)

    expect(screen.queryByTestId('arkade-session-load-error-message')).not.toBeInTheDocument()
  })

  it('retries session open from the error page', () => {
    retryLoad.mockClear()
    render(<ArkadeSessionLoadError errorMessage="Load failed" />)

    screen.getByRole('button', { name: 'Retry' }).click()
    expect(retryLoad).toHaveBeenCalledOnce()
  })
})
