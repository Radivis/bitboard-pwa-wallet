import { useState, useCallback } from 'react'
import { toast } from 'sonner'

export function useAsyncOperation<T>() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = useCallback(
    async (operation: () => Promise<T>): Promise<T | null> => {
      setLoading(true)
      setError(null)
      try {
        const result = await operation()
        return result
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'An unknown error occurred'
        setError(message)
        toast.error(message)
        return null
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  return { loading, error, execute }
}
