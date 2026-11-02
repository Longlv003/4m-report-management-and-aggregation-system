"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordVisibilityController = recordVisibilityController;
exports.getAuditController = getAuditController;
const management_js_1 = require("../composition/management.js");
const sse_manager_js_1 = require("../modules/realtime/sse-manager.js");
const app_error_js_1 = require("../errors/app-error.js");
function recordVisibilityController(report, excluded) {
    return async (req, res, next) => {
        try {
            const reason = req.body.reason ?? '';
            if (typeof reason !== 'string')
                throw new app_error_js_1.ValidationError('Lý do phải là chuỗi');
            const data = await management_js_1.recordManagement.setExcluded(report, req.params.id, excluded, reason, { id: req.user.id, username: req.user.username, ip: req.clientIp });
            req.auditRecorded = true;
            sse_manager_js_1.sseManager.broadcast({ event: 'record_updated', data: { report, ...data } });
            res.json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    };
}
async function getAuditController(req, res, next) {
    try {
        const page = Math.max(1, Number.parseInt(String(req.query.page)) || 1);
        const pageSize = Math.min(200, Math.max(10, Number.parseInt(String(req.query.pageSize)) || 50));
        const { records, total } = await (0, management_js_1.auditService)().list({ page, pageSize,
            search: String(req.query.search || ''), action: String(req.query.action || ''),
            from: String(req.query.from || ''), to: String(req.query.to || '') });
        res.json({ success: true, data: { records, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } } });
    }
    catch (error) {
        next(error);
    }
}
