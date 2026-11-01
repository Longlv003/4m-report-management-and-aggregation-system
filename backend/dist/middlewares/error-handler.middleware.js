"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandlerMiddleware = errorHandlerMiddleware;
const app_error_js_1 = require("../errors/app-error.js");
const logger_js_1 = require("../logging/logger.js");
function errorHandlerMiddleware(err, req, res, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
next) {
    res.locals.auditError = { message: err.message, code: err instanceof app_error_js_1.AppError ? err.errorCode : 'INTERNAL_SERVER_ERROR' };
    if (res.headersSent) {
        next(err);
        return;
    }
    const reqId = req.headers['x-request-id'] || 'unknown';
    if (err instanceof app_error_js_1.AppError) {
        if (err.statusCode < 500) {
            logger_js_1.logger.warn(`[HTTP_${err.statusCode}] ${err.errorCode}: ${err.message}`, {
                module: 'ErrorHandler',
                requestId: reqId,
                details: err.details
            });
        }
        else {
            logger_js_1.logger.error(`[HTTP_${err.statusCode}] ${err.errorCode}: ${err.message}`, {
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
    logger_js_1.logger.error(`[UNHANDLED_ERROR] ${err.message}`, {
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
