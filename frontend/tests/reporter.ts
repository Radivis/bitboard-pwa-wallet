import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FileReporter implements Reporter {
  private logsDir: string;

  constructor() {
    this.logsDir = path.join(__dirname, 'logs', 'e2e');
    // Ensure logs directory exists
    fs.mkdirSync(this.logsDir, { recursive: true });
  }

  onBegin(config: FullConfig, suite: Suite) {
    // Log file setup happens per test
  }

  onTestBegin(test: TestCase) {
    // Test is starting - log file will be created by helpers if needed
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const sanitizedTestName = this.sanitizeTestName(test.titlePath().join(' '));
    const logFile = path.join(this.logsDir, `${sanitizedTestName}.log`);
    
    // Write test result to log file
    const logEntry = {
      test: test.titlePath().join(' > '),
      status: result.status,
      duration: result.duration,
      errors: result.errors.map(e => ({
        message: e.message,
        stack: e.stack,
      })),
      attachments: result.attachments.map(a => ({
        name: a.name,
        path: a.path,
        contentType: a.contentType,
      })),
      timestamp: new Date().toISOString(),
    };

    fs.appendFileSync(
      logFile,
      `\n=== Test Result ===\n${JSON.stringify(logEntry, null, 2)}\n`
    );
  }

  onError(error: Error) {
    const errorLogFile = path.join(this.logsDir, 'errors.log');
    fs.appendFileSync(
      errorLogFile,
      `[${new Date().toISOString()}] ${error.message}\n${error.stack}\n\n`
    );
  }

  private sanitizeTestName(name: string): string {
    return name
      .replace(/\s+/g, '_')
      .replace(/[\/\\:<>"|?*]/g, '_')
      .substring(0, 150); // Limit length
  }
}

export default FileReporter;
