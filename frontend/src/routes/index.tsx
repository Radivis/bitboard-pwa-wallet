import { useLayoutEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: RootIndexRedirect,
})

/** Sends legacy `/` visits (e.g. PWA start_url) to the wallet dashboard route. */
function RootIndexRedirect() {
  const navigate = useNavigate()
  useLayoutEffect(() => {
    void navigate({ to: '/wallet', replace: true })
  }, [navigate])
  return null
}
