"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditMiddleware = auditMiddleware;
const transaction_js_1 = require("../database/transaction.js");
const audit_repository_js_1 = require("../infrastructure/repositories/audit-repository.js");
const logger_js_1 = require("../logging/logger.js");
// Successful mutations are audited atomically by their use case. Record reads and failed attempts here.
function auditMiddleware(req, res, next) {
    // Express changes req.url while a mounted router is dispatching; preserve the original resource.
    const resource = req.originalUrl.split('?')[0];
    res.once('finish', () => {
        if (!resource.startsWith('/api/v1/') || resource.endsWith('/realtime/stream') || req.auditRecorded)
            return;
        if (res.statusCode < 400 && req.method !== 'GET')
            return;
        const actor = req.user ? { id: req.user.id, username: req.user.username, ip: req.ip } : undefined;
        void (0, transaction_js_1.withWriteTransaction)(tx => new audit_repository_js_1.SqlAuditRepository(tx).append({ actor,
            action: req.method === 'GET' ? 'VIEW' : req.method + '_ATTEMPT', resource,
            outcome: res.statusCode >= 400 ? 'FAILED' : 'SUCCESS',
            details: { statusCode: res.statusCode, query: req.query, error: res.locals.auditError, requestId: req.headers['x-request-id'],
                attemptedUsername: !req.user && typeof req.body?.username === 'string' ? req.body.username : undefined } }))
            .catch(error => logger_js_1.logger.error('Failed to persist request audit', { module: 'Audit', error: String(error) }));
    });
    next();
}
