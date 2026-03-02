import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { writeLog } from './helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Result of monitoring Vite process output
 */
interface ViteOutputMonitor {
  port: number | null;
  ready: boolean;
  error: string;
  fullOutput: string;
}

/**
 * Strip ANSI escape codes from terminal output
 */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Spawn the Vite development server process
 */
export function spawnViteProcess(backendPort: number): ChildProcess {
  const viteProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      BACKEND_PORT: backendPort.toString(),
    },
    stdio: 'pipe',
    detached: false,
    ...(process.platform !== 'win32' && { 
      shell: false,
    }),
  });
  
  // On Unix, set the process group so we can kill all children
  if (process.platform !== 'win32' && viteProcess.pid) {
    try {
      process.kill(-viteProcess.pid, 0);
    } catch (e) {
      // If we can't set process group, that's okay
    }
  }
  
  return viteProcess;
}

/**
 * Monitor Vite process output to extract port and detect readiness
 */
export function monitorViteOutput(
  viteProcess: ChildProcess,
  logFileName: string
): ViteOutputMonitor {
  const monitor: ViteOutputMonitor = {
    port: null,
    ready: false,
    error: '',
    fullOutput: '',
  };
  
  viteProcess.stdout?.on('data', (data) => {
    const output = data.toString();
    monitor.fullOutput += output;
    const trimmed = output.trim();
    if (trimmed) {
      writeLog(logFileName, trimmed, 'FRONTEND');
    }
    
    // Extract port from Vite output like "➜  Local:   http://localhost:3003/"
    // Strip ANSI color codes first to handle colored terminal output
    const cleanOutput = stripAnsi(output);
    const portMatch = cleanOutput.match(/Local:\s+http:\/\/localhost:(\d+)/);
    if (portMatch) {
      monitor.port = parseInt(portMatch[1], 10);
      writeLog(logFileName, `Detected frontend port: ${monitor.port}`, 'TEST');
    }
    
    if (cleanOutput.includes('Local:') || cleanOutput.includes('ready') || cleanOutput.includes('VITE')) {
      monitor.ready = true;
    }
  });
  
  viteProcess.stderr?.on('data', (data) => {
    const output = data.toString();
    monitor.error += output;
    const trimmed = output.trim();
    if (trimmed) {
      writeLog(logFileName, trimmed, 'FRONTEND');
    }
  });
  
  return monitor;
}

/**
 * Wait for Vite to start and port to be detected
 */
export async function waitForViteStart(
  monitor: ViteOutputMonitor,
  maxWait: number = 10000
): Promise<number> {
  const startTime = Date.now();
  while ((!monitor.ready || monitor.port === null) && Date.now() - startTime < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (!monitor.ready) {
    throw new Error(`Vite server did not start in time. Stderr: ${monitor.error}`);
  }

  if (monitor.port === null) {
    throw new Error(`Failed to detect frontend port within ${maxWait}ms. Output: ${monitor.fullOutput}`);
  }

  return monitor.port;
}

/**
 * Wait for frontend server to become accessible via HTTP
 */
export async function waitForFrontendAccessible(
  frontendUrl: string,
  logFileName: string,
  maxWait: number = 12000
): Promise<void> {
      writeLog(logFileName, `Checking frontend accessibility at ${frontendUrl}`, 'TEST');
  
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    try {
      await fetch(frontendUrl);
      writeLog(logFileName, `Frontend server accessible at ${frontendUrl}`, 'TEST');
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  throw new Error(`Frontend server did not become accessible at ${frontendUrl} within ${maxWait}ms`);
}

/**
 * Kill Vite process and all its children
 */
export async function killViteProcess(viteProcess: ChildProcess, logFileName: string): Promise<void> {
      writeLog(logFileName, 'Stopping Vite dev server', 'FRONTEND');

  const killViteForcefully = async () => {
    viteProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!viteProcess.killed) {
      viteProcess.kill('SIGKILL');
    }
  }
  
  try {
    if (viteProcess.pid && !viteProcess.killed) {
      if (process.platform !== 'win32') {
        // Unix: try to kill process group first
        try {
          process.kill(-viteProcess.pid, 'SIGTERM');
          await new Promise(resolve => setTimeout(resolve, 2000));
          try {
            process.kill(-viteProcess.pid, 'SIGKILL');
          } catch (e) {
            // Process group might already be dead
          }
        } catch (e) {
          // Fallback to killing just the process
          killViteForcefully()
        }
      } else {
        // Windows: just kill the process
        killViteForcefully()
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (error) {
    // Ignore errors during cleanup
  }
}
