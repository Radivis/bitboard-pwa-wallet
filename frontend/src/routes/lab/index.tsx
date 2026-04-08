import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/lab/')({
  beforeLoad: () => {
    throw redirect({ to: '/lab/blocks' })
  },
  component: LabIndexRedirect,
})

/** Never rendered: `beforeLoad` always redirects to `/lab/blocks`. */
function LabIndexRedirect() {
  return null
}
