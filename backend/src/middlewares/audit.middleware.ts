import { Request, Response, NextFunction } from 'express';
import { withWriteTransaction } from '../database/transaction.js';
import { SqlAuditRepository } from '../infrastructure/repositories/audit-repository.js';
import { logger } from '../logging/logger.js';

declare global { namespace Express { interface Request { auditRecorded?: boolean; } } }

// Successful mutations are audited atomically by their use case. Record reads and failed attempts here.
export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  // Express changes req.url while a mounted router is dispatching; preserve the original resource.
  const resource = req.originalUrl.split('?')[0];
  res.once('finish', () => {
    if (!resource.startsWith('/api/v1/') || resource.endsWith('/realtime/stream') || req.auditRecorded) return;
    if (res.statusCode < 400 && req.method !== 'GET') return;
    const actor = req.user ? { id: req.user.id,username: req.user.username,ip: req.clientIp } : undefined;
    void withWriteTransaction(tx => new SqlAuditRepository(tx).append({ actor, ip: req.clientIp,
      action: req.method === 'GET' ? 'VIEW' : req.method + '_ATTEMPT', resource,
      outcome: res.statusCode >= 400 ? 'FAILED' : 'SUCCESS',
      details: { statusCode: res.statusCode, query: req.query, error: res.locals.auditError, requestId: req.headers['x-request-id'],
        attemptedUsername: !req.user && typeof req.body?.username === 'string' ? req.body.username : undefined } }))
      .catch(error => logger.error('Failed to persist request audit', { module: 'Audit', error: String(error) }));
  });
  next();
}
