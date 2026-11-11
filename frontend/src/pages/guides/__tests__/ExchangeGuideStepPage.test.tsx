import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import { GUIDE_STEP_NAV_ID } from '@/pages/guides/GuideStepNavChrome'

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
  it('shows the step indicator, comic above text, and nav stepper on step 1', async () => {
    renderExchangeGuideStep(1)

    expect(
      await screen.findByRole('heading', { name: 'Exchanges Step By Step' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Step 1/4')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Step 1 of 4' })).toBeInTheDocument()
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
    expect(comic.className).toContain('rounded-[16px]')
    expect(comic.style.getPropertyValue('--exchange-comic-width')).toBe('1712px')

    const stepHeading = screen.getByRole('heading', { name: 'Exchange Selection' })
    expect(stepHeading.compareDocumentPosition(comic) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      comic.compareDocumentPosition(screen.getByText('Pick an exchange. The following site is a good starting point:')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    const textBlock = screen.getByText(
      'Pick an exchange. The following site is a good starting point:',
    ).parentElement
    expect(textBlock?.className).toContain('px-0.5')

    expect(screen.getByRole('link', { name: 'Next step' })).toHaveAttribute(
      'href',
      '/guides/how-to-get-bitcoin/exchanges/2',
    )
    expect(screen.getByRole('link', { name: 'Last step' })).toHaveAttribute(
      'href',
      '/guides/how-to-get-bitcoin/exchanges/4',
    )
    expect(screen.queryByRole('link', { name: 'Previous step' })).not.toBeInTheDocument()

    const stepNav = document.getElementById(GUIDE_STEP_NAV_ID)
    expect(stepNav).not.toBeNull()
    expect(stepNav?.className).toContain('--design-elevation-nav-bar')
    expect(stepNav?.className).not.toContain('pt-5')
    const hideButton = screen.getByRole('button', { name: 'Hide navigation' })
    expect(hideButton).toHaveAttribute('aria-controls', GUIDE_STEP_NAV_ID)
    expect(stepNav?.contains(hideButton)).toBe(false)
    expect(hideButton.className).toContain('bg-transparent')
    expect(hideButton.style.bottom).toContain('--guide-step-nav-height')
  })

  it('hides and shows the nav stepper with the toggle', async () => {
    const user = userEvent.setup()
    renderExchangeGuideStep(2)

    const hideButton = await screen.findByRole('button', { name: 'Hide navigation' })
    const stepNav = document.getElementById(GUIDE_STEP_NAV_ID)
    expect(stepNav).not.toBeNull()
    expect(stepNav).toHaveAttribute('aria-hidden', 'false')
    expect(within(stepNav as HTMLElement).getByRole('link', { name: 'Next step' })).toBeInTheDocument()
    expect(stepNav?.contains(hideButton)).toBe(false)

    await user.click(hideButton)
    const showButton = screen.getByRole('button', { name: 'Show navigation' })
    expect(showButton.style.bottom).toBe('0.5rem')
    expect(showButton.className).toContain('--design-elevation-nav-bar')
    expect(showButton.className).not.toContain('bg-transparent')
    expect(stepNav).toHaveAttribute('aria-hidden', 'true')
    expect(stepNav?.className).toContain('translate-y-full')

    await user.click(showButton)
    const restoredHideButton = screen.getByRole('button', { name: 'Hide navigation' })
    expect(restoredHideButton.className).toContain('bg-transparent')
    expect(stepNav).toHaveAttribute('aria-hidden', 'false')
  })


  it('shows each later step title, body, and comic', async () => {
    for (const content of EXCHANGE_GUIDE_STEPS.filter((entry) => entry.step > 1)) {
      const { unmount } = renderExchangeGuideStep(content.step)
      expect(await screen.findByRole('heading', { name: content.title })).toBeInTheDocument()
      for (const paragraph of content.paragraphs) {
        expect(screen.getByText(paragraph)).toBeInTheDocument()
      }
      const renderedParagraphs = content.paragraphs.map((paragraph) => screen.getByText(paragraph))
      expect(new Set(renderedParagraphs).size).toBe(content.paragraphs.length)
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
