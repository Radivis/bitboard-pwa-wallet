import { useQuery } from '@tanstack/react-query'
import { useParams, Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
} from '@mui/material'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { ArrowBack } from '@mui/icons-material'
import { fetchPost } from '../api/blog'
import { MarkdownContent } from '../components/MarkdownContent'
import { BLOG_QUERY_KEYS } from '../constants/queryKeys'
import { formatDate } from '../utils/dateFormat'

function BlogPost() {
  const { id } = useParams<{ id: string }>()

  const { data: post, isLoading, error } = useQuery({
    queryKey: BLOG_QUERY_KEYS.post(id!),
    queryFn: () => fetchPost(id!),
    enabled: !!id,
  })

  if (isLoading) {
    return <LoadingState />
  }

  if (error) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load blog post'}
      />
    )
  }

  if (!post) {
    return <ErrorState message="Blog post not found" />
  }

  return (
    <Box>
      <Button
        component={RouterLink}
        to="/blog"
        startIcon={<ArrowBack />}
        sx={{ mb: 3 }}
        aria-label="Back to blog list"
      >
        Back to Blog
      </Button>

      <Paper sx={{ p: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          {post.title}
        </Typography>

        <Box sx={{ mb: 3 }}>
          <Chip
            label={`By ${post.author_username}`}
            size="small"
            sx={{ mr: 1 }}
          />
          <Chip
            label={formatDate(post.created_at)}
            size="small"
            variant="outlined"
          />
        </Box>

        <MarkdownContent content={post.content} />
      </Paper>
    </Box>
  )
}

export default BlogPost
