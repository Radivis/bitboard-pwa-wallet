import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeveloperContactCard } from '@/components/DeveloperContactCard'

describe('DeveloperContactCard', () => {
  it('renders title, name, and contact links', () => {
    render(<DeveloperContactCard />)
    expect(screen.getByText('Developer Contact Info')).toBeInTheDocument()
    expect(screen.getByText('Michael Hrenka')).toBeInTheDocument()

    expect(
      screen.getByRole('link', { name: 'michael.hrenka@protonmail.com' }),
    ).toHaveAttribute('href', 'mailto:michael.hrenka@protonmail.com')

    expect(screen.getByRole('link', { name: 'https://github.com/Radivis/' })).toHaveAttribute(
      'href',
      'https://github.com/Radivis/',
    )

    expect(screen.getByRole('link', { name: '@Radivis' })).toHaveAttribute(
      'href',
      'https://x.com/Radivis',
    )

    expect(screen.getByRole('link', { name: '@Cosmohorse' })).toHaveAttribute(
      'href',
      'https://t.me/Cosmohorse',
    )

    const nostrLink = screen.getByRole('link', { name: 'njump.me' })
    expect(nostrLink).toHaveAttribute(
      'href',
      'https://njump.me/npub1fc3s4vcdkvpyldkckduau9wr4dn8fpg9475rcvv859djt3zuwfysvkkpx6',
    )
  })
})
