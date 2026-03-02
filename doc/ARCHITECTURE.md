# Application Architecture

## Development Setup

The application is split into two services during development:

### Backend (Port 8000)
- **Purpose**: Pure JSON API server (no HTML served)
- **Technology**: Rust + Axum
- **API Routes**:
  - `POST /login` - User login
  - `POST /initial_password` - Set initial admin password
  - `POST /subscriptions` - Subscribe to newsletter
  - `GET /subscriptions/confirm` - Confirm subscription
  - `POST /admin/newsletters` - Publish newsletter (authenticated)
  - `POST /admin/password` - Change password (authenticated)
  - `POST /admin/logout` - Logout (authenticated)
  - `GET /health_check` - Health check endpoint
  - `GET /api/users/exists` - Check if users exist
  
**Note**: The backend does NOT serve any HTML pages. All HTML/UI is served by the React frontend.

### Frontend (Port 3000)
- **Purpose**: React SPA
- **Technology**: React + Vite + TypeScript + MUI
- **Development Server**: Vite dev server
- **Routing**: 
  - **GET requests** for pages (`/login`, `/admin/*`, etc.) → Served by Vite (React app)
  - **POST/API requests** → Proxied to backend (port 8000)
- **React Router handles**: Client-side navigation between pages

## How to Run

### Development Mode

1. **Start the backend** (in one terminal):
   ```bash
   cargo run
   ```
   Backend will run on http://localhost:8000

2. **Start the frontend** (in another terminal):
   ```bash
   cd frontend
   npm run dev
   ```
   Frontend will run on http://localhost:3000

3. **Access the application**: 
   - Open http://localhost:3000 in your browser
   - All API requests will be proxied from port 3000 to port 8000

### Important Notes

- **In development, ALWAYS use port 3000** for the web interface
  - Port 3000 serves the React app for all page navigations
  - Vite proxy forwards POST/API requests to port 8000
- **Port 8000 is API-only** - accessing it directly in a browser will return JSON or 404
- The Vite proxy configuration uses `bypass` to serve the React app for GET requests to page routes like `/login`, `/admin/*`
- **Pure SPA Architecture**: The backend serves only JSON API endpoints, no HTML

## Request/Response Flow

### GET Request (Page Navigation)
```
Browser → GET /login
    ↓ Vite Dev Server
    ↓ Vite bypass (method === 'GET')
    ↓ Serve /index.html (React App)
    ↓ React Router
    ↓ Render Login Component
```

### POST Request (API Call)
```
Browser → POST /login (JSON)
    ↓ Vite Proxy
    ↓ http://localhost:8000/login
    ↓ Axum Backend
    ↓ JSON Response
    ↓ Vite Proxy
    ↓ React App
    ↓ Update UI / Navigate
```

## Authentication

- **Session Management**: Cookie-based sessions using Redis
- **Credentials**: `credentials: 'include'` in fetch requests
- **Protected Routes**: Frontend checks authentication and redirects to `/login` if needed
- **Backend Middleware**: `/admin/*` routes require authentication

## API Format

All API endpoints expect and return JSON:
- **Request**: `Content-Type: application/json`
- **Response**: `Content-Type: application/json`
- **Error Responses**: HTTP status codes (400, 401, 500, etc.) with JSON error messages

## Production (Future)

For production deployment, the frontend will be:
1. Built: `npm run build` (creates `frontend/dist`)
2. Served by the backend using `tower-http::ServeDir`
3. All routes serve the React app, API endpoints remain the same
4. Single port (8000) for both frontend and backend
