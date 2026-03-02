import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { writeLog } from './helpers';

/**
 * Server information extracted from spawn_test_server output
 */
export interface ServerInfo {
  port: number;
  address: string;
  test_name: string;
  username?: string;
  password?: string;
  user_id?: string;
}

/**
 * Result of monitoring backend process output
 */
export interface BackendOutputMonitor {
  output: string;
}

/**
 * Ensure the spawn_test_server binary exists, building it if necessary
 */
export async function ensureBinaryExists(
  projectRoot: string,
  logFileName: string
): Promise<string> {
  const binaryPath = path.join(projectRoot, 'target', 'release', 'spawn_test_server');
  const binaryExists = await fs.promises.access(binaryPath).then(() => true).catch(() => false);
  
  if (!binaryExists) {
    writeLog(logFileName, 'Binary not found, building spawn_test_server...', 'BACKEND');
    await buildBinary(projectRoot, logFileName);
    writeLog(logFileName, 'Binary build successful', 'BACKEND');
  } else {
    writeLog(logFileName, 'Using existing binary', 'BACKEND');
  }
  
  return binaryPath;
}

/**
 * Build the spawn_test_server binary using cargo
 */
async function buildBinary(projectRoot: string, logFileName: string): Promise<void> {
  const cargoBuild = spawn('cargo', ['build', '--bin', 'spawn_test_server', '--features', 'e2e-tests', '--release'], {
    cwd: projectRoot,
    stdio: 'pipe',
  });
  
  let buildOutput = '';
  cargoBuild.stdout?.on('data', (data) => {
    buildOutput += data.toString();
  });
  cargoBuild.stderr?.on('data', (data) => {
    buildOutput += data.toString();
  });

  await new Promise<void>((resolve, reject) => {
    cargoBuild.on('close', async (code) => {
      if (code === 0) {
        resolve();
      } else {
        writeLog(logFileName, `ERROR: Cargo build failed with code ${code}\n${buildOutput}`, 'BACKEND');
        reject(new Error(`Cargo build failed with code ${code}. See log file for details.`));
      }
    });
    cargoBuild.on('error', async (err) => {
      writeLog(logFileName, `ERROR: Failed to start cargo build: ${err.message}`, 'BACKEND');
      reject(new Error(`Failed to start cargo build: ${err.message}`));
    });
  });
}

/**
 * Spawn the backend test server process
 */
export function spawnBackendProcess(
  binaryPath: string,
  testName: string,
  projectRoot: string
): ChildProcess {
  return spawn(
    binaryPath,
    [],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        TEST_NAME: testName,
        CREATE_USER: 'false', // Always false - users created via makeUser() instead
        TEST_LOG: '1', // Enable tracing output to stdout for E2E tests
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
}

/**
 * Monitor backend process output and log to file
 */
export function monitorBackendOutput(
  backendProcess: ChildProcess,
  logFileName: string
): BackendOutputMonitor {
  const monitor: BackendOutputMonitor = {
    output: '',
  };
  
  // Capture stdout for parsing and log it
  backendProcess.stdout?.on('data', (data) => {
    const dataStr = data.toString();
    monitor.output += dataStr;
    writeLog(logFileName, `${dataStr}`, 'BACKEND');
  });
  
  // Log stderr
  backendProcess.stderr?.on('data', (data) => {
    const dataStr = data.toString();
    writeLog(logFileName, `${dataStr}`, 'BACKEND');
  });
  
  return monitor;
}

/**
 * Parse server information from backend output
 * Waits for JSON containing address and port to appear in output
 * 
 * Note: Increased timeout to handle database contention when multiple tests run in parallel.
 * The backend may take longer to start due to:
 * - Multiple tests creating databases simultaneously
 * - Database connection pool initialization
 * - Migration execution
 */
export async function parseServerInfo(
  monitor: BackendOutputMonitor,
  maxWait: number = 30000  // Increased from 10s to 30s for parallel test execution
): Promise<ServerInfo> {
  const startTime = Date.now();
  let lastLoggedWait = 0;

  while (Date.now() - startTime < maxWait) {
    if (monitor.output.includes('"address"') && monitor.output.includes('"port"')) {
      try {
        const lines = monitor.output.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          // Try to find JSON in the line - it might be prefixed with timestamp/logger output
          const jsonMatch = trimmed.match(/\{.*"address".*"port".*\}/);
          if (jsonMatch) {
            const serverInfo = JSON.parse(jsonMatch[0]);
            const elapsed = Date.now() - startTime;
            if (elapsed > 5000) {
              console.warn(`Backend took ${elapsed}ms to start (possibly due to database contention)`);
            }
            return serverInfo;
          }
        }
      } catch (e) {
        // Not valid JSON yet, continue waiting
      }
    }
    
    // Log progress every 5 seconds to show we're still waiting
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    if (elapsedSeconds > lastLoggedWait && elapsedSeconds % 5 === 0) {
      console.log(`Still waiting for backend to start... (${elapsedSeconds}s elapsed)`);
      lastLoggedWait = elapsedSeconds;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Failed to parse server info: no port information received after ${maxWait}ms. This may indicate database contention. Output: ${monitor.output.substring(0, 500)}`);
}
