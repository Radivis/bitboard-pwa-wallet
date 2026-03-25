import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/wallet')({
  component: WalletSectionLayout,
})

function WalletSectionLayout() {
  return <Outlet />
}
