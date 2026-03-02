import { ChildProcess } from 'child_process';
import { execSync } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { writeLog } from './helpers';
import * as TIMEOUTS from './constants';
import {
  ensureBinaryExists,
  spawnBackendProcess,
  monitorBackendOutput,
  parseServerInfo,
} from './backend-spawn-helpers';

// ES module equivalent of __dirname - MUST be defined BEFORE use
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = promisify(setTimeout);

export interface TestApp {
  port: number;
  address: string;
  testName: string;
  process: ChildProcess;
  username?: string;
  password?: string;
  userId?: string;
}

/**
 * Spawn a backend test server
 * @param testName - Name for the test (used for database naming, may have e2e- prefix)
 * 
 * Note: Users should be created via the makeUser() helper function, not by the backend spawn.
 * This ensures users are created through the actual /initial_password API endpoint.
 */
export async function spawnTestApp(testName: string): Promise<TestApp> {
  const projectRoot = path.resolve(__dirname, '../..');
  const logFileName = testName.replace(/^e2e-/, '');
  
  writeLog(logFileName, `Starting test app spawn: testName=${testName}`, 'BACKEND');
  
  // Ensure binary exists, building if necessary
  const binaryPath = await ensureBinaryExists(projectRoot, logFileName);
  
  // Spawn the backend process
  const testServerProcess = spawnBackendProcess(binaryPath, testName, projectRoot);
  
  // Monitor output and log to file
  const monitor = monitorBackendOutput(testServerProcess, logFileName);
  
  try {
    // Parse server info from output
    const serverInfo = await parseServerInfo(monitor);
    
    writeLog(logFileName, `Test server started: port=${serverInfo.port}, address=${serverInfo.address}, username=${serverInfo.username || 'N/A'}`, 'BACKEND');

    // Wait for backend to be ready
    writeLog(logFileName, 'Waiting for backend to be ready...', 'BACKEND');
    await waitForBackendReady(serverInfo.address, 30000);
    writeLog(logFileName, 'Backend is ready', 'BACKEND');

    return {
      port: serverInfo.port,
      address: serverInfo.address,
      testName: serverInfo.test_name,
      username: serverInfo.username,
      password: serverInfo.password,
      userId: serverInfo.user_id,
      process: testServerProcess,
    };
  } catch (error) {
    testServerProcess.kill();
      writeLog(logFileName, `ERROR: Backend server startup failed: ${error}`, 'BACKEND');
    throw error;
  }
}

/**
 * Stop a test app
 */
export async function stopTestApp(app: TestApp): Promise<void> {
  // Write final log entry - strip e2e- prefix for log file naming
  if (app.testName) {
    const logFileName = app.testName.replace(/^e2e-/, '');
    writeLog(logFileName, 'Test app stopped', 'BACKEND'); // Fire-and-forget
  }
  
  if (app.process && !app.process.killed && app.process.pid) {
    try {
      // Try graceful shutdown first
      app.process.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve();
        }, 2000);
        
        app.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        app.process.on('error', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      
      // Force kill if still running
      if (!app.process.killed && app.process.pid) {
        app.process.kill('SIGKILL');
      }
      
      // Give it a moment to fully clean up
      await sleep(TIMEOUTS.DELAY_BACKEND_CLEANUP);
    } catch (error: any) {
      // Ignore errors during cleanup - process might already be dead
      writeLog('cleanup', `Error during backend cleanup: ${error?.message || error}`, 'TEST');
    }
  }
}

/**
 * Generic function to wait for a URL to become ready
 */
export async function waitForUrlReady(
  url: string,
  maxWait: number,
  errorMessage: string = 'URL did not become ready in time'
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (e) {
      // Server not ready yet
    }
    await sleep(500);
  }
  throw new Error(errorMessage);
}

/**
 * Wait for backend to be ready
 */
export async function waitForBackendReady(
  address: string, 
  maxWait: number = TIMEOUTS.TIMEOUT_BACKEND_READY
): Promise<void> {
  return waitForUrlReady(
    `${address}/health_check`,
    maxWait,
    'Backend did not become ready in time'
  );
}

/**
 * Wait for frontend to be ready
 */
export async function waitForFrontendReady(
  url: string,
  maxWait: number = TIMEOUTS.TIMEOUT_FRONTEND_READY
): Promise<void> {
  return waitForUrlReady(
    url,
    maxWait,
    'Frontend did not become ready in time'
  );
}
