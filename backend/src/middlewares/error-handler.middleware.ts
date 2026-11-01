import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error.js';
import { logger } from '../logging/logger.js';

export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  res.locals.auditError = { message: err.message, code: err instanceof AppError ? err.errorCode : 'INTERNAL_SERVER_ERROR' };
  if (res.headersSent) { next(err); return; }
  const reqId = (req.headers['x-request-id'] as string) || 'unknown';

  if (err instanceof AppError) {
    if (err.statusCode < 500) {
      logger.warn(`[HTTP_${err.statusCode}] ${err.errorCode}: ${err.message}`, {
        module: 'ErrorHandler',
        requestId: reqId,
        details: err.details
      });
    } else {
      logger.error(`[HTTP_${err.statusCode}] ${err.errorCode}: ${err.message}`, {
        module: 'ErrorHandler',
        requestId: reqId,
        details: err.details,
        stack: err.stack
      });
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.errorCode,
        message: err.message,
        details: err.details || null,
        requestId: reqId
      }
    });
    return;
  }

  // Unexpected / System Error
  logger.error(`[UNHANDLED_ERROR] ${err.message}`, {
    module: 'ErrorHandler',
    requestId: reqId,
    stack: err.stack
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Hệ thống gặp sự cố xử lý. Vui lòng liên hệ quản trị viên.',
      details: null,
      requestId: reqId
    }
  });
}
