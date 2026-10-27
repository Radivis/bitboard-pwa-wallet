import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { HowToGetBitcoinPage } from '@/pages/guides/HowToGetBitcoinPage'

function cardFor(title: string) {
  const card = screen.getByText(title).closest('[data-slot="design-card"]')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

describe('HowToGetBitcoinPage', () => {
  it('groups the five ways to get Bitcoin into cards without leaving the page', () => {
    render(<HowToGetBitcoinPage />)

    expect(screen.getByRole('heading', { name: 'How to get Bitcoin' })).toBeInTheDocument()
    expect(screen.getByText('From easiest to hardest')).toBeInTheDocument()

    const kycCard = cardFor('Typically requiring KYC procedures')
    expect(kycCard.getByRole('button', { name: 'Exchanges' })).toBeInTheDocument()
    expect(kycCard.getByRole('button', { name: 'Apps' })).toBeInTheDocument()

    const locationCard = cardFor('Depending on your location')
    expect(locationCard.getByRole('button', { name: 'People' })).toBeInTheDocument()
    expect(locationCard.getByRole('button', { name: 'Bitcoin ATMs' })).toBeInTheDocument()

    const miningCard = cardFor('For truly dedicated people')
    expect(miningCard.getByRole('button', { name: 'Mining' })).toHaveClass('border')

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
