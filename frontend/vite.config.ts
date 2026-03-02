import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Get backend port from environment variable, default to 8000
const backendPort = process.env.BACKEND_PORT || '8000';
const backendUrl = `http://127.0.0.1:${backendPort}`;

console.log(`[VITE CONFIG] Backend proxy target: ${backendUrl}`);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Proxy all /api requests to backend
      // All other routes are served by React Router (SPA)
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
      // Health check endpoint (not under /api)
      '/health_check': {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-utils/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
