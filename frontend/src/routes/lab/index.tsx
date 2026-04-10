import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/lab/')({
  // TanStack Router needs a route module for `/lab/`; we send users straight to `/lab/blocks` so
  // the lab area has one canonical landing (blocks) without a duplicate index UI or two URLs.
  beforeLoad: () => {
    throw redirect({ to: '/lab/blocks' })
  },
  component: LabIndexRedirect,
})

/** Never rendered: `beforeLoad` always redirects to `/lab/blocks`. */
function LabIndexRedirect() {
  return null
}
