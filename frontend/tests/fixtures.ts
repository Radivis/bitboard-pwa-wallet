import { test as base, Page, TestInfo } from '@playwright/test';
import { spawnTestApp, stopTestApp, TestApp, waitForBackendReady } from './init';
import { ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { writeLog } from './helpers';
import { fetchPostJson } from '../src/utils/api';
import * as TIMEOUTS from './constants';
import {
  spawnViteProcess,
  monitorViteOutput,
  waitForViteStart,
  waitForFrontendAccessible,
  killViteProcess,
} from './frontend-server-helpers';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// REST API error type
export interface RestApiError {
  status: number;
  statusText: string;
  error?: string;
}

// User creation result
export interface MakeUserResult {
  success: boolean;
  error?: RestApiError;
  username: string;
  password: string;
  userId?: string;
}

// Test user type
export interface TestUser {
  username: string;
  password: string;
  userId?: string;
}

/**
 * Build Cookie header string from Playwright cookie array.
 */
export function getCookieHeader(cookies: Array<{ name: string; value: string }>): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Retry a user creation operation with exponential backoff
 * Handles transient failures due to database contention
 */
async function retryUserCreation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      if (attempt < maxRetries) {
        // Exponential backoff: 100ms, 200ms, 400ms
        const delayMs = 100 * Math.pow(2, attempt - 1);
        writeLog('makeUser', `Attempt ${attempt} failed, retrying in ${delayMs}ms...`, 'FIXTURE');
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError;
}

/**
 * Creates a user via the REST API using the /initial_password endpoint.
 * This is the proper way to create users in E2E tests - through the actual API.
 * 
 * Includes retry logic with exponential backoff to handle database contention
 * when multiple tests run in parallel.
 * 
 * @param backendAddress - The backend server address (e.g., http://127.0.0.1:12345)
 * @param username - The username for the new user
 * @param password - The password for the new user
 * @returns Promise with creation result
 */
export async function makeUser(
  backendAddress: string,
  username: string,
  password: string
): Promise<MakeUserResult> {
  const log = (msg: string) => writeLog('makeUser', msg, 'FIXTURE');

  return retryUserCreation(async () => {
    try {
      const response = await fetchPostJson({
        url: `${backendAddress}/api/initial_password`,
        bodyObject: {
          username,
          password,
          password_confirmation: password,
        },
      });

      if (!response.ok) {
        const responseText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { error: responseText || 'Unknown error' };
        }

        log(`Failed to create user: ${response.status} ${response.statusText}`);
        log(`Response body: ${responseText}`);

        // Retry on server errors (5xx), but not client errors (4xx)
        if (response.status >= 500) {
          log(`Server error (${response.status}), will retry`);
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        return {
          success: false,
          error: {
            status: response.status,
            statusText: response.statusText,
            error: errorData.error || errorData.message || responseText || 'Failed to create user',
          },
          username,
          password,
        };
      }

      const data = await response.json();

      // Verify the user is actually visible in the database before returning
      const maxRetries = TIMEOUTS.USER_VERIFICATION_MAX_RETRIES;
      const retryDelay = TIMEOUTS.USER_VERIFICATION_RETRY_DELAY;
      let userVerified = false;

      for (let i = 0; i < maxRetries; i++) {
        try {
          const existsResponse = await fetch(`${backendAddress}/api/users/exists`);
          if (existsResponse.ok) {
            const existsData = await existsResponse.json();
            if (existsData.users_exist) {
              userVerified = true;
              break;
            }
          }
        } catch (e) {
          // Continue trying
        }

        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }

      if (!userVerified) {
        log(`User created but not yet visible in existence check after ${maxRetries} retries`);
      }

      // Small delay to ensure Redis session store is ready
      await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DELAY_REDIS_READY));

      return {
        success: true,
        username,
        password,
        userId: data.user_id,
      };
    } catch (error: any) {
      log(`Network error: ${error.message || error}`);
      
      // Throw to trigger retry for network errors
      throw error;
    }
  }, 3);  // Retry up to 3 times
}

/**
 * Creates a confirmed newsletter subscriber via the REST API.
 * 
 * @param backendAddress - The backend server address
 * @param email - The subscriber's email address
 * @param name - The subscriber's name
 * @returns Promise with the subscription token
 */
export async function makeConfirmedSubscriber(
  backendAddress: string,
  email: string,
  name: string
): Promise<string> {
  const log = (msg: string) => writeLog('makeConfirmedSubscriber', msg, 'FIXTURE');

  // 1. Create subscription
  log(`Creating subscription for ${email}`);

  const subscribeResponse = await fetchPostJson({
    url: `${backendAddress}/api/subscriptions`,
    bodyObject: { email, name },
  });

  if (!subscribeResponse.ok) {
    const responseText = await subscribeResponse.text();
    let errorData;
    try {
      errorData = JSON.parse(responseText);
    } catch {
      errorData = { error: responseText || 'Unknown error' };
    }

    log(`Failed to create subscription: ${subscribeResponse.status} ${subscribeResponse.statusText}`);
    log(`Response body: ${responseText}`);

    throw new Error(`Failed to create subscription: ${subscribeResponse.status} - ${errorData.error || responseText}`);
  }

  log(`Subscription created successfully`);

  // 2. Get the token from the test endpoint
  log(`Fetching token for ${email}`);
  
  const tokenResponse = await fetch(
    `${backendAddress}/api/test/subscription-token?email=${encodeURIComponent(email)}`
  );

  if (!tokenResponse.ok) {
    const responseText = await tokenResponse.text();
    log(`Failed to get subscription token: ${tokenResponse.status} ${responseText}`);
    throw new Error(`Failed to get subscription token: ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json();
  const token = tokenData.token;

  if (!token) {
    log('No token returned from test endpoint');
    throw new Error('No token returned from test endpoint');
  }

  log(`Token retrieved: ${token.substring(0, 8)}...`);

  // 3. Confirm the subscription using the token
  log(`Confirming subscription for ${email}`);
  
  const confirmResponse = await fetch(
    `${backendAddress}/api/subscriptions/confirm?subscription_token=${token}`,
    { redirect: 'manual' }
  );
  
  if (confirmResponse.status !== 303 && !confirmResponse.ok) {
    const responseText = await confirmResponse.text();
    log(`Failed to confirm subscription: ${confirmResponse.status} ${responseText}`);
    throw new Error(`Failed to confirm subscription: ${confirmResponse.status}`);
  }

  log(`Subscription confirmed successfully for ${email}`);

  return token;
}

export async function login(
  username: string,
  password: string,
  logFileName: string,
  frontendServer: { process: ChildProcess, port: number, url: string },
  page: Page
): Promise<void> {
    // Login via the browser
    writeLog(logFileName, 'Starting browser login...', 'FIXTURE');
    await page.goto(`${frontendServer.url}/login`);
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('domcontentloaded');
    
    // Verify we're on the login page
    const currentUrl = page.url();
    if (!currentUrl.includes('/login')) {
        throw new Error(`Expected to be on login page, but current URL is: ${currentUrl}`);
    }
    writeLog(logFileName, `Confirmed on login page: ${currentUrl}`, 'FIXTURE');
    
    writeLog(logFileName, `Filling login form with username: ${username}`, 'FIXTURE');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    
    // Wait for login response and navigation
    writeLog(logFileName, 'Submitting login form...', 'FIXTURE');
    const [response] = await Promise.all([
      page.waitForResponse(response => response.url().includes('/login') && response.request().method() === 'POST'),
      page.getByLabel('Login').click(),
    ]);
    
    const loginStatus = response.status();
    
    if (loginStatus !== 200) {
      let errorMessage = `Login failed with status ${loginStatus}`;
      try {
        const loginBody = await response.json();
        errorMessage += `: ${loginBody.error}`;
      } catch (parseError) {
        // Try to get the raw response text for debugging
        try {
          const responseText = await response.text();
          writeLog(logFileName, `Login failed - raw response body: ${responseText}`, 'FIXTURE');
          errorMessage += `: Cannot parse login response body (raw: ${responseText.substring(0, 200)})`;
        } catch {
          writeLog(logFileName, `Login failed - could not read response body at all`, 'FIXTURE');
          errorMessage += `: Cannot parse login response body (body unreadable)`;
        }
      }
      throw new Error(errorMessage);
    }
    
    const loginBody = await response.json();
    writeLog(logFileName, `Login response: ${loginStatus} - ${JSON.stringify(loginBody)}`, 'FIXTURE');
    
    // Wait for navigation to dashboard to complete
    writeLog(logFileName, 'Waiting for navigation to dashboard...', 'FIXTURE');
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
    
    // Verify we're on the dashboard page
    const dashboardUrl = page.url();
    if (!dashboardUrl.includes('/admin/dashboard')) {
        throw new Error(`Expected to be on dashboard page after login, but current URL is: ${dashboardUrl}`);
    }
    
    // Wait for dashboard to be fully loaded (important for subsequent navigations)
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      // If networkidle times out, at least wait for domcontentloaded
      return page.waitForLoadState('domcontentloaded');
    });
    
    writeLog(logFileName, `Login complete, dashboard loaded at: ${dashboardUrl}`, 'FIXTURE');
}

// Frontend server type
export interface FrontendServer {
  process: ChildProcess;
  port: number;
  url: string;
}

// Interface for authenticated page with credentials
export interface AuthenticatedPageWithCredentials {
  page: Page;
  username: string;
  password: string;
}

// Extend the base test with our custom fixtures
interface TestFixtures {
  backendApp: TestApp;
  frontendServer: FrontendServer;
  authenticatedPage: AuthenticatedPageWithCredentials;
}

/**
 * Derive a clean test name from the Playwright test's title path.
 * Includes describe block(s) + test name for uniqueness across spec files.
 * When the name exceeds PostgreSQL's identifier limit, it is truncated
 * and a hash suffix is appended to preserve uniqueness.
 */
function extractCleanTestName(testInfo: TestInfo): string {
  const fullName = testInfo.titlePath
    .slice(1) // Discard file name
    .join('__')
    .replace(/\s+/g, '-')
    .toLowerCase();

  // PostgreSQL limits identifiers to 63 chars.
  // Rust prepends "test-" (5 chars), fixture prepends "e2e-" (4 chars) = 9 chars overhead
  const maxLength = 63 - 9;

  if (fullName.length <= maxLength) {
    return fullName;
  }

  const hash = createHash('sha256').update(fullName).digest('hex').substring(0, 8);
  return fullName.substring(0, maxLength - 9) + '-' + hash;
}

export const test = base.extend<TestFixtures>({
  // Backend test app fixture (always starts with blank database, no users)
  backendApp: async ({}, use, testInfo) => {
    const testName = testInfo.titlePath.join(' > ');
    const cleanTestName = extractCleanTestName(testInfo);
    // Database/test name needs e2e- prefix for spawnTestApp
    const dbTestName = `e2e-${cleanTestName}`;
    // Log file name without e2e- prefix
    const logFileName = cleanTestName;
    writeLog(logFileName, `Starting backend for test: ${testName}`, 'FIXTURE');
    
    // Always spawn without a user - tests create users via makeUser() if needed
    let app: TestApp;
    try {
      app = await spawnTestApp(dbTestName);
    } catch (error) {
      writeLog(logFileName, `ERROR: Failed to spawn backend app: ${error}`, 'FIXTURE');
      throw error;
    }
    
    await use(app);
    
    // Cleanup
    writeLog(logFileName, 'Cleaning up backend app', 'FIXTURE');
    await stopTestApp(app);
  },

  // Frontend server fixture - returns { process, port, url }
  frontendServer: async ({ backendApp }, use, testInfo) => {
    const app = backendApp;
    const cleanTestName = extractCleanTestName(testInfo);
    const logFileName = cleanTestName;
    
    // Ensure backend is ready before starting frontend
    try {
      await waitForBackendReady(app.address, 30000);
    } catch (error) {
      throw new Error(`Backend not ready before starting frontend: ${error}`);
    }
    
    writeLog(logFileName, `Starting Vite dev server with backend port ${app.port}`, 'FRONTEND');
    
    // Spawn Vite process
    const viteProcess = spawnViteProcess(app.port);
    
    // Monitor output for port and readiness
    const monitor = monitorViteOutput(viteProcess, logFileName);
    
    try {
      // Wait for Vite to start and extract port
      const frontendPort = await waitForViteStart(monitor);
      const frontendUrl = `http://localhost:${frontendPort}`;
      
      // Wait for frontend to be accessible
      await waitForFrontendAccessible(frontendUrl, logFileName);
      
      // Give React a moment to hydrate
      await new Promise(resolve => setTimeout(resolve, 1000));

      await use({ process: viteProcess, port: frontendPort, url: frontendUrl });
    } catch (error) {
      viteProcess.kill();
      throw error;
    } finally {
      // Cleanup - kill Vite process and all its children
      await killViteProcess(viteProcess, logFileName);
    }
  },

  // Authenticated page fixture - creates a user and logs in
  authenticatedPage: async ({ browser, backendApp, frontendServer }, use, testInfo) => {
    // Log file name includes describe block for uniqueness
    const cleanTestName = extractCleanTestName(testInfo);
    const logFileName = cleanTestName;
    
    // Create a new page with baseURL set to the dynamic frontend URL
    // This allows tests to use relative URLs like goto('/admin/dashboard')
    const context = await browser.newContext({
      baseURL: frontendServer.url,
    });
    const page = await context.newPage();
    
    // Generate random credentials
    const username = `test-user-${Math.random().toString(36).substring(7)}`;
    const password = `test-pass-${Math.random().toString(36).substring(7)}`;

    try {
      await makeUser(backendApp.address, username, password);
    } catch (error) {
      writeLog(logFileName, `ERROR: Failed to create user: ${error}`, 'FIXTURE');
      await context.close();
      throw error;
    }
    
    writeLog(logFileName, `User created successfully: ${username}`, 'FIXTURE');

    // Login via the browser
    try {
      await login(username, password, logFileName, frontendServer, page);
    } catch (error) {
      writeLog(logFileName, `ERROR: Failed to login: ${error}`, 'FIXTURE');
      await context.close();
      throw error;
    }
    
    // Wait for successful login (redirect to dashboard)
    writeLog(logFileName, 'Waiting for redirect to dashboard...', 'FIXTURE');
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
    
    // Verify we're on the dashboard page
    const dashboardUrl = page.url();
    if (!dashboardUrl.includes('/admin/dashboard')) {
        throw new Error(`Expected to be on dashboard page after login in authenticatedPage fixture, but current URL is: ${dashboardUrl}`);
    }
    
    // Wait for dashboard to be fully loaded before starting tests
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    writeLog(logFileName, `Dashboard loaded at ${dashboardUrl}, ready for test`, 'FIXTURE');

    // Pass page along with credentials so tests can use them
    await use({ page, username, password });
    
    // Cleanup
    await context.close();
  },
});

export { expect } from '@playwright/test';
