import { Box } from '@mui/material'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const MARKDOWN_CONTENT_SX = {
  '& p': { mb: 2 },
  '& h1': { mt: 3, mb: 2, fontSize: '2rem' },
  '& h2': { mt: 3, mb: 2, fontSize: '1.75rem' },
  '& h3': { mt: 2, mb: 1.5, fontSize: '1.5rem' },
  '& h4': { mt: 2, mb: 1.5, fontSize: '1.25rem' },
  '& ul, & ol': { mb: 2, pl: 3 },
  '& li': { mb: 0.5 },
  '& pre': {
    backgroundColor: 'action.hover',
    p: 2,
    borderRadius: 1,
    overflowX: 'auto',
  },
  '& code': {
    backgroundColor: 'action.hover',
    px: 0.5,
    py: 0.25,
    borderRadius: 0.5,
    fontFamily: 'monospace',
  },
  '& pre code': {
    backgroundColor: 'transparent',
    p: 0,
  },
  '& blockquote': {
    borderLeft: '4px solid',
    borderColor: 'primary.main',
    pl: 2,
    py: 0.5,
    my: 2,
    fontStyle: 'italic',
  },
  '& a': {
    color: 'primary.main',
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  '& img': {
    maxWidth: '100%',
    height: 'auto',
    borderRadius: 1,
    my: 2,
  },
  '& table': {
    borderCollapse: 'collapse',
    width: '100%',
    my: 2,
  },
  '& th, & td': {
    border: '1px solid',
    borderColor: 'divider',
    p: 1,
    textAlign: 'left',
  },
  '& th': {
    backgroundColor: 'action.hover',
    fontWeight: 'bold',
  },
} as const

interface MarkdownContentProps {
  content: string
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <Box sx={MARKDOWN_CONTENT_SX}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </Box>
  )
}
