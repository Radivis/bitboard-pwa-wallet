import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/guides/how-to-get-bitcoin')({
  component: HowToGetBitcoinLayout,
})

function HowToGetBitcoinLayout() {
  return <Outlet />
}
