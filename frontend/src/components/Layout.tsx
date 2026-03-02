import { ReactNode } from 'react'
import { Box, AppBar, Toolbar, Typography, Button } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { useAuthCheck } from '../hooks/useAuthCheck'
import ThemeToggle from './ThemeToggle'

interface LayoutProps {
  children: ReactNode
}

function Layout({ children }: LayoutProps) {
  const { isAuthenticated } = useAuthCheck()

  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: 'background.default',
      }}
    >
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            <Button color="inherit" component={RouterLink} to="/">
              Home
            </Button>
            <Button color="inherit" component={RouterLink} to="/blog">
              Blog
            </Button>
            {isAuthenticated ? (
              <Button color="inherit" component={RouterLink} to="/admin/dashboard">
                Dashboard
              </Button>
              ) : (
              <Button color="inherit" component={RouterLink} to="/login">
                Login
              </Button>
            )}
            {isAuthenticated && (
              <Button color="inherit" component={RouterLink} to="/docs">
                API Docs
              </Button>
            )}
          </Typography>
          <ThemeToggle />
        </Toolbar>
      </AppBar>
      {children}
    </Box>
  )
}

export default Layout