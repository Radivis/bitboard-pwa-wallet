import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { Edit, Delete, Add } from '@mui/icons-material'
import { useState } from 'react'
import { fetchAdminPosts, deletePost } from '../api/blog'
import { formatDate } from '../utils/dateFormat'
import { ROUTES } from '../constants/routes'
import { BLOG_QUERY_KEYS } from '../constants/queryKeys'

function AdminBlogList() {
  const queryClient = useQueryClient()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [postToDelete, setPostToDelete] = useState<{ id: string; title: string } | null>(null)

  const { data: posts, isLoading, error } = useQuery({
    queryKey: BLOG_QUERY_KEYS.adminList,
    queryFn: fetchAdminPosts,
  })

  const deleteMutation = useMutation({
    mutationFn: deletePost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BLOG_QUERY_KEYS.adminList })
      setDeleteDialogOpen(false)
      setPostToDelete(null)
    },
  })

  const handleDeleteClick = (id: string, title: string) => {
    setPostToDelete({ id, title })
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = () => {
    if (postToDelete) {
      deleteMutation.mutate(postToDelete.id)
    }
  }

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false)
    setPostToDelete(null)
  }

  if (isLoading) {
    return <LoadingState />
  }

  if (error) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load blog posts'}
      />
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Manage Blog Posts
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          component={RouterLink}
          to={ROUTES.adminBlogNew}
          aria-label="Create new blog post"
        >
          New Post
        </Button>
      </Box>

      {posts && posts.length === 0 && (
        <Alert severity="info">No blog posts yet. Create your first post!</Alert>
      )}

      {posts && posts.length > 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Author</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Updated</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {posts.map((post) => (
                <TableRow key={post.id} hover>
                  <TableCell>{post.title}</TableCell>
                  <TableCell>{post.author_username}</TableCell>
                  <TableCell>
                    <Chip
                      label={post.status}
                      color={post.status === 'published' ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{formatDate(post.created_at, { month: 'short' })}</TableCell>
                  <TableCell>{formatDate(post.updated_at, { month: 'short' })}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      component={RouterLink}
                      to={ROUTES.adminBlogEdit(post.id)}
                      aria-label={`Edit ${post.title}`}
                      color="primary"
                    >
                      <Edit />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteClick(post.id, post.title)}
                      aria-label={`Delete ${post.title}`}
                      color="error"
                    >
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
      >
        <DialogTitle id="delete-dialog-title">Confirm Delete</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the post "{postToDelete?.title}"? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleteMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            disabled={deleteMutation.isPending}
            autoFocus
          >
            {deleteMutation.isPending ? <CircularProgress size={24} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default AdminBlogList
