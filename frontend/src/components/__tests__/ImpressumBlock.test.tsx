import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ImpressumBlock } from '@/components/ImpressumBlock'

describe('ImpressumBlock', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders nothing when VITE_IMPRINT is unset or empty', () => {
    vi.stubEnv('VITE_IMPRINT', '')
    const { container } = render(<ImpressumBlock />)
    expect(container.firstChild).toBeNull()
  })

  it('renders heading and body when VITE_IMPRINT is set', () => {
    vi.stubEnv('VITE_IMPRINT', 'Line one\nLine two')
    render(<ImpressumBlock />)
    expect(screen.getByText('Impressum')).toBeInTheDocument()
    expect(screen.getByText(/Line one/)).toBeInTheDocument()
    expect(screen.getByText(/Line two/)).toBeInTheDocument()
  })
})
