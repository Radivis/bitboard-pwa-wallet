import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AUTH_CHECK_QUERY_KEY } from '../hooks/useAuthCheck'
import {
  Paper,
  Typography,
  Button,
  List,
  ListItem,
  ListItemButton,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material'
import { apiRequest } from '../api/client'
import { ROUTES } from '../constants/routes'

interface AuthCheckResponse {
  authenticated: boolean
  username: string | null
}

function AdminDashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const dashboardQuery = useQuery({
    queryKey: ['dashboard-auth'],
    queryFn: async () => {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      })

      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized')
      }

      if (!response.ok) {
        throw new Error('Failed to load dashboard')
      }

      const data: AuthCheckResponse = await response.json()
      if (!data.authenticated || !data.username) {
        throw new Error('Unauthorized')
      }
      return { username: data.username }
    },
    retry: false,
    // Disable caching for session checks
    gcTime: 0,
    staleTime: 0,
  })

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/admin/logout', {
        method: 'POST',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_CHECK_QUERY_KEY })
      navigate('/login')
    },
    onError: () => {
      // Even if logout fails, redirect to login
      queryClient.invalidateQueries({ queryKey: AUTH_CHECK_QUERY_KEY })
      console.warn('Logout request failed, but redirecting to login page anyway')
      navigate('/login')
    },
  })

  const handleLogout = () => {
    logoutMutation.mutate()
  }

  if (dashboardQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (dashboardQuery.isError) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Alert severity="error">
          {dashboardQuery.error instanceof Error
            ? dashboardQuery.error.message
            : 'Failed to load dashboard'}
        </Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Paper sx={{ p: 4, maxWidth: 600, width: '100%' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Welcome {dashboardQuery.data?.username}!
        </Typography>
        <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
          Available actions:
        </Typography>
        <List>
          <ListItem disablePadding>
            <ListItemButton component={Link} to={ROUTES.adminBlog} aria-label="Manage blog">
              Manage blog
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/admin/password" aria-label="Change password">
              Change password
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/admin/newsletters" aria-label="Send newsletter">
              Send a newsletter
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <Button
              variant="contained"
              color="primary"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              sx={{ mt: 2 }}
              aria-label="Logout"
            >
              {logoutMutation.isPending ? <CircularProgress size={24} /> : 'Logout'}
            </Button>
          </ListItem>
        </List>
      </Paper>
    </Box>
  )
}

export default AdminDashboard
