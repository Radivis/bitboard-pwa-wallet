import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiRequest } from '../api/client'

interface UsersExistResponse {
  users_exist: boolean
}

/**
 * Custom hook to check if any users exist in the database
 * Redirects to /initial-password if no users exist
 * @returns {boolean} checking - Whether the check is still in progress
 */
export function useCheckUsersExist() {
  const [checking, setChecking] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const checkUsersExist = async () => {
      try {
        const response = await apiRequest<UsersExistResponse>('/api/users/exists')
        if (!response.users_exist) {
          navigate('/initial-password')
        }
      } catch (err) {
        // If check fails, allow login attempt anyway
        console.warn('Failed to check if users exist:', err)
      } finally {
        setChecking(false)
      }
    }
    checkUsersExist()
  }, [navigate])

  return checking
}
