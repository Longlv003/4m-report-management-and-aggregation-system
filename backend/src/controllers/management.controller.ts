import { Request, Response, NextFunction } from 'express';
import { auditService, recordManagement } from '../composition/management.js';
import { ReportType } from '../domain/report-management.js';
import { sseManager } from '../modules/realtime/sse-manager.js';
import { ValidationError } from '../errors/app-error.js';

export function recordVisibilityController(report: ReportType, excluded: boolean) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reason = req.body.reason ?? '';
      if (typeof reason !== 'string') throw new ValidationError('Lý do phải là chuỗi');
      const data = await recordManagement.setExcluded(report,req.params.id,excluded,reason,
        { id: req.user!.id, username: req.user!.username, ip: req.clientIp });
      req.auditRecorded = true;
      sseManager.broadcast({ event: 'record_updated', data: { report, ...data } });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  };
}
export async function getAuditController(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1,Number.parseInt(String(req.query.page)) || 1);
    const pageSize = Math.min(200,Math.max(10,Number.parseInt(String(req.query.pageSize)) || 50));
    const { records, total } = await auditService().list({ page,pageSize,
      search: String(req.query.search || ''),action: String(req.query.action || ''),
      from: String(req.query.from || ''),to: String(req.query.to || '') });
    res.json({ success: true, data: { records, pagination: { page,pageSize,total,totalPages: Math.ceil(total/pageSize) } } });
  } catch (error) { next(error); }
}
