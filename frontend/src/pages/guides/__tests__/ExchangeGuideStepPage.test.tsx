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
import { ExchangeGuideStepPage } from '@/pages/guides/ExchangeGuideStepPage'
import {
  COINGECKO_EXCHANGES_URL,
  EXCHANGE_GUIDE_STEPS,
  parseExchangeGuideStep,
} from '@/pages/guides/exchange-guide'

function renderExchangeGuideStep(step: number) {
  const rootRoute = createRootRoute({ component: Outlet })
  const stepRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/guides/how-to-get-bitcoin/exchanges/$step',
    component: () => <ExchangeGuideStepPage step={step} />,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([stepRoute]),
    history: createMemoryHistory({
      initialEntries: [`/guides/how-to-get-bitcoin/exchanges/${step}`],
    }),
  })
  return render(<RouterProvider router={router} />)
}

describe('ExchangeGuideStepPage', () => {
  it('shows the exchange comparison comic and the CoinGecko link on step 1', async () => {
    renderExchangeGuideStep(1)

    expect(
      await screen.findByRole('heading', { name: 'Exchanges Step By Step' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Exchange Selection' })).toBeInTheDocument()
    expect(
      screen.getByText('Pick an exchange. The following site is a good starting point:'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: COINGECKO_EXCHANGES_URL })).toHaveAttribute(
      'href',
      COINGECKO_EXCHANGES_URL,
    )
    expect(screen.getByRole('link', { name: COINGECKO_EXCHANGES_URL })).toHaveAttribute(
      'target',
      '_blank',
    )
    const comic = screen.getByRole('img', { name: 'Comparing crypto exchanges on a laptop' })
    expect(comic).toHaveAttribute('src', '/comics/get-bitcoins/get-bitcoins-1-exchange-comparison.jpg')
    expect(comic).toHaveAttribute('width', '1712')
    expect(comic).toHaveAttribute('height', '1152')
    expect(comic.className).toContain('w-[min(var(--exchange-comic-width),calc(100vw-32px))]')
    expect(comic.style.getPropertyValue('--exchange-comic-width')).toBe('1712px')
    expect(screen.getByRole('link', { name: 'Next step' })).toHaveAttribute(
      'href',
      '/guides/how-to-get-bitcoin/exchanges/2',
    )
    expect(screen.getByRole('link', { name: 'Last step' })).toHaveAttribute(
      'href',
      '/guides/how-to-get-bitcoin/exchanges/4',
    )
    expect(screen.queryByRole('link', { name: 'Previous step' })).not.toBeInTheDocument()
  })

  it('shows each later step title, body, and comic', async () => {
    for (const content of EXCHANGE_GUIDE_STEPS.filter((entry) => entry.step > 1)) {
      const { unmount } = renderExchangeGuideStep(content.step)
      expect(await screen.findByRole('heading', { name: content.title })).toBeInTheDocument()
      expect(screen.getByText(content.body)).toBeInTheDocument()
      expect(screen.getByRole('img', { name: content.comicAlt })).toHaveAttribute(
        'src',
        content.comicSrc,
      )
      unmount()
    }
  })

  it('accepts only steps 1 through 4', () => {
    expect(parseExchangeGuideStep('1')).toBe(1)
    expect(parseExchangeGuideStep('4')).toBe(4)
    expect(parseExchangeGuideStep('5')).toBeNull()
    expect(parseExchangeGuideStep('01')).toBeNull()
    expect(parseExchangeGuideStep('nope')).toBeNull()
  })
})
