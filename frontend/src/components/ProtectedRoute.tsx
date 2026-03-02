import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthCheck } from '../hooks/useAuthCheck'
import { LoadingState } from './LoadingState'
import { ErrorState } from './ErrorState'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useAuthCheck()

  useEffect(() => {
    if (!isLoading && !isError && data && !data.authenticated) {
      navigate('/login')
    }
  }, [data, isLoading, isError, navigate])

  if (isLoading) {
    return <LoadingState />
  }

  if (isError) {
    return <ErrorState message="Failed to verify authentication" />
  }

  if (!data?.authenticated) {
    return null // Will redirect via useEffect
  }

  return <>{children}</>
}
