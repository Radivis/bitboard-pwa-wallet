import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import {
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
} from '@mui/material'
import { apiRequest } from '../api/client'

function InitialPassword() {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const navigate = useNavigate()

  const initialPasswordMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; password_confirmation: string }) => {
      return apiRequest('/api/initial_password', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },
    onSuccess: () => {
      navigate('/login')
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    // Client-side validation
    if (password !== passwordConfirmation) {
      setValidationError('Passwords do not match')
      return
    }

    if (password.replace(/\s/g, '').length < 12) {
      setValidationError('Password must have at least 12 characters (excluding spaces)')
      return
    }

    if (password.length > 128) {
      setValidationError('Password must not exceed 128 characters')
      return
    }

    initialPasswordMutation.mutate({ username, password, password_confirmation: passwordConfirmation })
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Paper sx={{ p: 4, maxWidth: 500, width: '100%' }}>
        <Alert severity="error" sx={{ mb: 3, fontWeight: 'bold' }}>
          ⚠️ WARNING: Store username and password immediately! There is no easy way to reset them if lost!
        </Alert>
        <Typography variant="h5" component="h1" gutterBottom>
          Set Initial Admin Password
        </Typography>
        {(validationError || initialPasswordMutation.isError) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {validationError ||
              (initialPasswordMutation.error instanceof Error
                ? initialPasswordMutation.error.message
                : 'Failed to create admin user')}
          </Alert>
        )}
        <form onSubmit={handleSubmit}>
          <TextField
              fullWidth
              label="Username of admin user"
              placeholder="Enter Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              margin="normal"
              required
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
            autoComplete="new-password"
            inputProps={{ 'aria-label': 'New password' }}
          />
          <TextField
            fullWidth
            label="Confirm Password"
            type="password"
            placeholder="Confirm Password"
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
            margin="normal"
            required
            autoComplete="new-password"
            inputProps={{ 'aria-label': 'Confirm password' }}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={initialPasswordMutation.isPending}
            aria-label="Create account"
          >
            {initialPasswordMutation.isPending ? <CircularProgress size={24} /> : 'Create Admin User'}
          </Button>
        </form>
      </Paper>
    </Box>
  )
}

export default InitialPassword
