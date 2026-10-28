import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { ExchangeGuideIntroPage } from '@/pages/guides/ExchangeGuideIntroPage'
import { EXCHANGE_GUIDE_INTRO_PARAGRAPHS } from '@/pages/guides/exchange-guide'

function renderExchangeGuideIntro() {
  const rootRoute = createRootRoute({ component: Outlet })
  const introRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/guides/how-to-get-bitcoin/exchanges',
    component: ExchangeGuideIntroPage,
  })
  const stepRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/guides/how-to-get-bitcoin/exchanges/$step',
    component: () => <div>Step</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([introRoute, stepRoute]),
    history: createMemoryHistory({ initialEntries: ['/guides/how-to-get-bitcoin/exchanges'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('ExchangeGuideIntroPage', () => {
  it('explains exchanges and opens the first step', async () => {
    renderExchangeGuideIntro()

    expect(await screen.findByRole('heading', { name: 'Exchanges' })).toBeInTheDocument()
    for (const paragraph of EXCHANGE_GUIDE_INTRO_PARAGRAPHS) {
      expect(screen.getByText(paragraph)).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Step by Step Guide' })).toHaveAttribute(
      'href',
      '/guides/how-to-get-bitcoin/exchanges/1',
    )
  })
})
