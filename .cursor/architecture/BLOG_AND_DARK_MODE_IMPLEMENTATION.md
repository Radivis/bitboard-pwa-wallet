# Blog and Dark Mode Implementation Summary

This document summarizes the blog functionality and dark mode features that have been added to the zero2prod-axum template.

## Features Implemented

### 1. Dark Mode

#### Theme System
- **Theme Context** (`frontend/src/contexts/ThemeContext.tsx`): Manages theme state (light/dark)
- **Theme Definitions** (`frontend/src/theme/index.ts`): Separate light and dark theme configurations
- **Theme Toggle** (`frontend/src/components/ThemeToggle.tsx`): Icon button to switch between modes
- **Persistence**: Theme preference saved to localStorage
- **System Preference**: Automatically detects and uses system preference on first visit
- **Manual Override**: Users can manually toggle to override system preference

#### Integration
- Theme toggle added to app bar in Layout component
- CssBaseline automatically adapts to theme mode
- All MUI components respond to theme changes

### 2. Blogging Functionality

#### Database
- **Migration** (`migrations/20260205185949_create_blog_posts_table.sql`):
  - `blog_posts` table with fields: id, title, content, status, author_id, created_at, updated_at
  - Status constraint: 'draft' or 'published'
  - Foreign key to users table for author attribution
  - Indexes on status and created_at for performance

#### Backend (Rust/Axum)

**Domain Models** (`src/domain/blog_post.rs`):
- `BlogPost`: Full post with author info
- `BlogPostStatus`: Enum for draft/published
- `NewBlogPost`: For creating posts
- `UpdateBlogPost`: For updating posts

**Database Queries** (`src/routes/blog/queries.rs`):
- `get_published_posts()`: Fetch all published posts with author names
- `get_all_posts()`: Fetch all posts (admin only)
- `get_post_by_id()`: Fetch single post with optional status filter
- `insert_post()`: Create new post
- `update_post()`: Update existing post
- `delete_post()`: Delete post

**Public API Routes** (`src/routes/blog/mod.rs`):
- `GET /api/blog/posts` - List all published posts
- `GET /api/blog/posts/:id` - Get single published post

**Admin API Routes** (`src/routes/admin/blog/mod.rs`):
- `GET /admin/blog/posts` - List all posts (including drafts)
- `GET /admin/blog/posts/:id` - Get single post (any status)
- `POST /admin/blog/posts` - Create new post
- `PUT /admin/blog/posts/:id` - Update post
- `DELETE /admin/blog/posts/:id` - Delete post

#### Frontend (React/TypeScript)

**API Client** (`frontend/src/api/blog.ts`):
- Functions for all public and admin blog operations
- Type-safe interfaces for BlogPost, NewBlogPost, UpdateBlogPost

**Public Pages**:
- **Blog List** (`frontend/src/pages/Blog.tsx`):
  - Displays all published posts with full markdown rendering
  - Infinite scroll implementation (loads 5 posts at a time)
  - Shows title, author, date, and complete post content
  - Posts displayed in reverse chronological order (newest first)
  
- **Blog Post Detail** (`frontend/src/pages/BlogPost.tsx`):
  - Full markdown rendering with react-markdown
  - GitHub Flavored Markdown support (tables, strikethrough, etc.)
  - Styled code blocks, blockquotes, lists, etc.
  - Author and date display
  - Back to blog list button

**Admin Pages**:
- **Admin Blog List** (`frontend/src/pages/AdminBlogList.tsx`):
  - Table view of all posts (drafts + published)
  - Status badges (color-coded)
  - Edit and delete actions
  - Delete confirmation dialog
  - "Create New Post" button
  
- **Admin Blog Editor** (`frontend/src/pages/AdminBlogEdit.tsx`):
  - SimpleMDE markdown editor with live preview
  - Side-by-side preview mode
  - Toolbar: bold, italic, heading, lists, links, images, etc.
  - Title and status (draft/published) fields
  - Handles both create and edit modes
  - Form validation

**Routing Updates**:
- Public routes: `/blog`, `/blog/:id`
- Admin routes (protected): `/admin/blog`, `/admin/blog/:id/edit`, `/admin/blog/new`
- Admin dashboard updated with "Manage blog" link

## Technical Details

### Dependencies Added

**Frontend**:
- `react-markdown`: Render markdown content
- `remark-gfm`: GitHub Flavored Markdown support
- `react-simplemde-editor`: Markdown editor component
- `easymde`: Editor styling and functionality
- `@mui/icons-material`: Material UI icons

**Backend**:
- Chrono `serde` feature enabled for DateTime serialization

### Key Design Decisions

1. **Draft/Published Status**: Posts can be saved as drafts before publishing
2. **Author Attribution**: Posts are linked to the user who created them
3. **Markdown Support**: Content stored as markdown, rendered on frontend
4. **Protected Admin Routes**: All blog management requires authentication
5. **Public Access**: Published posts visible to everyone
6. **Live Preview**: Markdown editor shows preview alongside editing
7. **Theme Persistence**: Dark mode preference survives browser restarts

## File Structure

```
src/
├── domain/
│   └── blog_post.rs              # Domain models
├── routes/
│   ├── blog/
│   │   ├── mod.rs                # Public blog routes
│   │   └── queries.rs            # Database queries
│   └── admin/
│       └── blog/
│           └── mod.rs            # Admin blog routes
migrations/
└── 20260205185949_create_blog_posts_table.sql

frontend/src/
├── api/
│   └── blog.ts                   # Blog API client
├── components/
│   └── ThemeToggle.tsx           # Theme toggle button
├── contexts/
│   └── ThemeContext.tsx          # Theme state management
├── theme/
│   └── index.ts                  # Theme definitions
└── pages/
    ├── Blog.tsx                  # Public blog list
    ├── BlogPost.tsx              # Public post detail
    ├── AdminBlogList.tsx         # Admin blog management
    └── AdminBlogEdit.tsx         # Admin post editor
```

## Usage

### For Content Authors (Admin)

1. Log in to admin panel
2. Click "Manage blog" from admin dashboard
3. Click "New Post" to create a post
4. Enter title, write content in markdown
5. Use preview to check formatting
6. Save as "Draft" to work on later, or "Published" to make it live
7. Edit or delete posts from the blog management page

### For Readers (Public)

1. Navigate to "/blog" in the app
2. Browse published posts with infinite scroll (new posts load as you scroll down)
3. Click on individual post to view it separately (optional)
4. Use theme toggle in app bar to switch between light/dark mode

## Testing Checklist

- [x] Create blog post as admin
- [x] Save post as draft (not visible publicly)
- [x] Publish post (visible on public blog page)
- [x] Edit existing post
- [x] Delete post
- [x] View blog list as public user
- [x] Read full blog post with markdown rendering
- [x] Toggle dark mode (persists after refresh)
- [x] Verify authentication protects admin routes
- [x] Test markdown features (code, lists, links, images, tables)

## Future Enhancements

Potential features to add:
- Categories/tags for posts
- Search functionality
- Archive view (by month/year)
- Comments system
- Backend pagination (currently client-side batching)
- Featured images
- SEO metadata
- RSS feed
- Social sharing buttons
