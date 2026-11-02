import { reportPagination } from '../application/report-query.js';
import { appendItemFilters, REPORT_ORDER_BY } from '../infrastructure/repositories/report-filters.js';
import { auditService } from '../composition/management.js';
import { Request, Response, NextFunction } from 'express';
import { getDb } from '../database/connection.js';
import { visibilitySql } from '../infrastructure/repositories/exclusion-repository.js';
import { AuthorizationError } from '../errors/app-error.js';
import { exportScan4mToResponse } from '../modules/export/scan-excel-export.js';
import { scannerEngine } from '../modules/scanner/scanner-engine.js';

export async function getScan4mRecordsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const { date, fromDate, toDate, startDate, endDate, shift, machine, matchStatus, search } = req.query;

    const excluded = req.query.visibility === 'excluded';
    if (excluded && !req.user!.permissions.includes('scan4m:manage')) throw new AuthorizationError();
    const conditions: string[] = [visibilitySql('scan4m',excluded)];
    const args: any[] = [];

    const from = (fromDate || startDate) as string | undefined;
    const to = (toDate || endDate) as string | undefined;

    if (from && to) {
      conditions.push('date >= ? AND date <= ?');
      args.push(from, to);
    } else if (from) {
      conditions.push('date >= ?');
      args.push(from);
    } else if (to) {
      conditions.push('date <= ?');
      args.push(to);
    } else if (date) {
      conditions.push('date = ?');
      args.push(date);
    }
    if (shift) {
      conditions.push('shift = ?');
      args.push(shift);
    }
    if (machine) {
      conditions.push('machine LIKE ?');
      args.push(`%${machine}%`);
    }
    if (matchStatus) {
      conditions.push('match_status = ?');
      args.push(matchStatus);
    }
    if (search) {
      conditions.push('(item_code LIKE ? OR lot_no LIKE ? OR item_name LIKE ? OR program_name LIKE ?)');
      const s = `%${search}%`;
      args.push(s, s, s, s);
    }

    appendItemFilters(req.query, conditions, args);
    const whereClause = conditions.join(' AND ');

    // Total count query
    const countRes = await db.execute({
      sql: `SELECT COUNT(*) as total FROM scan4m_records WHERE ${whereClause};`,
      args
    });
    const total = Number(countRes.rows[0]?.total || 0);
    const { page, pageSize, limit, offset, totalPages } = reportPagination(req.query, total);

    // Data query
    const dataRes = await db.execute({
      sql: `SELECT * FROM scan4m_records 
            WHERE ${whereClause} 
            ORDER BY ${REPORT_ORDER_BY}
            LIMIT ? OFFSET ?;`,
      args: [...args, limit, offset]
    });

    res.json({
      success: true,
      data: {
        records: dataRes.rows,
        pagination: {
          page,
          pageSize,
          total,
          totalPages
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getDashboardStatsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();

    const [scanStats, failedFileStats, fileStats, lastFile] = await Promise.all([
      db.execute(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN match_status = 'MATCHED' THEN 1 ELSE 0 END) as matched,
          SUM(CASE WHEN match_status = 'UNMATCHED_PLUS' THEN 1 ELSE 0 END) as unmatched,
          SUM(CASE WHEN anomaly_flag IS NOT NULL THEN 1 ELSE 0 END) as anomalies
        FROM scan4m_records WHERE ${visibilitySql('scan4m')};
      `),
      db.execute(`
        SELECT COUNT(*) as failedCount, GROUP_CONCAT(file_name, ', ') as failedNames
        FROM source_files WHERE status = 'FAILED';
      `),
      db.execute(`SELECT COUNT(*) as fileCount FROM source_files WHERE status = 'SUCCESS';`),
      db.execute(`SELECT MAX(processed_at) as lastScanTime FROM source_files;`)
    ]);

    const s = scanStats.rows[0];
    const ff = failedFileStats.rows[0];
    res.json({
      success: true,
      data: {
        totalRecords: Number(s?.total || 0),
        matchedRecords: Number(s?.matched || 0),
        unmatchedRecords: Number(s?.unmatched || 0),
        anomalyRecords: Number(s?.anomalies || 0),
        failedFiles: Number(ff?.failedCount || 0),
        failedFileNames: (ff?.failedNames as string | null) || null,
        processedFiles: Number(fileStats.rows[0]?.fileCount || 0),
        lastScanTime: lastFile.rows[0]?.lastScanTime || null
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function triggerScanController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await auditService().operation({ actor: { id: req.user!.id,username: req.user!.username,ip: req.clientIp },
      action: 'MANUAL_SCAN',resource: 'scanner' }, async () => {
        req.auditRecorded = true;
        return scannerEngine.scanOnce();
      });
    res.json({
      success: true,
      message: result.skipped ? 'Hệ thống đang quét; yêu cầu này không tạo lượt quét mới' : `Quét dữ liệu hoàn tất: Đã xử lý ${result.filesProcessed} file, bỏ qua ${result.filesSkipped || 0} file, ${result.errors} lỗi`,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function exportScan4mController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const { date, fromDate, toDate, startDate, endDate, shift, machine, matchStatus, search } = req.query;

    const conditions: string[] = [visibilitySql('scan4m')];
    const args: any[] = [];

    const from = (fromDate || startDate) as string | undefined;
    const to = (toDate || endDate) as string | undefined;

    if (from && to) {
      conditions.push('date >= ? AND date <= ?');
      args.push(from, to);
    } else if (from) {
      conditions.push('date >= ?');
      args.push(from);
    } else if (to) {
      conditions.push('date <= ?');
      args.push(to);
    } else if (date) {
      conditions.push('date = ?');
      args.push(date);
    }
    if (shift) {
      conditions.push('shift = ?');
      args.push(shift);
    }
    if (machine) {
      conditions.push('machine LIKE ?');
      args.push(`%${machine}%`);
    }
    if (matchStatus) {
      conditions.push('match_status = ?');
      args.push(matchStatus);
    }
    if (search) {
      conditions.push('(item_code LIKE ? OR lot_no LIKE ? OR item_name LIKE ? OR program_name LIKE ?)');
      const s = `%${search}%`;
      args.push(s, s, s, s);
    }

    appendItemFilters(req.query, conditions, args);
    const whereClause = conditions.join(' AND ');

    const records = await db.execute({
      sql: `SELECT * FROM scan4m_records WHERE ${whereClause} ORDER BY ${REPORT_ORDER_BY};`,
      args
    });

    await auditService().operation({ actor: { id: req.user!.id,username: req.user!.username,ip: req.clientIp },
      action: 'EXPORT',resource: 'scan4m',details: { filters: req.query } }, async () => {
      req.auditRecorded = true;
    await exportScan4mToResponse(
      records.rows as any,
      res,
      req.user!.id,
      req.clientIp
    );
      return { recordCount: records.rows.length };
    });
  } catch (err) {
    next(err);
  }
}
