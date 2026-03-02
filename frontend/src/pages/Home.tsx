import {
  Typography,
  Box,
  Container,
} from '@mui/material'
import { useTheme } from '../contexts/ThemeContext'
import { getHomePageGradient } from '../theme'
import { bodyParagraphSx } from '../styles'
import SubscribeForm from '../components/SubscribeForm'


function Home() {
  const { mode } = useTheme()

  const gradientBackground = getHomePageGradient(mode)

  return (
    <Box
      sx={{
        minHeight: '60vh',
        background: gradientBackground,
        display: 'flex',
        alignItems: 'center',
        borderRadius: 2,
        py: 6,
        borderTop: '2px solid',
        borderBottom: '2px solid',
        borderColor: 'primary.main',
      }}
    >
      <Container maxWidth="md">
        <Typography
          variant="h2"
          component="h1"
          gutterBottom
          sx={{
            fontWeight: 600,
            textAlign: 'center',
            mb: 4,
          }}
        >
          zero2prod-axum
        </Typography>

        <Typography variant="body1" sx={{ ...bodyParagraphSx, mb: 2 }}>
          This project evolved from a personal learning project based on the book "From Zero to Production in Rust" by Luca Palmieri. Instead of statically rendered HTML pages, it features a Single Page Application powered by React.
        </Typography>

        <Typography variant="body1" sx={{ ...bodyParagraphSx, mb: 2 }}>
          In addition to acting as mailing list management app, it also features a simple blog.
        </Typography>

        <Typography variant="body1" sx={{ ...bodyParagraphSx, mb: 4 }}>
          This project is fully open source and can be used as template for other projects.
        </Typography>
        <SubscribeForm />
      </Container>
    </Box>
  )
}

export default Home
