import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { HowToGetBitcoinPage } from '@/pages/guides/HowToGetBitcoinPage'

function cardFor(title: string) {
  const card = screen.getByText(title).closest('[data-slot="design-card"]')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

function renderHowToGetBitcoin() {
  const rootRoute = createRootRoute({ component: Outlet })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/guides/how-to-get-bitcoin',
    component: HowToGetBitcoinPage,
  })
  const exchangesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/guides/how-to-get-bitcoin/exchanges',
    component: () => <div>Exchanges</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute, exchangesRoute]),
    history: createMemoryHistory({ initialEntries: ['/guides/how-to-get-bitcoin'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('HowToGetBitcoinPage', () => {
  it('groups the five ways to get Bitcoin and links only Exchanges', async () => {
    renderHowToGetBitcoin()

    expect(await screen.findByRole('heading', { name: 'How to get Bitcoin' })).toBeInTheDocument()
    expect(screen.getByText('From easiest to hardest')).toBeInTheDocument()

    const kycCard = cardFor('Typically requiring KYC procedures')
    expect(kycCard.getByRole('link', { name: 'Exchanges' })).toHaveAttribute(
      'href',
      '/guides/how-to-get-bitcoin/exchanges',
    )
    expect(kycCard.getByRole('button', { name: 'Apps' })).toBeInTheDocument()

    const locationCard = cardFor('Depending on your location')
    expect(locationCard.getByRole('button', { name: 'People' })).toBeInTheDocument()
    expect(locationCard.getByRole('button', { name: 'Bitcoin ATMs' })).toBeInTheDocument()

    const miningCard = cardFor('For truly dedicated people')
    expect(miningCard.getByRole('button', { name: 'Mining' })).toHaveClass('border')

    expect(screen.getAllByRole('link')).toHaveLength(1)
  })
})
