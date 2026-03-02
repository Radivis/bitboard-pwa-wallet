import { useQuery, useQueryClient } from '@tanstack/react-query'

export interface AuthCheckResponse {
  authenticated: boolean
  username: string | null
}

export const AUTH_CHECK_QUERY_KEY = ['auth-check'] as const

async function fetchAuthCheck(): Promise<AuthCheckResponse> {
  const response = await fetch('/api/auth/me', { credentials: 'include' })

  if (response.status === 401) {
    return { authenticated: false, username: null }
  }

  if (!response.ok) {
    throw new Error('Failed to check authentication')
  }

  return response.json()
}

export function useAuthCheck() {
  const queryClient = useQueryClient()
  const cachedAuthData = queryClient.getQueryData<AuthCheckResponse>(AUTH_CHECK_QUERY_KEY)

  const { data, isLoading, isError } = useQuery({
    queryKey: AUTH_CHECK_QUERY_KEY,
    queryFn: fetchAuthCheck,
    retry: false,
    initialData: cachedAuthData,
    refetchOnMount: cachedAuthData ? false : true,
    gcTime: 0,
    staleTime: 0,
  })

  return {
    data,
    isLoading,
    isError,
    isAuthenticated: data?.authenticated ?? false,
  }
}
