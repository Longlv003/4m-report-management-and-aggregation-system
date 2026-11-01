import fs from 'fs';
import path from 'path';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface LogContext {
  module?: string;
  requestId?: string;
  jobId?: string;
  fileId?: string;
  [key: string]: unknown;
}

class Logger {
  private logDir: string | null = null;
  private currentLogFile: string | null = null;
  private isFileLoggingReady = false;

  public init(logDirectory: string): void {
    try {
      this.logDir = logDirectory;
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      const today = new Date().toISOString().split('T')[0];
      this.currentLogFile = path.join(this.logDir, `scan4m-${today}.log`);
      this.isFileLoggingReady = true;
      this.info('Logger initialized successfully', { module: 'Logger', logFile: this.currentLogFile });
    } catch (err) {
      console.error('[LOGGER_INIT_FAIL] Could not initialize file logger:', err);
    }
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const moduleName = context?.module ? `[${context.module}]` : '[App]';
    const ctxString = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
    return `${timestamp} ${level.padEnd(5)} ${moduleName} ${message}${ctxString}`;
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    const formatted = this.formatMessage(level, message, context);
    
    // Output to stdout/stderr
    if (level === 'ERROR' || level === 'FATAL') {
      console.error(formatted);
    } else if (level === 'WARN') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    // Write to daily file if initialized
    if (this.isFileLoggingReady && this.currentLogFile) {
      try {
        fs.appendFileSync(this.currentLogFile, formatted + '\n', 'utf8');
      } catch (err) {
        console.error('[LOGGER_FILE_WRITE_FAIL]', err);
      }
    }
  }

  public debug(message: string, context?: LogContext): void {
    this.write('DEBUG', message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.write('INFO', message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.write('WARN', message, context);
  }

  public error(message: string, context?: LogContext): void {
    this.write('ERROR', message, context);
  }

  public fatal(message: string, context?: LogContext): void {
    this.write('FATAL', message, context);
  }
}

export const logger = new Logger();
