import { apiRequest } from './client'

export type BlogPostStatus = 'draft' | 'published'

export interface BlogPost {
  id: string
  title: string
  content: string
  status: BlogPostStatus
  author_username: string
  created_at: string
  updated_at: string
}

export interface NewBlogPost {
  title: string
  content: string
  status: BlogPostStatus
}

export interface UpdateBlogPost {
  title: string
  content: string
  status: BlogPostStatus
}

export interface DeleteResponse {
  is_actual_deletion: boolean
  title: string
}

// Public API functions
export async function fetchPublishedPosts(): Promise<BlogPost[]> {
  return apiRequest<BlogPost[]>('/api/blog/posts', {
    method: 'GET',
  })
}

export async function fetchPost(id: string): Promise<BlogPost> {
  return apiRequest<BlogPost>(`/api/blog/posts/${id}`, {
    method: 'GET',
  })
}

// Admin API functions
export async function fetchAdminPosts(): Promise<BlogPost[]> {
  return apiRequest<BlogPost[]>('/api/admin/blog/posts', {
    method: 'GET',
  })
}

export async function fetchAdminPost(id: string): Promise<BlogPost> {
  return apiRequest<BlogPost>(`/api/admin/blog/posts/${id}`, {
    method: 'GET',
  })
}

export async function createPost(data: NewBlogPost): Promise<BlogPost> {
  return apiRequest<BlogPost>('/api/admin/blog/posts', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updatePost(id: string, data: UpdateBlogPost): Promise<BlogPost> {
  return apiRequest<BlogPost>(`/api/admin/blog/posts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deletePost(id: string): Promise<DeleteResponse> {
  return apiRequest<DeleteResponse>(`/api/admin/blog/posts/${id}`, {
    method: 'DELETE',
  })
}
