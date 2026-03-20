import { QueryClient } from '@tanstack/react-query'

/** Shared QueryClient for root provider, prefetch, and E2E hooks. */
export const appQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
