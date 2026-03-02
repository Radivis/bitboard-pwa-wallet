import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTheme } from '../contexts/ThemeContext'

import { Box, Typography, TextField, Button, CircularProgress } from '@mui/material'
import MessageBanner from './MessageBanner'
import { fetchPostJson } from '../utils/api'

// Exported for tests
export const SUBSCRIPTION_FORM_LEGEND = 'Subscribe to the newsletter to receive updates on this project'
export const SUBSCRIPTION_SUCCESS_MESSAGE = 'Please check your email to confirm your subscription.'
const SUBSCRIPTION_FAILED_MESSAGE = 'Subscription failed'

const SUBSCRIPTION_FORM_MAX_WIDTH = 400
const SUBSCRIPTION_FORM_BORDER_RADIUS = 2
const SUBSCRIPTION_FORM_PADDING_X = 3
const SUBSCRIPTION_FORM_PADDING_BOTTOM = 3
const SUBSCRIPTION_FORM_BORDER_WIDTH = '2px solid'
const LOADING_SPINNER_SIZE = 24

function SubscribeForm() {
  const { mode } = useTheme()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')

  const subscriptionBorderColor = mode === 'light' ? 'hsl(0, 0%, 0%)' : 'hsl(0, 0%, 100%)'

  const subscribeMutation = useMutation({
    mutationFn: async (data: { name: string; email: string }) => {
      const response = await fetchPostJson({
        url: '/api/subscriptions',
        bodyObject: data,
      });

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || SUBSCRIPTION_FAILED_MESSAGE)
      }

      return null
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    subscribeMutation.mutate({ name, email })
  }

  const showSuccess = subscribeMutation.isSuccess
  const showError = subscribeMutation.isError
  const errorMessage = subscribeMutation.error instanceof Error
    ? subscribeMutation.error.message
    : SUBSCRIPTION_FAILED_MESSAGE

  return (
    <Box
      component="fieldset"
      sx={{
        border: `${SUBSCRIPTION_FORM_BORDER_WIDTH} ${subscriptionBorderColor}`,
        borderRadius: SUBSCRIPTION_FORM_BORDER_RADIUS,
        px: SUBSCRIPTION_FORM_PADDING_X,
        pb: SUBSCRIPTION_FORM_PADDING_BOTTOM,
        pt: 0,
        mt: 0,
        maxWidth: SUBSCRIPTION_FORM_MAX_WIDTH,
        mx: 'auto',
      }}
    >
      <Typography
        component="legend"
        sx={{
          px: 1,
          fontSize: '0.95rem',
        }}
      >
        {SUBSCRIPTION_FORM_LEGEND}
      </Typography>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <TextField
          fullWidth
          label="Email"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          margin="normal"
          required
          autoComplete="email"
          inputProps={{ 'aria-label': 'Email' }}
        />
        <TextField
          fullWidth
          label="Name"
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          margin="normal"
          required
          autoComplete="name"
          inputProps={{ 'aria-label': 'Name' }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, mb: 2 }}>
          <Button
            type="submit"
            variant="contained"
            disabled={subscribeMutation.isPending}
            aria-label="Subscribe"
          >
            {subscribeMutation.isPending ? (
              <CircularProgress size={LOADING_SPINNER_SIZE} color="inherit" />
            ) : (
              'Subscribe'
            )}
          </Button>
        </Box>
        {showSuccess && (
          <MessageBanner message={SUBSCRIPTION_SUCCESS_MESSAGE} variant="success" />
        )}
        {showError && (
          <MessageBanner message={errorMessage} variant="error" />
        )}
      </Box>
    </Box>
  )
}

export default SubscribeForm
