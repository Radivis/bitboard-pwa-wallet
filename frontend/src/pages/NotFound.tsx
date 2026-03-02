import { Typography, Paper, Box, Button } from '@mui/material'
import { useNavigate } from 'react-router-dom'

function NotFound() {
  const navigate = useNavigate()

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Paper sx={{ p: 4, maxWidth: 600, width: '100%', textAlign: 'center' }}>
        <Typography variant="h1" component="h1" sx={{ fontSize: '4rem', fontWeight: 'bold', mb: 2 }}>
          404
        </Typography>
        <Typography 
          sx={{ 
            fontSize: '6rem', 
            mb: 2, 
            filter: 'grayscale(100%)', 
            opacity: 0.7 
          }}
          role="img" 
          aria-label="Lost astronaut"
        >
          🧑‍🚀🌌
        </Typography>
        <Typography variant="h4" component="h2" gutterBottom>
          Page Not Found
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 2, mb: 4 }}>
          The page you are looking for does not exist. You're lost in space!
        </Typography>
        <Button
          variant="contained"
          onClick={() => navigate('/')}
          sx={{ mt: 2 }}
        >
          Go to Home
        </Button>
      </Paper>
    </Box>
  )
}

export default NotFound
