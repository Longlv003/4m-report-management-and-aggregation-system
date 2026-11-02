"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRouter = void 0;
const scanner_engine_js_1 = require("../modules/scanner/scanner-engine.js");
const express_1 = require("express");
const management_controller_js_1 = require("../controllers/management.controller.js");
const auth_controller_js_1 = require("../controllers/auth.controller.js");
const scan4m_controller_js_1 = require("../controllers/scan4m.controller.js");
const cvr4m_controller_js_1 = require("../controllers/cvr4m.controller.js");
const account_controller_js_1 = require("../controllers/account.controller.js");
const mapping_controller_js_1 = require("../controllers/mapping.controller.js");
const auth_middleware_js_1 = require("../middlewares/auth.middleware.js");
const sse_manager_js_1 = require("../modules/realtime/sse-manager.js");
exports.apiRouter = (0, express_1.Router)();
// --- Auth Routes ---
exports.apiRouter.post('/auth/login', auth_controller_js_1.loginController);
exports.apiRouter.post('/auth/logout', auth_middleware_js_1.authMiddleware, auth_controller_js_1.logoutController);
exports.apiRouter.get('/auth/me', auth_middleware_js_1.authMiddleware, auth_controller_js_1.getMeController);
exports.apiRouter.post('/auth/change-password', auth_middleware_js_1.authMiddleware, auth_controller_js_1.changePasswordController);
// --- Scan 4M Tab 1 Routes ---
exports.apiRouter.get('/scan4m/records', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('scan4m:view'), scan4m_controller_js_1.getScan4mRecordsController);
exports.apiRouter.get('/scan4m/stats', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('scan4m:view'), scan4m_controller_js_1.getDashboardStatsController);
exports.apiRouter.post('/scan4m/trigger-scan', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('config:manage'), scan4m_controller_js_1.triggerScanController);
exports.apiRouter.get('/scan4m/export', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('scan4m:export'), scan4m_controller_js_1.exportScan4mController);
// --- CVR 4M Tab 2 Routes ---
exports.apiRouter.get('/cvr4m/records', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('cvr4m:view'), cvr4m_controller_js_1.getCvr4mRecordsController);
exports.apiRouter.get('/cvr4m/stats', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('cvr4m:view'), cvr4m_controller_js_1.getCvr4mStatsController);
exports.apiRouter.get('/cvr4m/export', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('cvr4m:export'), cvr4m_controller_js_1.exportCvr4mController);
// --- Account Management (Admin only) ---
exports.apiRouter.get('/accounts', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('accounts:manage'), account_controller_js_1.getAccountsController);
exports.apiRouter.post('/accounts', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('accounts:manage'), account_controller_js_1.createAccountController);
exports.apiRouter.put('/accounts/:id', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('accounts:manage'), account_controller_js_1.updateAccountController);
exports.apiRouter.patch('/accounts/:id/toggle', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('accounts:manage'), account_controller_js_1.toggleAccountActiveController);
exports.apiRouter.post('/accounts/:id/reset-password', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('accounts:manage'), account_controller_js_1.resetPasswordController);
// --- Item Mapping (view: mapping:view, manage: mapping:manage) ---
exports.apiRouter.get('/mapping', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('mapping:view'), mapping_controller_js_1.getMappingsController);
exports.apiRouter.post('/mapping', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('mapping:manage'), mapping_controller_js_1.createMappingController);
exports.apiRouter.put('/mapping/:id', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('mapping:manage'), mapping_controller_js_1.updateMappingController);
exports.apiRouter.delete('/mapping/:id', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('mapping:manage'), mapping_controller_js_1.softDeleteMappingController);
exports.apiRouter.post('/mapping/:id/restore', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('mapping:manage'), mapping_controller_js_1.restoreMappingController);
exports.apiRouter.get('/audit', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)('audit:view'), management_controller_js_1.getAuditController);
for (const report of ['scan4m', 'cvr4m']) {
    exports.apiRouter.post('/' + report + '/records/:id/exclude', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)(report + ':manage'), (0, management_controller_js_1.recordVisibilityController)(report, true));
    exports.apiRouter.post('/' + report + '/records/:id/restore', auth_middleware_js_1.authMiddleware, (0, auth_middleware_js_1.requirePermission)(report + ':manage'), (0, management_controller_js_1.recordVisibilityController)(report, false));
}
// --- Realtime SSE Route ---
exports.apiRouter.get('/realtime/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    sse_manager_js_1.sseManager.addClient(res);
    res.write(`event: scanner_status\ndata: ${JSON.stringify(scanner_engine_js_1.scannerEngine.getStatus())}\n\n`);
});
