import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as TIMEOUTS from './constants';
import type { TestApp } from './init';
import type { TestUser } from './fixtures';

// ES module equivalent of __dirname - MUST be defined BEFORE use
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = promisify(setTimeout);

// Source type for structured logging
export type LogSource = 'TEST' | 'FIXTURE' | 'FRONTEND' | 'BACKEND';

// Helper to write to log file (fire-and-forget to avoid blocking)
export function writeLog(testName: string, message: string, source: LogSource = 'TEST') {
  const logsDir = path.join(__dirname, 'logs', 'e2e-telemetry');
  
  const sanitizedTestName = testName
    .replace(/\s+/g, '_')
    .replace(/[\/\\:]/g, '_')
    .substring(0, 100);
  
  const logFile = path.join(logsDir, `${sanitizedTestName}.log`);
  const timestamp = new Date().toISOString();
  
  // Fire-and-forget: don't await, just log errors if they occur
  fs.promises.mkdir(logsDir, { recursive: true })
    .then(() => fs.promises.appendFile(logFile, `[${timestamp}] [${source}] ${message}\n`))
    .catch(() => {}); // Silently ignore errors to avoid blocking tests
}

/**
 * Get test user from the app (if it was created during spawn)
 */
export function getTestUserFromApp(app: TestApp): TestUser | null {
  if (app.username && app.password) {
    const testUser = {
      username: app.username,
      password: app.password,
      userId: app.userId,
    };
    
    return testUser;
  }
  return null;
}

/**
 * Verify that a session cookie was set after login
 * Useful for debugging authentication issues
 * @param page - Playwright page object
 * @returns Session cookie if found, undefined otherwise
 */
export async function verifySessionCookie(page: any): Promise<any | undefined> {
  const cookies = await page.context().cookies();
  return cookies.find((c: any) => c.name.includes('session') || c.name.includes('sid'));
}

