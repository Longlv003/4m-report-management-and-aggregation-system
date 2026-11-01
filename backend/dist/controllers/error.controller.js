"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getErrorsController = getErrorsController;
const connection_js_1 = require("../database/connection.js");
async function getErrorsController(req, res, next) {
    try {
        const db = (0, connection_js_1.getDb)();
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const pageSize = Math.min(500, Math.max(10, parseInt(req.query.pageSize) || 50));
        const offset = (page - 1) * pageSize;
        const { errorType } = req.query;
        const conditions = ['1=1'];
        const args = [];
        if (errorType) {
            conditions.push('error_type = ?');
            args.push(errorType);
        }
        const whereClause = conditions.join(' AND ');
        const countRes = await db.execute({
            sql: `SELECT COUNT(*) as total FROM import_errors WHERE ${whereClause};`,
            args
        });
        const total = Number(countRes.rows[0]?.total || 0);
        const errorsRes = await db.execute({
            sql: `SELECT e.*, f.file_name, f.source_system 
            FROM import_errors e
            LEFT JOIN source_files f ON e.file_id = f.id
            WHERE ${whereClause} 
            ORDER BY e.created_at DESC 
            LIMIT ? OFFSET ?;`,
            args: [...args, pageSize, offset]
        });
        res.json({
            success: true,
            data: {
                errors: errorsRes.rows,
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages: Math.ceil(total / pageSize)
                }
            }
        });
    }
    catch (err) {
        next(err);
    }
}
