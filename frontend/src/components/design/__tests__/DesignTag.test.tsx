import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DesignTag } from '@/components/design/DesignTag'

describe('DesignTag', () => {
  it('renders a label with the tag chrome', () => {
    render(<DesignTag>Bitcoin</DesignTag>)
    const tag = screen.getByText('Bitcoin')
    expect(tag).toHaveAttribute('data-slot', 'design-tag')
    expect(tag.className).toContain('rounded-[12px]')
    expect(tag.className).toContain('h-6')
  })

  it('renders an optional icon', () => {
    render(<DesignTag icon={<span data-testid="icon" />}>Arkade</DesignTag>)
    expect(screen.getByText('Arkade')).toContainElement(screen.getByTestId('icon'))
  })

  it('renders as a link when asChild is set', () => {
    render(
      <DesignTag asChild>
        <a href="/library/tags?tag=bitcoin">Bitcoin</a>
      </DesignTag>,
    )
    const link = screen.getByRole('link', { name: 'Bitcoin' })
    expect(link).toHaveAttribute('href', '/library/tags?tag=bitcoin')
    expect(link).toHaveAttribute('data-slot', 'design-tag')
  })
})
