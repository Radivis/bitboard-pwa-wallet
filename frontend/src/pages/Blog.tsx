import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  Paper,
} from '@mui/material'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { fetchPublishedPosts } from '../api/blog'
import { MarkdownContent } from '../components/MarkdownContent'
import { BLOG_QUERY_KEYS } from '../constants/queryKeys'
import type { BlogPost } from '../api/blog'
import { formatDate } from '../utils/dateFormat'

const POSTS_PER_PAGE = 5

function Blog() {
  const { data: allPosts, isLoading, error } = useQuery({
    queryKey: BLOG_QUERY_KEYS.publishedList,
    queryFn: fetchPublishedPosts,
  })

  const [displayedPosts, setDisplayedPosts] = useState<BlogPost[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const observerTarget = useRef<HTMLDivElement>(null)

  // Initialize displayed posts when data loads
  useEffect(() => {
    if (allPosts && allPosts.length > 0) {
      const initialPosts = allPosts.slice(0, POSTS_PER_PAGE)
      setDisplayedPosts(initialPosts)
      setHasMore(allPosts.length > POSTS_PER_PAGE)
    }
  }, [allPosts])

  // Load more posts
  const loadMore = useCallback(() => {
    if (!allPosts || !hasMore) return

    const nextPage = page + 1
    const startIndex = page * POSTS_PER_PAGE
    const endIndex = nextPage * POSTS_PER_PAGE
    const newPosts = allPosts.slice(startIndex, endIndex)

    if (newPosts.length > 0) {
      setDisplayedPosts((prev) => [...prev, ...newPosts])
      setPage(nextPage)
      setHasMore(endIndex < allPosts.length)
    }
  }, [allPosts, hasMore, page])

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [loadMore, hasMore, isLoading])

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

  if (allPosts && allPosts.length === 0) {
    return (
      <Box>
        <Typography variant="h3" component="h1" gutterBottom sx={{ mb: 4 }}>
          Blog
        </Typography>
        <Alert severity="info">No blog posts available yet.</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: '800px', mx: 'auto' }}>
      <Typography variant="h3" component="h1" gutterBottom sx={{ mb: 4 }}>
        Blog
      </Typography>

      {displayedPosts.map((post, index) => (
        <Box key={post.id}>
          <Paper sx={{ p: 4, mb: 4 }}>
            <Typography variant="h4" component="h2" gutterBottom>
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

          {index < displayedPosts.length - 1 && <Divider sx={{ my: 4 }} />}
        </Box>
      ))}

      {/* Infinite scroll trigger */}
      <Box
        ref={observerTarget}
        sx={{
          height: '20px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          my: 4,
        }}
      >
        {hasMore && <CircularProgress size={30} />}
      </Box>
    </Box>
  )
}

export default Blog
