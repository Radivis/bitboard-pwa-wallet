import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render, createTestQueryClient } from '../test-utils/test-utils'
import AdminBlogList from './AdminBlogList'
import * as blogApi from '../api/blog'
import type { BlogPost } from '../api/blog'
// Mock the blog API
vi.mock('../api/blog', () => ({
  fetchAdminPosts: vi.fn(),
  deletePost: vi.fn(),
}))

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    Link: ({ children, to, ...props }: any) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

const mockPosts: BlogPost[] = [
  {
    id: '1',
    title: 'Published Post',
    content: 'Content 1',
    status: 'published',
    author_username: 'admin',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-16T11:00:00Z',
  },
  {
    id: '2',
    title: 'Draft Post',
    content: 'Content 2',
    status: 'draft',
    author_username: 'testuser',
    created_at: '2024-01-17T12:00:00Z',
    updated_at: '2024-01-17T12:00:00Z',
  },
]

describe('AdminBlogList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state while fetching posts', () => {
    vi.mocked(blogApi.fetchAdminPosts).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    render(<AdminBlogList />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('displays error message when API fails', async () => {
    const errorMessage = 'Failed to load blog posts'
    vi.mocked(blogApi.fetchAdminPosts).mockRejectedValue(new Error(errorMessage))

    render(<AdminBlogList />)

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument()
    })
  })

  it('shows "No blog posts yet" message when list is empty', async () => {
    vi.mocked(blogApi.fetchAdminPosts).mockResolvedValue([])

    render(<AdminBlogList />)

    await waitFor(() => {
      expect(screen.getByText(/No blog posts yet/i)).toBeInTheDocument()
    })
  })

  it('renders table with correct columns', async () => {
    vi.mocked(blogApi.fetchAdminPosts).mockResolvedValue(mockPosts)

    render(<AdminBlogList />)

    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: 'Title' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Author' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Created' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Updated' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument()
    })
  })

  it('displays all posts with correct data', async () => {
    vi.mocked(blogApi.fetchAdminPosts).mockResolvedValue(mockPosts)

    render(<AdminBlogList />)

    await waitFor(() => {
      expect(screen.getByText('Published Post')).toBeInTheDocument()
      expect(screen.getByText('Draft Post')).toBeInTheDocument()
      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })
  })

  it('shows status chip as "success" for published, "default" for draft', async () => {
    vi.mocked(blogApi.fetchAdminPosts).mockResolvedValue(mockPosts)

    render(<AdminBlogList />)

    await waitFor(() => {
      const publishedChip = screen.getByText('published')
      const draftChip = screen.getByText('draft')
      
      expect(publishedChip).toBeInTheDocument()
      expect(draftChip).toBeInTheDocument()
    })
  })

  it('formats dates correctly', async () => {
    vi.mocked(blogApi.fetchAdminPosts).mockResolvedValue(mockPosts)

    render(<AdminBlogList />)

    await waitFor(() => {
      expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument()
      expect(screen.getByText(/Jan 16, 2024/)).toBeInTheDocument()
      // Jan 17, 2024 appears twice (created and updated for post 2)
      const jan17Dates = screen.getAllByText(/Jan 17, 2024/)
      expect(jan17Dates).toHaveLength(2)
    })
  })

  it('"New Post" button navigates to /admin/blog/new', async () => {
    vi.mocked(blogApi.fetchAdminPosts).mockResolvedValue(mockPosts)

    render(<AdminBlogList />)

    await waitFor(() => {
      // Button has aria-label="Create new blog post"
      const newPostButton = screen.getByRole('link', { name: /Create new blog post/i })
      expect(newPostButton).toBeInTheDocument()
      expect(newPostButton).toHaveAttribute('href', '/admin/blog/new')
    })
  })

  it('edit button navigates to correct edit page', async () => {
    vi.mocked(blogApi.fetchAdminPosts).mockResolvedValue(mockPosts)

    render(<AdminBlogList />)

    await waitFor(() => {
      const editButtons = screen.getAllByLabelText(/Edit/)
      expect(editButtons[0]).toHaveAttribute('href', '/admin/blog/1/edit')
      expect(editButtons[1]).toHaveAttribute('href', '/admin/blog/2/edit')
    })
  })

  it('delete button opens confirmation dialog', async () => {
    const user = userEvent.setup()
    vi.mocked(blogApi.fetchAdminPosts).mockResolvedValue(mockPosts)

    render(<AdminBlogList />)

    await waitFor(() => {
      expect(screen.getByText('Published Post')).toBeInTheDocument()
    })

    const deleteButton = screen.getByLabelText('Delete Published Post')
    await user.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Confirm Delete')).toBeInTheDocument()
    })
  })

  it('confirmation dialog shows post title', async () => {
    const user = userEvent.setup()
    vi.mocked(blogApi.fetchAdminPosts).mockResolvedValue(mockPosts)

    render(<AdminBlogList />)

    await waitFor(() => {
      expect(screen.getByText('Published Post')).toBeInTheDocument()
    })

    const deleteButton = screen.getByLabelText('Delete Published Post')
    await user.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to delete the post "Published Post"/)).toBeInTheDocument()
    })
  })

  it('clicking "Cancel" in dialog closes it without deleting', async () => {
    const user = userEvent.setup()
    vi.mocked(blogApi.fetchAdminPosts).mockResolvedValue(mockPosts)
    vi.mocked(blogApi.deletePost).mockResolvedValue({ is_actual_deletion: true, title: 'Test Post' })

    render(<AdminBlogList />)

    await waitFor(() => {
      expect(screen.getByText('Published Post')).toBeInTheDocument()
    })

    const deleteButton = screen.getByLabelText('Delete Published Post')
    await user.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    await user.click(cancelButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // deletePost should not have been called
    expect(blogApi.deletePost).not.toHaveBeenCalled()
  })

  it('clicking "Delete" in dialog calls deletePost API', async () => {
    const user = userEvent.setup()
    const queryClient = createTestQueryClient()
    
    vi.mocked(blogApi.fetchAdminPosts).mockResolvedValue(mockPosts)
    vi.mocked(blogApi.deletePost).mockResolvedValue({ is_actual_deletion: true, title: 'Test Post' })

    render(<AdminBlogList />, { queryClient })

    await waitFor(() => {
      expect(screen.getByText('Published Post')).toBeInTheDocument()
    })

    const deleteButton = screen.getByLabelText('Delete Published Post')
    await user.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    const deleteConfirmButton = screen.getByRole('button', { name: 'Delete' })
    await user.click(deleteConfirmButton)

    await waitFor(() => {
      // React Query passes mutation context as second arg, we just check the first arg (post ID)
      expect(blogApi.deletePost).toHaveBeenCalled()
      const callArgs = vi.mocked(blogApi.deletePost).mock.calls[0]
      expect(callArgs[0]).toBe('1')
    }, { timeout: 3000 })
  })

  it('shows loading state in delete button during deletion', async () => {
    const user = userEvent.setup()
    vi.mocked(blogApi.fetchAdminPosts).mockResolvedValue(mockPosts)
    vi.mocked(blogApi.deletePost).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ is_actual_deletion: true, title: 'Published Post' }), 1000))
    )

    render(<AdminBlogList />)

    await waitFor(() => {
      expect(screen.getByText('Published Post')).toBeInTheDocument()
    })

    const deleteButton = screen.getByLabelText('Delete Published Post')
    await user.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    const deleteConfirmButton = screen.getByRole('button', { name: 'Delete' })
    await user.click(deleteConfirmButton)

    // Check for loading state (progressbar in button)
    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      const progressBar = within(dialog).getByRole('progressbar')
      expect(progressBar).toBeInTheDocument()
    })
  })

  it('refreshes list after successful deletion', async () => {
    const user = userEvent.setup()
    const queryClient = createTestQueryClient()

    // First call returns both posts, second call returns only one post
    vi.mocked(blogApi.fetchAdminPosts)
      .mockResolvedValueOnce(mockPosts)
      .mockResolvedValueOnce([mockPosts[1]])
    
    vi.mocked(blogApi.deletePost).mockResolvedValue({ is_actual_deletion: true, title: 'Test Post' })

    render(<AdminBlogList />, { queryClient })

    await waitFor(() => {
      expect(screen.getByText('Published Post')).toBeInTheDocument()
      expect(screen.getByText('Draft Post')).toBeInTheDocument()
    })

    const deleteButton = screen.getByLabelText('Delete Published Post')
    await user.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    const deleteConfirmButton = screen.getByRole('button', { name: 'Delete' })
    await user.click(deleteConfirmButton)

    // Wait for deletion to complete and list to refresh
    await waitFor(() => {
      expect(screen.queryByText('Published Post')).not.toBeInTheDocument()
    })

    // Draft post should still be there
    expect(screen.getByText('Draft Post')).toBeInTheDocument()
  })

  it('renders "Manage Blog Posts" title', async () => {
    vi.mocked(blogApi.fetchAdminPosts).mockResolvedValue(mockPosts)

    render(<AdminBlogList />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Manage Blog Posts', level: 1 })).toBeInTheDocument()
    })
  })
})
