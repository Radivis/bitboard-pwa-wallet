/**
 * Test timeout constants
 * Centralized to make it easier to adjust timing for CI/CD environments
 */

// Login and navigation timeouts
export const TIMEOUT_LOGIN_FORM_VISIBLE = 10000;
export const TIMEOUT_LOGIN_RESPONSE = 20000;
export const TIMEOUT_LOGIN_NAVIGATION = 20000;
export const TIMEOUT_AUTH_CHECK = 10000;
export const TIMEOUT_DASHBOARD_LOAD = 15000;
export const TIMEOUT_WELCOME_MESSAGE = 10000;

// Short delays for UI state transitions
export const DELAY_UI_TRANSITION = 500;
export const DELAY_UI_ERROR_APPEAR = 1000;
export const DELAY_FORM_SUBMISSION = 500;
export const DELAY_DATABASE_COMMIT = 500;
export const DELAY_REDIS_READY = 100;
export const DELAY_BACKEND_CLEANUP = 500;
export const DELAY_AUTH_CHECK_SETTLE = 3000;

// Backend health check timeouts
export const TIMEOUT_BACKEND_HEALTH_CHECK = 5000;
export const TIMEOUT_BACKEND_HEALTH_SHORT = 3000;
export const TIMEOUT_BACKEND_READY = 30000;

// User verification retries
export const USER_VERIFICATION_MAX_RETRIES = 10;
export const USER_VERIFICATION_RETRY_DELAY = 200;
