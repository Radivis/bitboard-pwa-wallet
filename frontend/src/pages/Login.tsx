import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
} from '@mui/material'
import { useCheckUsersExist } from '../hooks/useCheckUsersExist'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const checking = useCheckUsersExist()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(credentials),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Authentication failed' }))
        throw new Error(error.error || 'Authentication failed')
      }

      return response.json()
    },
    onSuccess: async () => {
      // After successful login, verify authentication and update the query cache
      // This prevents ProtectedRoute from redirecting back to login
      try {
        const authResponse = await fetch('/api/auth/me', {
          credentials: 'include',
        })
        
        if (authResponse.ok) {
          const authData = await authResponse.json()
          // Set the query data so ProtectedRoute knows we're authenticated
          // Note: We set it temporarily, but ProtectedRoute will fetch fresh data
          queryClient.setQueryData(['auth-check'], authData)
          navigate('/admin/dashboard')
        } else {
          // If auth check fails, still try to navigate (might be a timing issue)
          console.warn('Auth check returned non-OK status after login, navigating anyway')
          navigate('/admin/dashboard')
        }
      } catch (error) {
        // If auth check fails, still try to navigate
        console.error('Auth check failed after login:', error)
        navigate('/admin/dashboard')
      }
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    loginMutation.mutate({ username, password })
  }

  if (checking) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Paper sx={{ p: 4, maxWidth: 400, width: '100%' }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Login
        </Typography>
        {loginMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {loginMutation.error instanceof Error ? loginMutation.error.message : 'Authentication failed'}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            fullWidth
            label="Username"
            placeholder="Enter Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            margin="normal"
            required
            autoComplete="username"
            inputProps={{ 'aria-label': 'Username' }}
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            placeholder="Enter Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            margin="normal"
            required
            autoComplete="current-password"
            inputProps={{ 'aria-label': 'Password' }}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={loginMutation.isPending}
            aria-label="Login"
          >
            {loginMutation.isPending ? <CircularProgress size={24} /> : 'Login'}
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}

export default Login
