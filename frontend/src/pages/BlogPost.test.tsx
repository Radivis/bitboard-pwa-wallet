import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '../test-utils/test-utils'
import BlogPost from './BlogPost'
import * as blogApi from '../api/blog'
import type { BlogPost as BlogPostType } from '../api/blog'
import * as ReactRouter from 'react-router-dom'

// Mock the blog API
vi.mock('../api/blog', () => ({
  fetchPost: vi.fn(),
}))

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(),
    Link: ({ children, to, ...props }: any) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

const mockPost: BlogPostType = {
  id: '123',
  title: 'Test Blog Post',
  content: '# Main Heading\n\nThis is a **bold** text with a [link](https://example.com).\n\n## Subheading\n\n- List item 1\n- List item 2\n\n```javascript\nconst test = "code";\n```\n\n> This is a blockquote',
  status: 'published',
  author_username: 'testuser',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
}

describe('BlogPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock for useParams
    vi.mocked(ReactRouter.useParams).mockReturnValue({ id: '123' })
  })

  it('renders loading state while fetching post', () => {
    vi.mocked(blogApi.fetchPost).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    render(<BlogPost />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('displays error message when API fails', async () => {
    const errorMessage = 'Failed to load blog post'
    vi.mocked(blogApi.fetchPost).mockRejectedValue(new Error(errorMessage))

    render(<BlogPost />)

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument()
    })
  })

  it('shows "Blog post not found" when post does not exist', async () => {
    vi.mocked(blogApi.fetchPost).mockResolvedValue(null as any)

    render(<BlogPost />)

    await waitFor(() => {
      expect(screen.getByText('Blog post not found')).toBeInTheDocument()
    })
  })

  it('renders post title, author, date, and content', async () => {
    vi.mocked(blogApi.fetchPost).mockResolvedValue(mockPost)

    render(<BlogPost />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Blog Post', level: 1 })).toBeInTheDocument()
      expect(screen.getByText('By testuser')).toBeInTheDocument()
      expect(screen.getByText(/January 15, 2024/)).toBeInTheDocument()
    })
  })

  it('formats markdown content correctly - headings', async () => {
    vi.mocked(blogApi.fetchPost).mockResolvedValue(mockPost)

    render(<BlogPost />)

    await waitFor(() => {
      expect(screen.getByText('Main Heading')).toBeInTheDocument()
      expect(screen.getByText('Subheading')).toBeInTheDocument()
    })
  })

  it('formats markdown content correctly - lists', async () => {
    vi.mocked(blogApi.fetchPost).mockResolvedValue(mockPost)

    render(<BlogPost />)

    await waitFor(() => {
      expect(screen.getByText('List item 1')).toBeInTheDocument()
      expect(screen.getByText('List item 2')).toBeInTheDocument()
    })
  })

  it('formats markdown content correctly - code blocks', async () => {
    vi.mocked(blogApi.fetchPost).mockResolvedValue(mockPost)

    render(<BlogPost />)

    await waitFor(() => {
      expect(screen.getByText(/const test/)).toBeInTheDocument()
    })
  })

  it('formats markdown content correctly - blockquotes', async () => {
    vi.mocked(blogApi.fetchPost).mockResolvedValue(mockPost)

    render(<BlogPost />)

    await waitFor(() => {
      expect(screen.getByText('This is a blockquote')).toBeInTheDocument()
    })
  })

  it('formats markdown content correctly - bold text', async () => {
    vi.mocked(blogApi.fetchPost).mockResolvedValue(mockPost)

    render(<BlogPost />)

    await waitFor(() => {
      expect(screen.getByText('bold')).toBeInTheDocument()
    })
  })

  it('formats markdown content correctly - links', async () => {
    vi.mocked(blogApi.fetchPost).mockResolvedValue(mockPost)

    render(<BlogPost />)

    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'link' })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', 'https://example.com')
    })
  })

  it('formats markdown content correctly - images', async () => {
    const postWithImage: BlogPostType = {
      ...mockPost,
      content: '![Alt text](https://example.com/image.png)',
    }

    vi.mocked(blogApi.fetchPost).mockResolvedValue(postWithImage)

    render(<BlogPost />)

    await waitFor(() => {
      const image = screen.getByRole('img', { name: 'Alt text' })
      expect(image).toBeInTheDocument()
      expect(image).toHaveAttribute('src', 'https://example.com/image.png')
    })
  })

  it('formats markdown content correctly - tables', async () => {
    const postWithTable: BlogPostType = {
      ...mockPost,
      content: '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |',
    }

    vi.mocked(blogApi.fetchPost).mockResolvedValue(postWithTable)

    render(<BlogPost />)

    await waitFor(() => {
      expect(screen.getByText('Header 1')).toBeInTheDocument()
      expect(screen.getByText('Header 2')).toBeInTheDocument()
      expect(screen.getByText('Cell 1')).toBeInTheDocument()
      expect(screen.getByText('Cell 2')).toBeInTheDocument()
    })
  })

  it('"Back to Blog" button navigates to /blog', async () => {
    vi.mocked(blogApi.fetchPost).mockResolvedValue(mockPost)

    render(<BlogPost />)

    await waitFor(() => {
      const backButton = screen.getByRole('link', { name: /Back to blog/i })
      expect(backButton).toBeInTheDocument()
      expect(backButton).toHaveAttribute('href', '/blog')
    })
  })

  it('uses correct post ID from URL params', async () => {
    const postId = 'custom-id-456'
    vi.mocked(ReactRouter.useParams).mockReturnValue({ id: postId })
    vi.mocked(blogApi.fetchPost).mockResolvedValue(mockPost)

    render(<BlogPost />)

    await waitFor(() => {
      expect(blogApi.fetchPost).toHaveBeenCalledWith(postId)
    })
  })

  it('formats dates correctly', async () => {
    const postWithDate: BlogPostType = {
      ...mockPost,
      created_at: '2024-12-25T08:30:00Z',
    }

    vi.mocked(blogApi.fetchPost).mockResolvedValue(postWithDate)

    render(<BlogPost />)

    await waitFor(() => {
      expect(screen.getByText(/December 25, 2024/)).toBeInTheDocument()
    })
  })

  it('does not fetch post when id is not provided', () => {
    vi.mocked(ReactRouter.useParams).mockReturnValue({})
    vi.mocked(blogApi.fetchPost).mockResolvedValue(mockPost)

    render(<BlogPost />)

    expect(blogApi.fetchPost).not.toHaveBeenCalled()
  })
})
