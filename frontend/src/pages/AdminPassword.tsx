import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
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

function AdminPassword() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordCheck, setNewPasswordCheck] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const changePasswordMutation = useMutation({
    mutationFn: async (data: {
      current_password: string
      new_password: string
      new_password_check: string
    }) => {
      return apiRequest('/api/admin/password', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },
    onSuccess: () => {
      // Reset form after successful submission
      setCurrentPassword('')
      setNewPassword('')
      setNewPasswordCheck('')
    },
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    // Client-side validation
    if (newPassword !== newPasswordCheck) {
      setValidationError('You entered two different new passwords - the field values must match.')
      return
    }

    const passwordWithoutSpaces = newPassword.replace(/\s/g, '')
    if (passwordWithoutSpaces.length < 12) {
      setValidationError('The new password must have at least 12 characters besides spaces.')
      return
    }

    if (newPassword.length > 128) {
      setValidationError('The new password must not have more than 128 characters.')
      return
    }

    changePasswordMutation.mutate({
      current_password: currentPassword,
      new_password: newPassword,
      new_password_check: newPasswordCheck,
    })
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Paper sx={{ p: 4, maxWidth: 500, width: '100%' }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Change Password
        </Typography>
        {(validationError || changePasswordMutation.isError) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {validationError ? validationError :
              (changePasswordMutation.error instanceof Error
                ? changePasswordMutation.error.message
                : 'Failed to change password')}
          </Alert>
        )}
        {changePasswordMutation.isSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Your password has been changed.
          </Alert>
        )}
        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Current password"
            type="password"
            placeholder="Enter current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            margin="normal"
            required
            autoComplete="current-password"
            inputProps={{ 'aria-label': 'Current password' }}
          />
          <TextField
            fullWidth
            label="New password"
            type="password"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            margin="normal"
            required
            autoComplete="new-password"
            inputProps={{ 'aria-label': 'New password' }}
          />
          <TextField
            fullWidth
            label="Confirm new password"
            type="password"
            placeholder="Type the new password again"
            value={newPasswordCheck}
            onChange={(e) => setNewPasswordCheck(e.target.value)}
            margin="normal"
            required
            autoComplete="new-password"
            inputProps={{ 'aria-label': 'Confirm new password' }}
          />
          <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={changePasswordMutation.isPending}
              aria-label="Change password"
            >
              {changePasswordMutation.isPending ? <CircularProgress size={24} /> : 'Change password'}
            </Button>
            <Button
              component={Link}
              to="/admin/dashboard"
              variant="outlined"
              aria-label="Back to dashboard"
            >
              ← Back
            </Button>
          </Box>
        </form>
      </Paper>
    </Box>
  )
}

export default AdminPassword
