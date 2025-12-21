/**
 * Structured logging utility
 * Provides consistent logging format across the application
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private log(level: LogLevel, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...context,
    };

    // In development, use pretty printing
    if (this.isDevelopment) {
      const emoji = {
        debug: '🔍',
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
      }[level];

      console[level === 'error' ? 'error' : 'log'](
        `${emoji} [${level.toUpperCase()}] ${message}`,
        context ? context : ''
      );
    } else {
      // In production, use JSON for better parsing
      console[level === 'error' ? 'error' : 'log'](JSON.stringify(logEntry));
    }
  }

  debug(message: string, context?: LogContext) {
    if (this.isDevelopment) {
      this.log('debug', message, context);
    }
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext) {
    const errorContext = {
      ...context,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
    };

    this.log('error', message, errorContext);
  }

  /**
   * Log API request/response for debugging
   */
  api(
    method: string,
    path: string,
    data: {
      userId?: string;
      duration?: number;
      status?: number;
      error?: Error;
    } & LogContext
  ) {
    const level = data.error ? 'error' : 'info';
    this.log(level, `API ${method} ${path}`, {
      method,
      path,
      ...data,
    });
  }
}

export const logger = new Logger();
