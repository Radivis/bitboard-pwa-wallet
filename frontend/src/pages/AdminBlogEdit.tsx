import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material'
import { LoadingState } from '../components/LoadingState'
import { ErrorState } from '../components/ErrorState'
import { Save, Cancel, LightMode, DarkMode } from '@mui/icons-material'
import SimpleMDE from 'react-simplemde-editor'
import 'easymde/dist/easymde.min.css'
import {
  fetchAdminPost,
  createPost,
  updatePost,
  NewBlogPost,
  UpdateBlogPost,
  type BlogPostStatus,
} from '../api/blog'
import { useTheme } from '../contexts/ThemeContext'
import { DARK_THEME_EDITOR } from '../theme'
import { ROUTES } from '../constants/routes'
import { BLOG_QUERY_KEYS } from '../constants/queryKeys'
import type EasyMDE from 'easymde'

// Editor theme colors - light mode uses constants; dark mode uses DARK_THEME_EDITOR from theme
const PREVIEW_STATE_CHECK_INTERVAL_MS = 200
const EDITOR_BG_LIGHT = '#fff'
const EDITOR_TEXT_LIGHT = '#000'
const EDITOR_BORDER_LIGHT = 'rgba(0, 0, 0, 0.23)'
const EDITOR_TOOLBAR_BG_LIGHT = '#f9f9f9'
const EDITOR_TOOLBAR_BORDER_LIGHT = '#ddd'
const EDITOR_TOOLBAR_BORDER_DARKER = '#d9d9d9'
const EDITOR_BUTTON_HOVER_LIGHT = '#e0e0e0'
const EDITOR_BUTTON_ACTIVE_LIGHT = '#d0d0d0'
const PREVIEW_BG_LIGHT = '#fafafa'
const PREVIEW_CODE_BG_LIGHT = '#f5f5f5'
const LIGHT_ACCENT_BLUE = '#1976d2'
const PREVIEW_BLOCKQUOTE_BORDER_LIGHT = LIGHT_ACCENT_BLUE
const PREVIEW_BLOCKQUOTE_TEXT_LIGHT = '#666'
const PREVIEW_TABLE_HEADER_LIGHT = '#f0f0f0'
const PREVIEW_LINK_LIGHT = LIGHT_ACCENT_BLUE

function AdminBlogEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { mode: currentTheme } = useTheme()
  const isEditMode = id !== undefined && id !== 'new'

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<BlogPostStatus>('draft')
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>(currentTheme)
  const [isPreviewActive, setIsPreviewActive] = useState(false)
  const editorRef = useRef<EasyMDE | null>(null)

  const { data: post, isLoading, error } = useQuery({
    queryKey: BLOG_QUERY_KEYS.adminPost(id!),
    queryFn: () => fetchAdminPost(id!),
    enabled: isEditMode,
  })

  useEffect(() => {
    if (post) {
      setTitle(post.title)
      setContent(post.content)
      setStatus(post.status)
    }
  }, [post])

  // Update preview theme when current theme changes
  useEffect(() => {
    setPreviewTheme(currentTheme)
  }, [currentTheme])

  const createMutation = useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BLOG_QUERY_KEYS.adminList })
      navigate(ROUTES.adminBlog)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBlogPost }) => updatePost(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BLOG_QUERY_KEYS.adminList })
      queryClient.invalidateQueries({ queryKey: BLOG_QUERY_KEYS.adminPost(id!) })
      navigate(ROUTES.adminBlog)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const postData = {
      title,
      content,
      status,
    }

    if (isEditMode) {
      updateMutation.mutate({ id: id!, data: postData })
    } else {
      createMutation.mutate(postData as NewBlogPost)
    }
  }

  const handleCancel = () => {
    navigate(ROUTES.adminBlog)
  }

  // Monitor preview state changes
  useEffect(() => {
    const checkPreviewState = () => {
      if (editorRef.current) {
        const previewElement = editorRef.current.codemirror.getWrapperElement().parentElement?.querySelector('.editor-preview-active, .editor-preview-active-side')
        setIsPreviewActive(!!previewElement)
      }
    }

    // Check periodically (SimpleMDE doesn't have direct mode change events)
    const interval = setInterval(checkPreviewState, PREVIEW_STATE_CHECK_INTERVAL_MS)
    
    return () => clearInterval(interval)
  }, [])

  const editorOptions = useMemo(
    () => ({
      spellChecker: false,
      placeholder: 'Write your blog post content in Markdown...',
      status: false,
      toolbar: [
        'bold',
        'italic',
        'heading',
        '|',
        'quote',
        'unordered-list',
        'ordered-list',
        '|',
        'link',
        'image',
        '|',
        'preview',
        'side-by-side',
        'fullscreen',
        '|',
        'guide',
      ] as any,
    }),
    []
  )

  const getMdeInstance = (instance: EasyMDE) => {
    editorRef.current = instance
  }

  if (isEditMode && isLoading) {
    return <LoadingState />
  }

  if (isEditMode && error) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load blog post'}
      />
    )
  }

  const mutation = isEditMode ? updateMutation : createMutation
  const isSubmitting = mutation.isPending

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        {isEditMode ? 'Edit Blog Post' : 'Create New Blog Post'}
      </Typography>

      {mutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {mutation.error instanceof Error ? mutation.error.message : 'Failed to save blog post'}
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            required
            margin="normal"
            disabled={isSubmitting}
          />

          <FormControl fullWidth margin="normal" required data-testid="blog-status-select">
            <InputLabel>Status</InputLabel>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as BlogPostStatus)}
              label="Status"
              disabled={isSubmitting}
            >
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="published">Published</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ mt: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2">
                Content (Markdown)
              </Typography>
              {isPreviewActive && (
                <Tooltip title="Preview Theme (toggle to see how your post looks in light/dark mode)">
                  <ToggleButtonGroup
                    value={previewTheme}
                    exclusive
                    onChange={(_, newTheme) => {
                      if (newTheme !== null) {
                        setPreviewTheme(newTheme)
                      }
                    }}
                    size="small"
                    aria-label="preview theme"
                  >
                    <ToggleButton value="light" aria-label="light preview">
                      <LightMode fontSize="small" />
                    </ToggleButton>
                    <ToggleButton value="dark" aria-label="dark preview">
                      <DarkMode fontSize="small" />
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Tooltip>
              )}
            </Box>
            <Box
              className={`editor-wrapper ${currentTheme === 'dark' ? 'dark-editor' : ''} ${previewTheme === 'dark' ? 'dark-preview' : ''}`}
              sx={{
                '& .CodeMirror': {
                  backgroundColor: currentTheme === 'dark' ? DARK_THEME_EDITOR.bg : EDITOR_BG_LIGHT,
                  color: currentTheme === 'dark' ? DARK_THEME_EDITOR.text : EDITOR_TEXT_LIGHT,
                  border: '1px solid',
                  borderColor: currentTheme === 'dark' ? DARK_THEME_EDITOR.border : EDITOR_BORDER_LIGHT,
                },
                '& .CodeMirror-cursor': {
                  borderColor: currentTheme === 'dark' ? DARK_THEME_EDITOR.text : EDITOR_TEXT_LIGHT,
                },
                '& .editor-toolbar': {
                  backgroundColor: currentTheme === 'dark' ? DARK_THEME_EDITOR.toolbar : EDITOR_TOOLBAR_BG_LIGHT,
                  borderColor: currentTheme === 'dark' ? DARK_THEME_EDITOR.border : EDITOR_TOOLBAR_BORDER_LIGHT,
                },
                '& .editor-toolbar button': {
                  color: currentTheme === 'dark' ? DARK_THEME_EDITOR.text : EDITOR_TEXT_LIGHT,
                  '&:hover': {
                    backgroundColor: currentTheme === 'dark' ? DARK_THEME_EDITOR.buttonHover : EDITOR_BUTTON_HOVER_LIGHT,
                  },
                  '&.active': {
                    backgroundColor: currentTheme === 'dark' ? DARK_THEME_EDITOR.buttonActive : EDITOR_BUTTON_ACTIVE_LIGHT,
                  },
                },
                '& .editor-toolbar i.separator': {
                  borderColor: currentTheme === 'dark' ? DARK_THEME_EDITOR.border : EDITOR_TOOLBAR_BORDER_DARKER,
                },
                '& .editor-preview, & .editor-preview-side': {
                  backgroundColor: previewTheme === 'dark' ? DARK_THEME_EDITOR.bg : PREVIEW_BG_LIGHT,
                  color: previewTheme === 'dark' ? DARK_THEME_EDITOR.text : EDITOR_TEXT_LIGHT,
                },
                '& .editor-preview pre, & .editor-preview-side pre': {
                  backgroundColor: previewTheme === 'dark' ? DARK_THEME_EDITOR.paper : PREVIEW_CODE_BG_LIGHT,
                  color: previewTheme === 'dark' ? DARK_THEME_EDITOR.text : EDITOR_TEXT_LIGHT,
                },
                '& .editor-preview code, & .editor-preview-side code': {
                  backgroundColor: previewTheme === 'dark' ? DARK_THEME_EDITOR.paper : PREVIEW_CODE_BG_LIGHT,
                  color: previewTheme === 'dark' ? DARK_THEME_EDITOR.text : EDITOR_TEXT_LIGHT,
                },
                '& .editor-preview blockquote, & .editor-preview-side blockquote': {
                  borderLeftColor: previewTheme === 'dark' ? DARK_THEME_EDITOR.blockquoteBorder : PREVIEW_BLOCKQUOTE_BORDER_LIGHT,
                  color: previewTheme === 'dark' ? DARK_THEME_EDITOR.text : PREVIEW_BLOCKQUOTE_TEXT_LIGHT,
                },
                '& .editor-preview table th, & .editor-preview-side table th': {
                  backgroundColor: previewTheme === 'dark' ? DARK_THEME_EDITOR.toolbar : PREVIEW_TABLE_HEADER_LIGHT,
                },
                '& .editor-preview table td, & .editor-preview table th, & .editor-preview-side table td, & .editor-preview-side table th': {
                  borderColor: previewTheme === 'dark' ? DARK_THEME_EDITOR.border : EDITOR_TOOLBAR_BORDER_LIGHT,
                },
                '& .editor-preview a, & .editor-preview-side a': {
                  color: previewTheme === 'dark' ? DARK_THEME_EDITOR.link : PREVIEW_LINK_LIGHT,
                },
              }}
            >
              <SimpleMDE
                value={content}
                onChange={setContent}
                options={editorOptions}
                getMdeInstance={getMdeInstance}
              />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
            <Button
              type="submit"
              variant="contained"
              startIcon={isSubmitting ? <CircularProgress size={20} /> : <Save />}
              disabled={isSubmitting || !title.trim() || !content.trim()}
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </Button>
            <Button
              variant="outlined"
              startIcon={<Cancel />}
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </Box>
        </form>
      </Paper>
    </Box>
  )
}

export default AdminBlogEdit
