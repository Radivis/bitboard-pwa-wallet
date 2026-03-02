import { Typography, Paper, Box } from '@mui/material'
import { centeredFlex } from '../styles'

function Subscribed() {
  return (
    <Box sx={centeredFlex}>
      <Paper sx={{ p: 4, maxWidth: 600, width: '100%' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Welcome to our newsletter!
        </Typography>
      </Paper>
    </Box>
  )
}

export default Subscribed
