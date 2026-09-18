import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { InfomodeProvider } from '@/components/infomode/InfomodeProvider'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'

describe('InfomodeWrapper', () => {
  it('does not set data-infomode-id when both inline props and infoComponent are provided', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    function DummyInfomodeContent() {
      return <p>component body</p>
    }

    const { container } = render(
      <InfomodeProvider>
        <InfomodeWrapper
          infoId="both-variants"
          infoTitle="Title"
          infoText="Body"
          infoComponent={DummyInfomodeContent}
        >
          <span>child</span>
        </InfomodeWrapper>
      </InfomodeProvider>,
    )

    expect(container.querySelector('[data-infomode-id]')).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('does not set data-infomode-id when inline props are incomplete', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <InfomodeProvider>
        <InfomodeWrapper infoId="broken-inline" infoTitle="Only title">
          <span>child</span>
        </InfomodeWrapper>
      </InfomodeProvider>,
    )

    expect(container.querySelector('[data-infomode-id]')).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('sets data-infomode-id when infoTitle and infoText are provided', () => {
    const { container } = render(
      <InfomodeProvider>
        <InfomodeWrapper infoId="ok-inline" infoTitle="Title" infoText="Body">
          <span>child</span>
        </InfomodeWrapper>
      </InfomodeProvider>,
    )

    expect(container.querySelector('[data-infomode-id="ok-inline"]')).not.toBeNull()
  })
})
