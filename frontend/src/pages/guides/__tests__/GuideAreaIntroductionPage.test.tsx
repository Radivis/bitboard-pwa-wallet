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
import { GuideAreaIntroductionPage } from '@/pages/guides/GuideAreaIntroductionPage'
import { GUIDE_AREA_INTRODUCTIONS } from '@/pages/guides/guide-area-introductions'

function renderGuidesIntroduction() {
  const introduction = GUIDE_AREA_INTRODUCTIONS.guides
  const rootRoute = createRootRoute({ component: Outlet })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/guides/introduction/guides',
    component: () => (
      <GuideAreaIntroductionPage title={introduction.title} paragraphs={introduction.paragraphs} />
    ),
  })
  const backRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/guides/introduction',
    component: () => <div>Introduction</div>,
  })
  const startRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Start</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute, backRoute, startRoute]),
    history: createMemoryHistory({ initialEntries: ['/guides/introduction/guides'] }),
  })
  return render(<RouterProvider router={router} />)
}

function renderAreaIntroduction(
  introduction: (typeof GUIDE_AREA_INTRODUCTIONS)[keyof typeof GUIDE_AREA_INTRODUCTIONS],
) {
  const rootRoute = createRootRoute({ component: Outlet })
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/guides/introduction/area',
    component: () => (
      <GuideAreaIntroductionPage title={introduction.title} paragraphs={introduction.paragraphs} />
    ),
  })
  const backRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/guides/introduction',
    component: () => <div>Introduction</div>,
  })
  const startRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Start</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute, backRoute, startRoute]),
    history: createMemoryHistory({ initialEntries: ['/guides/introduction/area'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('GuideAreaIntroductionPage', () => {
  it('returns to the introduction or to Start', async () => {
    renderGuidesIntroduction()

    expect(await screen.findByRole('heading', { name: 'Bitcoin Codex Guides' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/guides/introduction')
    expect(screen.getByRole('link', { name: 'Let’s go to the actual app' })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('renders each area introduction as separate paragraphs', async () => {
    for (const introduction of Object.values(GUIDE_AREA_INTRODUCTIONS)) {
      const { unmount } = renderAreaIntroduction(introduction)
      expect(await screen.findByRole('heading', { name: introduction.title })).toBeInTheDocument()
      const renderedParagraphs = introduction.paragraphs.map((paragraph) =>
        screen.getByText(paragraph),
      )
      expect(new Set(renderedParagraphs).size).toBe(introduction.paragraphs.length)
      unmount()
    }
  })
})
