import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeveloperContactCard } from '@/components/DeveloperContactCard'

describe('DeveloperContactCard', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders nothing when VITE_CONTACTS is unset or empty', () => {
    vi.stubEnv('VITE_CONTACTS', '')
    const { container } = render(<DeveloperContactCard />)
    expect(container.firstChild).toBeNull()
  })

  it('renders heading and body when VITE_CONTACTS is set', () => {
    vi.stubEnv('VITE_CONTACTS', 'Line one\nLine two')
    render(<DeveloperContactCard />)
    expect(screen.getByText('Developer contact')).toBeInTheDocument()
    expect(screen.getByText(/Line one/)).toBeInTheDocument()
    expect(screen.getByText(/Line two/)).toBeInTheDocument()
  })
})
