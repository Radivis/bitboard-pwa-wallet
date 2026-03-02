import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../test-utils/test-utils'
import AdminBlogEdit from './AdminBlogEdit'
import * as blogApi from '../api/blog'
import type { BlogPost } from '../api/blog'
import * as ReactRouter from 'react-router-dom'

// Mock the blog API
vi.mock('../api/blog', () => ({
  fetchAdminPost: vi.fn(),
  createPost: vi.fn(),
  updatePost: vi.fn(),
}))

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(),
    useNavigate: vi.fn(() => mockNavigate),
  }
})

// Mock SimpleMDE - simplified mock that doesn't interact with editor internals
// Real editor interactions are tested in e2e tests
vi.mock('react-simplemde-editor', () => ({
  default: ({ value, onChange }: any) => (
    <textarea
      data-testid="simplemde-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Content"
    />
  ),
}))

const mockPost: BlogPost = {
  id: '123',
  title: 'Existing Post',
  content: '# Existing Content',
  status: 'draft',
  author_username: 'admin',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
}

describe('AdminBlogEdit - Create Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    vi.mocked(ReactRouter.useParams).mockReturnValue({ id: 'new' })
  })

  it('renders "Create New Blog Post" title', () => {
    render(<AdminBlogEdit />)

    expect(screen.getByRole('heading', { name: 'Create New Blog Post', level: 1 })).toBeInTheDocument()
  })

  it('has save and cancel buttons', () => {
    render(<AdminBlogEdit />)

    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
  })

  it('cancel button navigates to /admin/blog', async () => {
    const user = userEvent.setup()
    render(<AdminBlogEdit />)

    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    await user.click(cancelButton)

    expect(mockNavigate).toHaveBeenCalledWith('/admin/blog')
  })
})

describe('AdminBlogEdit - Edit Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    vi.mocked(ReactRouter.useParams).mockReturnValue({ id: '123' })
  })

  it('renders "Edit Blog Post" title', async () => {
    vi.mocked(blogApi.fetchAdminPost).mockResolvedValue(mockPost)

    render(<AdminBlogEdit />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit Blog Post', level: 1 })).toBeInTheDocument()
    })
  })

  it('shows loading state while fetching post', () => {
    vi.mocked(blogApi.fetchAdminPost).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    render(<AdminBlogEdit />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('displays error when post fetch fails', async () => {
    const errorMessage = 'Failed to load blog post'
    vi.mocked(blogApi.fetchAdminPost).mockRejectedValue(new Error(errorMessage))

    render(<AdminBlogEdit />)

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument()
    })
  })

  it('fetches post data on mount', async () => {
    vi.mocked(blogApi.fetchAdminPost).mockResolvedValue(mockPost)

    render(<AdminBlogEdit />)

    await waitFor(() => {
      expect(blogApi.fetchAdminPost).toHaveBeenCalledWith('123')
    })
  })

  it('calls updatePost API when saving', async () => {
    vi.mocked(blogApi.fetchAdminPost).mockResolvedValue(mockPost)
    vi.mocked(blogApi.updatePost).mockResolvedValue(mockPost)

    render(<AdminBlogEdit />)

    // Wait for form to fully load (save button appears)
    const saveButton = await screen.findByRole('button', { name: /Save/i })
    await saveButton.click()

    await waitFor(() => {
      expect(blogApi.updatePost).toHaveBeenCalledWith('123', expect.any(Object))
    })
  })

  it('navigates to admin blog list after successful save', async () => {
    vi.mocked(blogApi.fetchAdminPost).mockResolvedValue(mockPost)
    vi.mocked(blogApi.updatePost).mockResolvedValue(mockPost)

    render(<AdminBlogEdit />)

    // Wait for form to fully load
    const saveButton = await screen.findByRole('button', { name: /Save/i })
    await saveButton.click()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin/blog')
    })
  })

  it('displays error when save fails', async () => {
    const errorMessage = 'Failed to save blog post'
    vi.mocked(blogApi.fetchAdminPost).mockResolvedValue(mockPost)
    vi.mocked(blogApi.updatePost).mockRejectedValue(new Error(errorMessage))

    render(<AdminBlogEdit />)

    // Wait for form to fully load
    const saveButton = await screen.findByRole('button', { name: /Save/i })
    await saveButton.click()

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument()
    })
  })
})
