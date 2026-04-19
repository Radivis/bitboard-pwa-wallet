import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeveloperContactCard } from '@/components/DeveloperContactCard'
import { getDeveloperContactLines } from '@/developer-contact/contact-lines'

vi.mock('@/developer-contact/contact-lines', () => ({
  getDeveloperContactLines: vi.fn(() => ''),
}))

describe('DeveloperContactCard', () => {
  beforeEach(() => {
    vi.mocked(getDeveloperContactLines).mockReturnValue('')
  })

  it('renders nothing when contact lines are empty', () => {
    const { container } = render(<DeveloperContactCard />)
    expect(container.firstChild).toBeNull()
  })

  it('renders heading and body when contact lines are set', () => {
    vi.mocked(getDeveloperContactLines).mockReturnValue('Line one\nLine two')
    render(<DeveloperContactCard />)
    expect(screen.getByText('Developer contact')).toBeInTheDocument()
    expect(screen.getByText(/Line one/)).toBeInTheDocument()
    expect(screen.getByText(/Line two/)).toBeInTheDocument()
  })
})
