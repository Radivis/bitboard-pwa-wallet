import { Box, Alert } from '@mui/material'

const CENTERED_BOX_SX = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '60vh',
} as const

interface ErrorStateProps {
  message: string
}

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <Box sx={CENTERED_BOX_SX}>
      <Alert severity="error">{message}</Alert>
    </Box>
  )
}
