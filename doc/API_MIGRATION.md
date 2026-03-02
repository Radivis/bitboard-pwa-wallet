# API Namespace Migration

## Summary

All API endpoints have been migrated to use the `/api` prefix for cleaner separation between API routes and frontend SPA routes.

## Changes

### Backend Routes

All API endpoints now use the `/api` prefix:

- `/login` → `/api/login`
- `/initial_password` → `/api/initial_password`
- `/users/exists` → `/api/users/exists`
- `/auth/me` → `/api/auth/me`
- `/subscriptions` → `/api/subscriptions`
- `/admin/newsletters` → `/api/admin/newsletters`
- `/admin/password` → `/api/admin/password`
- `/admin/logout` → `/api/admin/logout`
- `/admin/blog/posts` → `/api/admin/blog/posts`
- `/blog/posts` → `/api/blog/posts`

### Exceptions

Two routes remain at the root level for specific reasons:

1. `/health_check` - Standard health check endpoint (not part of the API proper)
2. `/subscriptions/confirm` - Legacy route for backwards compatibility with confirmation emails already sent

### Dual Routes

The subscription confirmation endpoint is available at both:
- `/subscriptions/confirm` - Legacy route (backwards compatible for old email links)
- `/api/subscriptions/confirm` - New API route (for consistency)

### OpenAPI Documentation

OpenAPI specification is available at: **`/api/openapi.json`**

**Interactive Swagger UI is available at: [`http://localhost:3000/docs`](http://localhost:3000/docs)**

The Swagger UI is rendered by the React frontend (via `swagger-ui-react`) and dynamically loads the OpenAPI spec from the backend. This provides an interactive interface to explore and test all API endpoints.

Currently documented endpoints (19 total):

**Health**
- `GET /health_check` - Health check

**Authentication**
- `POST /api/login` - User login
- `POST /api/initial_password` - Create initial admin password
- `GET /api/auth/me` - Check authentication status
- `GET /api/users/exists` - Check if users exist

**Subscriptions**
- `POST /api/subscriptions` - Subscribe to newsletter
- `GET /api/subscriptions/confirm` - Confirm subscription

**Blog (Public)**
- `GET /api/blog/posts` - Get all published posts
- `GET /api/blog/posts/{id}` - Get single published post

**Admin**
- `POST /api/admin/logout` - Logout
- `POST /api/admin/password` - Change password
- `POST /api/admin/newsletters` - Publish newsletter

**Admin Blog**
- `GET /api/admin/blog/posts` - Get all posts (any status)
- `GET /api/admin/blog/posts/{id}` - Get single post
- `POST /api/admin/blog/posts` - Create new post
- `PUT /api/admin/blog/posts/{id}` - Update post
- `DELETE /api/admin/blog/posts/{id}` - Delete post

The "API Docs" link is available in the main navigation bar for easy access.

### Frontend Updates

All frontend components and API clients have been updated to use the new `/api` prefix:

-  `frontend/src/pages/Login.tsx`
- `frontend/src/pages/InitialPassword.tsx`
- `frontend/src/pages/AdminDashboard.tsx`
- `frontend/src/pages/AdminNewsletter.tsx`
- `frontend/src/pages/AdminPassword.tsx`
- `frontend/src/api/blog.ts`

### Vite Proxy Configuration

The Vite dev server proxy has been simplified:

```typescript
proxy: {
  '/api': {
    target: backendUrl,
    changeOrigin: true,
  },
  '/health_check': {
    target: backendUrl,
    changeOrigin: true,
  },
}
```

All other routes are served by React Router (SPA).

### Test Updates

- ✅ All 90 backend integration tests updated and passing
- ✅ All 20 E2E Playwright tests updated and passing
- ✅ E2E test fixtures updated to use `/api/initial_password` and `/api/users/exists`

## Migration Benefits

1. **Clear Separation**: API routes are clearly distinguished from frontend routes
2. **Better Routing**: Vite proxy configuration is simpler and more predictable
3. **Consistency**: Standard practice for SPAs with separate backends
4. **Documentation**: OpenAPI spec can document all API endpoints under a single namespace
5. **Future-Proof**: Easy to version the API (e.g., `/api/v1`, `/api/v2`) if needed

## Testing

Run tests to verify the migration:

```bash
# Backend integration tests
cargo nextest run

# E2E tests
cd frontend && npx playwright test
```

All tests should pass.
