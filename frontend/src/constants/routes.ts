export const ROUTES = {
  subscribed: '/subscribed',
  adminBlog: '/admin/blog',
  adminBlogNew: '/admin/blog/new',
  adminBlogEditPath: '/admin/blog/:id/edit',
  adminBlogEdit: (id: string) => `/admin/blog/${id}/edit`,
  unsubscribe: '/subscriptions/unsubscribe',
} as const
