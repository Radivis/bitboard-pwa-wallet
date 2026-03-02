import { Box, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import type { SxProps, Theme } from '@mui/material'

const MESSAGE_BANNER_SX: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  justifyContent: 'center',
}

type MessageBannerProps = {
  message: string
  variant: 'success' | 'error'
}

function MessageBanner({ message, variant }: MessageBannerProps) {
  const color = variant === 'success' ? 'success.main' : 'error.main'
  const Icon = variant === 'success' ? CheckCircleIcon : ErrorIcon
  return (
    <Box sx={{ ...MESSAGE_BANNER_SX, color }}>
      <Icon fontSize="small" />
      <Typography variant="body2">{message}</Typography>
    </Box>
  )
}

export default MessageBanner
