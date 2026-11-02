"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCvr4mRecordsController = getCvr4mRecordsController;
exports.getCvr4mStatsController = getCvr4mStatsController;
exports.exportCvr4mController = exportCvr4mController;
const report_query_js_1 = require("../application/report-query.js");
const report_filters_js_1 = require("../infrastructure/repositories/report-filters.js");
const management_js_1 = require("../composition/management.js");
const connection_js_1 = require("../database/connection.js");
const exclusion_repository_js_1 = require("../infrastructure/repositories/exclusion-repository.js");
const app_error_js_1 = require("../errors/app-error.js");
const cvr_excel_export_js_1 = require("../modules/export/cvr-excel-export.js");
async function getCvr4mRecordsController(req, res, next) {
    try {
        const db = (0, connection_js_1.getDb)();
        const { date, fromDate, toDate, startDate, endDate, shift, machine, matchStatus, search } = req.query;
        const excluded = req.query.visibility === 'excluded';
        if (excluded && !req.user.permissions.includes('cvr4m:manage'))
            throw new app_error_js_1.AuthorizationError();
        const conditions = [(0, exclusion_repository_js_1.visibilitySql)('cvr4m', excluded)];
        const args = [];
        const from = (fromDate || startDate);
        const to = (toDate || endDate);
        if (from && to) {
            conditions.push('date >= ? AND date <= ?');
            args.push(from, to);
        }
        else if (from) {
            conditions.push('date >= ?');
            args.push(from);
        }
        else if (to) {
            conditions.push('date <= ?');
            args.push(to);
        }
        else if (date) {
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
        (0, report_filters_js_1.appendItemFilters)(req.query, conditions, args);
        const whereClause = conditions.join(' AND ');
        // Total count query
        const countRes = await db.execute({
            sql: `SELECT COUNT(*) as total FROM cvr4m_records WHERE ${whereClause};`,
            args
        });
        const total = Number(countRes.rows[0]?.total || 0);
        const { page, pageSize, limit, offset, totalPages } = (0, report_query_js_1.reportPagination)(req.query, total);
        // Data query
        const dataRes = await db.execute({
            sql: `SELECT * FROM cvr4m_records 
            WHERE ${whereClause} 
            ORDER BY ${report_filters_js_1.REPORT_ORDER_BY}
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
    }
    catch (err) {
        next(err);
    }
}
async function getCvr4mStatsController(req, res, next) {
    try {
        const db = (0, connection_js_1.getDb)();
        const [cvrStats, topMachines, failedFileStats] = await Promise.all([
            db.execute(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN match_status = 'MATCHED' THEN 1 ELSE 0 END) as matched,
          SUM(CASE WHEN match_status != 'MATCHED' THEN 1 ELSE 0 END) as unmatched,
          COALESCE(SUM(total_pattern_ng), 0) as totalNg,
          COALESCE(AVG(ng_rate), 0) as avgNgRate,
          COALESCE(SUM(total_sheet_vrf), 0) as totalSheetsVrf
        FROM cvr4m_records WHERE ${(0, exclusion_repository_js_1.visibilitySql)('cvr4m')};
      `),
            db.execute(`
        SELECT machine, COUNT(*) as count, COALESCE(SUM(total_pattern_ng), 0) as totalNg
        FROM cvr4m_records 
        WHERE ${(0, exclusion_repository_js_1.visibilitySql)('cvr4m')} AND machine IS NOT NULL AND machine != ''
        GROUP BY machine
        ORDER BY count DESC
        LIMIT 5;
      `),
            db.execute(`
        SELECT COUNT(*) as failedCount, GROUP_CONCAT(file_name, ', ') as failedNames
        FROM source_files WHERE status = 'FAILED';
      `)
        ]);
        const s = cvrStats.rows[0];
        res.json({
            success: true,
            data: {
                total: Number(s?.total || 0),
                matched: Number(s?.matched || 0),
                unmatched: Number(s?.unmatched || 0),
                failedFiles: Number(failedFileStats.rows[0]?.failedCount || 0),
                failedFileNames: failedFileStats.rows[0]?.failedNames || null,
                totalNg: Number(s?.totalNg || 0),
                avgNgRate: Number(Number(s?.avgNgRate || 0).toFixed(3)),
                totalSheetsVrf: Number(s?.totalSheetsVrf || 0),
                matchRate: s?.total ? Number(((Number(s.matched) / Number(s.total)) * 100).toFixed(1)) : 100,
                topMachines: topMachines.rows
            }
        });
    }
    catch (err) {
        next(err);
    }
}
async function exportCvr4mController(req, res, next) {
    try {
        const db = (0, connection_js_1.getDb)();
        const { date, fromDate, toDate, startDate, endDate, shift, machine, matchStatus, search } = req.query;
        const conditions = [(0, exclusion_repository_js_1.visibilitySql)('cvr4m')];
        const args = [];
        const from = (fromDate || startDate);
        const to = (toDate || endDate);
        if (from && to) {
            conditions.push('date >= ? AND date <= ?');
            args.push(from, to);
        }
        else if (from) {
            conditions.push('date >= ?');
            args.push(from);
        }
        else if (to) {
            conditions.push('date <= ?');
            args.push(to);
        }
        else if (date) {
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
        (0, report_filters_js_1.appendItemFilters)(req.query, conditions, args);
        const whereClause = conditions.join(' AND ');
        const dataRes = await db.execute({
            sql: `SELECT * FROM cvr4m_records WHERE ${whereClause} ORDER BY ${report_filters_js_1.REPORT_ORDER_BY} LIMIT 10000;`,
            args
        });
        const user = req.user;
        await (0, management_js_1.auditService)().operation({ actor: { id: req.user.id, username: req.user.username, ip: req.clientIp },
            action: 'EXPORT', resource: 'cvr4m', details: { filters: req.query } }, async () => {
            req.auditRecorded = true;
            await (0, cvr_excel_export_js_1.exportCvr4mToResponse)(dataRes.rows, res, user?.id || 'anonymous', req.clientIp);
            return { recordCount: dataRes.rows.length };
        });
    }
    catch (err) {
        next(err);
    }
}
