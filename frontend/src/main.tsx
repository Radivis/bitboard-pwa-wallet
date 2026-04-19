import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { registerAppRouter } from '@/lib/app-router'
import { routeTree } from './routeTree.gen'
import './index.css'

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
})
registerAppRouter(router)

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
