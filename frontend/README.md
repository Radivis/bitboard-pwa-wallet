# Zero2Prod Frontend

React + TypeScript frontend for the Zero2Prod newsletter application.

## Tech Stack

- **React 19** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Material-UI (MUI) v6** - Component library
- **React Router** - Client-side routing
- **TanStack Query** - Server state management
- **Playwright** - E2E testing
- **Swagger UI React** - API documentation

## Development

### Prerequisites

- Node.js 24+ and npm
- Backend server running on `http://localhost:8000`

### Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will be available at `http://localhost:3000`

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm test` - Run E2E tests with Playwright
- `npm run test:ui` - Run E2E tests with Playwright UI

## Features

### Public Pages

- **Home** (`/`) - Landing page
- **Blog** (`/blog`) - Public blog posts
- **Blog Post** (`/blog/:id`) - Individual blog post
- **API Documentation** (`/docs`) - Interactive Swagger UI
- **Login** (`/login`) - User authentication
- **Initial Password** (`/initial-password`) - First-time setup

### Admin Pages (Protected)

- **Dashboard** (`/admin/dashboard`) - Admin overview
- **Newsletters** (`/admin/newsletters`) - Send newsletters
- **Password** (`/admin/password`) - Change password
- **Blog Management** (`/admin/blog`) - Manage blog posts
  - Create new posts (`/admin/blog/new`)
  - Edit posts (`/admin/blog/:id/edit`)

## API Documentation

The frontend includes an interactive Swagger UI at `/docs` that loads the OpenAPI specification from the backend (`/api/openapi.json`). This allows you to:

- Browse all available API endpoints
- See request/response schemas
- Test endpoints directly from the browser
- View authentication requirements

Access it via the "API Docs" link in the main navigation.

## E2E Testing

End-to-end tests are written with Playwright and cover:

- Initial password setup
- Login flow
- Admin dashboard
- Newsletter management
- Password change
- Blog management

### Running E2E Tests

```bash
# Run all tests
npx playwright test

# Run in headed mode
npx playwright test --headed

# Run specific test file
npx playwright test tests/e2e/login.spec.ts

# Run with UI mode
npx playwright test --ui

# View test report
npx playwright show-report
```

### E2E Test Architecture

Tests use custom Playwright fixtures for:
- `backendApp` - Isolated backend server instance
- `frontendServer` - Vite dev server instance
- `authenticatedPage` - Pre-authenticated browser context with user credentials

Test logs are consolidated in `tests/logs/e2e-telemetry/` with prefixes:
- `[TEST]` - Test execution messages
- `[FRONTEND]` - Vite server output
- `[BACKEND]` - Backend server tracing

See `tests/README.md` for detailed testing documentation.

## Vite Configuration

### Proxy Configuration

The Vite dev server proxies API requests to the backend:

```typescript
proxy: {
  '/api': {
    target: 'http://localhost:8000',
    changeOrigin: true,
  },
  '/health_check': {
    target: 'http://localhost:8000',
    changeOrigin: true,
  },
}
```

All other routes are handled by React Router (SPA).

### Environment Variables

Create a `.env` file for local configuration:

```env
VITE_API_URL=http://localhost:8000
```

## Project Structure

```
frontend/
├── src/
│   ├── api/           # API client functions
│   ├── components/    # Reusable components
│   ├── contexts/      # React contexts (theme, etc.)
│   ├── pages/         # Page components
│   ├── utils/         # Utility functions
│   ├── App.tsx        # Main app component with routing
│   └── main.tsx       # Entry point
├── tests/
│   ├── e2e/           # E2E test files
│   ├── fixtures.ts    # Playwright fixtures
│   ├── helpers.ts     # Test helper functions
│   └── init.ts        # Test initialization
├── playwright.config.ts
└── vite.config.ts
```

## Building for Production

```bash
# Build the frontend
npm run build

# The output will be in the dist/ folder
# Serve it with any static file server
npm run preview
```

The production build is optimized and ready to deploy to any static hosting service (Netlify, Vercel, GitHub Pages, etc.).

## Dark Mode

The app includes a built-in dark mode toggle available in the top-right corner of the navigation bar. The theme preference is persisted in localStorage.

**Swagger UI Integration**: The API documentation at `/docs` automatically syncs with the MUI theme. All Swagger UI components (endpoints, parameters, responses, code examples) are styled to match the current theme with proper contrast and readability. See `doc/SWAGGER_UI_DARK_MODE.md` for implementation details.
