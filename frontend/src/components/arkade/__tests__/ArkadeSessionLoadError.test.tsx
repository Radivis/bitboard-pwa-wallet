import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ARKADE_SESSION_LOAD_ERROR_TILT_CLASS } from '@/components/arkade/arkade-session-status-layout'
import { ArkadeSessionLoadError } from '@/components/arkade/ArkadeSessionLoadError'
import { SIGNET_ARKADE_SESSION_START_APPENDIX } from '@/lib/arkade/signet-arkade-session-start-note'

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
    expect(icon).toHaveClass(ARKADE_SESSION_LOAD_ERROR_TILT_CLASS)
    expect(icon).toHaveClass('text-red-600')
    expect(icon).not.toHaveClass('animate-spin')
  })

  it('omits the error line when there is no message', () => {
    render(<ArkadeSessionLoadError errorMessage={null} />)

    expect(screen.queryByTestId('arkade-session-load-error-message')).not.toBeInTheDocument()
  })

  it('appends the Signet reliability note when session start failed on Signet', () => {
    render(
      <ArkadeSessionLoadError errorMessage="Arkade session start timed out" networkMode="signet" />,
    )

    expect(screen.getByTestId('arkade-session-load-error-message')).toHaveTextContent(
      `Arkade session start timed out: ${SIGNET_ARKADE_SESSION_START_APPENDIX}`,
    )
  })

  it('shows the Signet reliability note when the failure has no detail', () => {
    render(<ArkadeSessionLoadError errorMessage={null} networkMode="signet" />)

    expect(screen.getByTestId('arkade-session-load-error-message')).toHaveTextContent(
      SIGNET_ARKADE_SESSION_START_APPENDIX,
    )
  })

  it('leaves the failure unchanged on Mutinynet', () => {
    render(
      <ArkadeSessionLoadError errorMessage="Arkade session start timed out" networkMode="mutinynet" />,
    )

    expect(screen.getByTestId('arkade-session-load-error-message')).toHaveTextContent(
      'Arkade session start timed out',
    )
    expect(screen.getByTestId('arkade-session-load-error-message')).not.toHaveTextContent(
      'less reliable',
    )
  })

  it('retries session open from the error page', () => {
    retryLoad.mockClear()
    render(<ArkadeSessionLoadError errorMessage="Load failed" />)

    screen.getByRole('button', { name: 'Retry' }).click()
    expect(retryLoad).toHaveBeenCalledOnce()
  })
})
