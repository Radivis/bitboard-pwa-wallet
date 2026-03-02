import { Box, CircularProgress } from '@mui/material'

const CENTERED_BOX_SX = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '60vh',
} as const

export function LoadingState() {
  return (
    <Box sx={CENTERED_BOX_SX}>
      <CircularProgress />
    </Box>
  )
}
