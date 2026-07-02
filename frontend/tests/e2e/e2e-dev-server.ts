/**
 * Playwright E2E dev server port. Keep separate from `npm run dev` (3000) so
 * local dev and E2E can run side by side.
 *
 * Vite binds to 127.0.0.1 when E2E_DEV_SERVER_PORT is set (see vite.config.ts) so
 * Playwright's probe matches on IPv6-first systems where `localhost` is only ::1.
 */
export const E2E_DEV_SERVER_PORT = Number(process.env.E2E_DEV_SERVER_PORT ?? '3100')

export const E2E_DEV_SERVER_ORIGIN = `http://127.0.0.1:${E2E_DEV_SERVER_PORT}`
