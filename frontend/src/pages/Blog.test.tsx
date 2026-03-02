import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '../test-utils/test-utils'
import Blog from './Blog'
import * as blogApi from '../api/blog'
import type { BlogPost } from '../api/blog'

// Mock the blog API
vi.mock('../api/blog', () => ({
  fetchPublishedPosts: vi.fn(),
}))

const mockPosts: BlogPost[] = [
  {
    id: '1',
    title: 'First Post',
    content: '# First Post\n\nThis is the first post content.',
    status: 'published',
    author_username: 'testuser',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: '2',
    title: 'Second Post',
    content: '## Second Post\n\nThis is the second post.',
    status: 'published',
    author_username: 'admin',
    created_at: '2024-01-16T11:00:00Z',
    updated_at: '2024-01-16T11:00:00Z',
  },
]

const manyPosts: BlogPost[] = Array.from({ length: 10 }, (_, i) => ({
  id: `${i + 1}`,
  title: `Post ${i + 1}`,
  content: `Content ${i + 1}`,
  status: 'published' as const,
  author_username: 'testuser',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
}))

describe('Blog', () => {
  let observerCallback: IntersectionObserverCallback
  let observerInstance: {
    observe: ReturnType<typeof vi.fn>
    unobserve: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
    
    // Mock IntersectionObserver
    observerInstance = {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }

    globalThis.IntersectionObserver = class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback
        return observerInstance as any
      }
    } as any
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state while fetching posts', () => {
    vi.mocked(blogApi.fetchPublishedPosts).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    render(<Blog />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('displays error message when API fails', async () => {
    const errorMessage = 'Failed to fetch posts'
    vi.mocked(blogApi.fetchPublishedPosts).mockRejectedValue(new Error(errorMessage))

    render(<Blog />)

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument()
    })
  })

  it('shows "No blog posts available yet" when no posts exist', async () => {
    vi.mocked(blogApi.fetchPublishedPosts).mockResolvedValue([])

    render(<Blog />)

    await waitFor(() => {
      expect(screen.getByText('No blog posts available yet.')).toBeInTheDocument()
    })
  })

  it('renders blog posts with author and date information', async () => {
    vi.mocked(blogApi.fetchPublishedPosts).mockResolvedValue(mockPosts)

    render(<Blog />)

    // Check that author chips are rendered
    await waitFor(() => {
      expect(screen.getByText('By testuser')).toBeInTheDocument()
    })

    expect(screen.getByText('By admin')).toBeInTheDocument()

    // Check that dates are formatted
    expect(screen.getByText(/January 15, 2024/)).toBeInTheDocument()
    expect(screen.getByText(/January 16, 2024/)).toBeInTheDocument()
  })

  it('formats dates correctly', async () => {
    const postWithDate: BlogPost = {
      id: '1',
      title: 'Test Post',
      content: 'Content',
      status: 'published',
      author_username: 'testuser',
      created_at: '2024-02-20T14:30:00Z',
      updated_at: '2024-02-20T14:30:00Z',
    }

    vi.mocked(blogApi.fetchPublishedPosts).mockResolvedValue([postWithDate])

    render(<Blog />)

    await waitFor(() => {
      expect(screen.getByText(/February 20, 2024/)).toBeInTheDocument()
    })
  })

  it('renders markdown content properly', async () => {
    const postWithMarkdown: BlogPost = {
      id: '1',
      title: 'Markdown Post',
      content: '# Heading\n\n**Bold text**\n\n- List item',
      status: 'published',
      author_username: 'testuser',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
    }

    vi.mocked(blogApi.fetchPublishedPosts).mockResolvedValue([postWithMarkdown])

    render(<Blog />)

    await waitFor(() => {
      expect(screen.getByText('Heading')).toBeInTheDocument()
      expect(screen.getByText('Bold text')).toBeInTheDocument()
      expect(screen.getByText('List item')).toBeInTheDocument()
    })
  })

  it('implements infinite scroll correctly', async () => {
    vi.mocked(blogApi.fetchPublishedPosts).mockResolvedValue(manyPosts)

    render(<Blog />)

    // Initially, only first 5 posts should be visible
    await waitFor(() => {
      expect(screen.getByText('Post 1')).toBeInTheDocument()
      expect(screen.getByText('Post 5')).toBeInTheDocument()
    })

    // Posts 6-10 should not be visible yet
    expect(screen.queryByText('Post 6')).not.toBeInTheDocument()
    expect(screen.queryByText('Post 10')).not.toBeInTheDocument()
  })

  it('loads more posts when scrolling to bottom', async () => {
    vi.mocked(blogApi.fetchPublishedPosts).mockResolvedValue(manyPosts)

    render(<Blog />)

    // Wait for initial posts
    await waitFor(() => {
      expect(screen.getByText('Post 1')).toBeInTheDocument()
    })

    // Simulate intersection observer triggering (scrolling to bottom)
    const entries: IntersectionObserverEntry[] = [
      {
        isIntersecting: true,
        target: document.createElement('div'),
      } as unknown as IntersectionObserverEntry,
    ]

    if (observerCallback) {
      observerCallback(entries, {} as IntersectionObserver)
    }

    // More posts should now be visible
    await waitFor(() => {
      expect(screen.getByText('Post 6')).toBeInTheDocument()
    })
  })

  it('shows loading indicator during pagination', async () => {
    vi.mocked(blogApi.fetchPublishedPosts).mockResolvedValue(manyPosts)

    render(<Blog />)

    await waitFor(() => {
      expect(screen.getByText('Post 1')).toBeInTheDocument()
    })

    // The loading indicator should be present while there are more posts to load
    const progressBars = screen.getAllByRole('progressbar')
    expect(progressBars.length).toBeGreaterThan(0)
  })

  it('handles intersection observer cleanup', async () => {
    vi.mocked(blogApi.fetchPublishedPosts).mockResolvedValue(mockPosts)

    const { unmount } = render(<Blog />)

    await waitFor(() => {
      // Post title appears multiple times, just check it exists
      expect(screen.getAllByText('First Post').length).toBeGreaterThan(0)
    })

    // Unmount component
    unmount()

    // Verify cleanup was called (either unobserve or disconnect)
    const cleanupCalled = observerInstance.unobserve.mock.calls.length > 0 || 
                         observerInstance.disconnect.mock.calls.length > 0
    expect(cleanupCalled).toBe(true)
  })

  it('renders page title "Blog"', async () => {
    vi.mocked(blogApi.fetchPublishedPosts).mockResolvedValue(mockPosts)

    render(<Blog />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Blog', level: 1 })).toBeInTheDocument()
    })
  })
})
