import { auditService } from '../composition/management.js';
import { Request, Response, NextFunction } from 'express';
import { getDb } from '../database/connection.js';
import { visibilitySql } from '../infrastructure/repositories/exclusion-repository.js';
import { AuthorizationError } from '../errors/app-error.js';
import { exportCvr4mToResponse } from '../modules/export/cvr-excel-export.js';

export async function getCvr4mRecordsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(500, Math.max(10, parseInt(req.query.pageSize as string) || 50));
    const offset = (page - 1) * pageSize;

    const { date, fromDate, toDate, startDate, endDate, shift, machine, matchStatus, search } = req.query;

    const excluded = req.query.visibility === 'excluded';
    if (excluded && !req.user!.permissions.includes('cvr4m:manage')) throw new AuthorizationError();
    const conditions: string[] = [visibilitySql('cvr4m',excluded)];
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

    const whereClause = conditions.join(' AND ');

    // Total count query
    const countRes = await db.execute({
      sql: `SELECT COUNT(*) as total FROM cvr4m_records WHERE ${whereClause};`,
      args
    });
    const total = Number(countRes.rows[0]?.total || 0);

    // Data query
    const dataRes = await db.execute({
      sql: `SELECT * FROM cvr4m_records 
            WHERE ${whereClause} 
            ORDER BY start_time DESC 
            LIMIT ? OFFSET ?;`,
      args: [...args, pageSize, offset]
    });

    res.json({
      success: true,
      data: {
        records: dataRes.rows,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getCvr4mStatsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();

    const [cvrStats, topMachines, failedFileStats] = await Promise.all([
      db.execute(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN match_status = 'MATCHED' THEN 1 ELSE 0 END) as matched,
          SUM(CASE WHEN match_status != 'MATCHED' THEN 1 ELSE 0 END) as unmatched,
          COALESCE(SUM(total_pattern_ng), 0) as totalNg,
          COALESCE(AVG(ng_rate), 0) as avgNgRate,
          COALESCE(SUM(total_sheet_vrf), 0) as totalSheetsVrf
        FROM cvr4m_records WHERE ${visibilitySql('cvr4m')};
      `),
      db.execute(`
        SELECT machine, COUNT(*) as count, COALESCE(SUM(total_pattern_ng), 0) as totalNg
        FROM cvr4m_records 
        WHERE ${visibilitySql('cvr4m')} AND machine IS NOT NULL AND machine != ''
        GROUP BY machine
        ORDER BY count DESC
        LIMIT 5;
      `),
      db.execute(`
        SELECT COUNT(*) as failedCount, GROUP_CONCAT(file_name, ', ') as failedNames
        FROM source_files WHERE status = 'FAILED';
      `)
    ]);

    const s = cvrStats.rows[0] as any;

    res.json({
      success: true,
      data: {
        total: Number(s?.total || 0),
        matched: Number(s?.matched || 0),
        unmatched: Number(s?.unmatched || 0),
        failedFiles: Number(failedFileStats.rows[0]?.failedCount || 0),
        failedFileNames: (failedFileStats.rows[0]?.failedNames as string | null) || null,
        totalNg: Number(s?.totalNg || 0),
        avgNgRate: Number(Number(s?.avgNgRate || 0).toFixed(3)),
        totalSheetsVrf: Number(s?.totalSheetsVrf || 0),
        matchRate: s?.total ? Number(((Number(s.matched) / Number(s.total)) * 100).toFixed(1)) : 100,
        topMachines: topMachines.rows
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function exportCvr4mController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const { date, fromDate, toDate, startDate, endDate, shift, machine, matchStatus, search } = req.query;

    const conditions: string[] = [visibilitySql('cvr4m')];
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

    const whereClause = conditions.join(' AND ');

    const dataRes = await db.execute({
      sql: `SELECT * FROM cvr4m_records WHERE ${whereClause} ORDER BY start_time DESC LIMIT 10000;`,
      args
    });

    const user = (req as any).user;
    await auditService().operation({ actor: { id: req.user!.id,username: req.user!.username,ip: req.ip },
      action: 'EXPORT',resource: 'cvr4m',details: { filters: req.query } }, async () => {
      req.auditRecorded = true;
    await exportCvr4mToResponse(
      dataRes.rows as Array<Record<string, unknown>>,
      res,
      user?.id || 'anonymous',
      req.ip
    );
      return { recordCount: dataRes.rows.length };
    });
  } catch (err) {
    next(err);
  }
}
