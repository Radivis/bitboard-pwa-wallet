export const BLOG_QUERY_KEYS = {
  adminList: ['admin-blog-posts'] as const,
  adminPost: (id: string) => ['admin-blog-post', id] as const,
  publishedList: ['blog-posts'] as const,
  post: (id: string) => ['blog-post', id] as const,
} as const
