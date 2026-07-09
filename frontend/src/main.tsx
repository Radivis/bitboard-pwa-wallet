import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { registerAppRouter } from '@/lib/shared/app-router'
import { registerNonWalletNavigationHistory } from '@/lib/navigation/register-non-wallet-navigation-history'
import { routeTree } from './routeTree.gen'
import './index.css'
import { ensureE2eArkadeMockControl } from '@/lib/arkade/e2e/e2e-arkade-mock-control'
import { ensureE2eArkadeRegtestControl } from '@/lib/arkade/e2e/e2e-arkade-regtest-control'

ensureE2eArkadeMockControl()
ensureE2eArkadeRegtestControl()

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
})
registerAppRouter(router)
registerNonWalletNavigationHistory(router)

/**
 * E2E (DEV): client-side navigation to `/lab/tx/:txid` without `location.reload`.
 * A full `page.goto` after mempool updates can reload before OPFS-backed lab SQLite
 * finishes flushing, so the tx never appears in post-navigation `__labGetState`.
 */
if (import.meta.env.DEV) {
  (window as unknown as { __e2eNavigateToLabTx?: (txid: string) => Promise<void> }).__e2eNavigateToLabTx =
    async (txid: string) => {
      const id = txid.trim().toLowerCase()
      await router.navigate({ to: '/lab/tx/$txid', params: { txid: id } })
    }

  ;(
    window as unknown as { __e2eNavigateToReceiveArkade?: () => Promise<void> }
  ).__e2eNavigateToReceiveArkade = async () => {
    await router.navigate({ to: '/wallet/receive', search: { mode: 'arkade' } })
  }
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
