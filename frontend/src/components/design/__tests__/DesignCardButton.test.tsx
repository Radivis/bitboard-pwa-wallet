import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BookOpen } from 'lucide-react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { DesignCardButton } from '@/components/design/DesignCardButton'
import { designTypeClassName } from '@/components/design/design-type'

const designTokensPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../design-tokens.css')
const designTokens = readFileSync(designTokensPath, 'utf8')

function renderCardButton() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <DesignCardButton to="/library" icon={BookOpen}>
        Library
      </DesignCardButton>
    ),
  })
  const libraryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'library',
    component: () => <div>Library page</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, libraryRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('DesignCardButton', () => {
  it('renders a full-width Card-Button link', async () => {
    renderCardButton()

    const link = await screen.findByRole('link', { name: 'Library' })
    expect(link).toHaveAttribute('href', '/library')
    expect(link).toHaveAttribute('data-slot', 'design-card-button')
    expect(link.className).toContain('rounded-[32px]')
    expect(link.className).toContain('max-w-[600px]')
    expect(link.className).toContain('mx-auto')
    expect(link.className).toContain(designTypeClassName.largeButton)
    expect(link.className).not.toContain('design-card-shadow')
    expect(link.className).not.toContain('design-surface-card')
  })

  it('keeps each state inner shadow together with its outer drop shadows', () => {
    const cardButtonRules = designTokens.slice(designTokens.indexOf('[data-slot="design-card-button"]'))
    expect(cardButtonRules).toContain('--design-elevation-1')
    expect(cardButtonRules).toContain('--design-elevation-2')
    expect(cardButtonRules).toContain('--design-elevation-3')
    expect(cardButtonRules).toContain('0 1px 3px 1px rgb(0 0 0 / 0.15)')
    expect(cardButtonRules).toContain('0 3px 8px 0 rgb(0 0 0 / 0.25)')
    expect(cardButtonRules).toContain('inset 0 4px 7px 0 rgb(245 244 246 / 0.08)')
    expect(cardButtonRules).toContain('0 2px 6px 2px rgb(0 0 0 / 0.15)')
    expect(cardButtonRules).toContain('0 4px 10px 0 rgb(0 0 0 / 0.25)')
    expect(cardButtonRules).toContain('inset 0 4px 9px 0 rgb(236 235 239 / 0.08)')
    expect(cardButtonRules).toContain('0 5px 12px 0 rgb(0 0 0 / 0.25)')
    expect(cardButtonRules).toContain('0 4px 8px 3px rgb(0 0 0 / 0.15)')
    expect(cardButtonRules).toContain('inset 0 4px 11px 0 rgb(229 227 232 / 0.08)')
    expect(cardButtonRules).not.toContain('rgb(0 0 0 / 0.3)')
  })
})
