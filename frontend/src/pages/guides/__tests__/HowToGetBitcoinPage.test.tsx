import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HowToGetBitcoinPage } from '@/pages/guides/HowToGetBitcoinPage'

describe('HowToGetBitcoinPage', () => {
  it('lists the five ways to get Bitcoin without leaving the page', () => {
    render(<HowToGetBitcoinPage />)

    expect(screen.getByRole('heading', { name: 'How to get Bitcoin' })).toBeInTheDocument()
    expect(screen.getByText('From easiest to hardest')).toBeInTheDocument()
    for (const label of ['Exchanges', 'Apps', 'People', 'Bitcoin ATMs', 'Mining']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
