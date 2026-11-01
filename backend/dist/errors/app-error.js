"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseError = exports.FileProcessingError = exports.ConfigurationError = exports.ConflictError = exports.NotFoundError = exports.AuthorizationError = exports.AuthenticationError = exports.ValidationError = exports.AppError = void 0;
class AppError extends Error {
    statusCode;
    errorCode;
    isOperational;
    details;
    constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR', isOperational = true, details) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.isOperational = isOperational;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
class ValidationError extends AppError {
    constructor(message, details) {
        super(message, 400, 'VALIDATION_ERROR', true, details);
    }
}
exports.ValidationError = ValidationError;
class AuthenticationError extends AppError {
    constructor(message = 'Chưa xác thực danh tính') {
        super(message, 401, 'AUTHENTICATION_ERROR', true);
    }
}
exports.AuthenticationError = AuthenticationError;
class AuthorizationError extends AppError {
    constructor(message = 'Không có quyền thực hiện thao tác này') {
        super(message, 403, 'AUTHORIZATION_ERROR', true);
    }
}
exports.AuthorizationError = AuthorizationError;
class NotFoundError extends AppError {
    constructor(message = 'Không tìm thấy tài nguyên yêu cầu') {
        super(message, 404, 'NOT_FOUND', true);
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends AppError {
    constructor(message, details) {
        super(message, 409, 'CONFLICT_ERROR', true, details);
    }
}
exports.ConflictError = ConflictError;
class ConfigurationError extends AppError {
    constructor(message, details) {
        super(message, 500, 'CONFIGURATION_ERROR', false, details);
    }
}
exports.ConfigurationError = ConfigurationError;
class FileProcessingError extends AppError {
    constructor(message, details) {
        super(message, 422, 'FILE_PROCESSING_ERROR', true, details);
    }
}
exports.FileProcessingError = FileProcessingError;
class DatabaseError extends AppError {
    constructor(message, details) {
        super(message, 500, 'DATABASE_ERROR', true, details);
    }
}
exports.DatabaseError = DatabaseError;
