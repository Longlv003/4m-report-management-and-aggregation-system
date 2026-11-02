import { scannerEngine } from '../modules/scanner/scanner-engine.js';
import { Router, Request, Response } from 'express';
import { getAuditController, recordVisibilityController } from '../controllers/management.controller.js';
import { loginController, getMeController, changePasswordController, logoutController } from '../controllers/auth.controller.js';
import {
  getScan4mRecordsController,
  getDashboardStatsController,
  triggerScanController,
  exportScan4mController
} from '../controllers/scan4m.controller.js';
import {
  getCvr4mRecordsController,
  getCvr4mStatsController,
  exportCvr4mController
} from '../controllers/cvr4m.controller.js';
import {
  getAccountsController,
  createAccountController,
  updateAccountController,
  toggleAccountActiveController,
  resetPasswordController
} from '../controllers/account.controller.js';
import {
  getMappingsController,
  createMappingController,
  updateMappingController,
  softDeleteMappingController,
  restoreMappingController
} from '../controllers/mapping.controller.js';
import { authMiddleware, requirePermission } from '../middlewares/auth.middleware.js';
import { sseManager } from '../modules/realtime/sse-manager.js';

export const apiRouter = Router();

// --- Auth Routes ---
apiRouter.post('/auth/login', loginController);
apiRouter.post('/auth/logout', authMiddleware, logoutController);
apiRouter.get('/auth/me', authMiddleware, getMeController);
apiRouter.post('/auth/change-password', authMiddleware, changePasswordController);

// --- Scan 4M Tab 1 Routes ---
apiRouter.get('/scan4m/records', authMiddleware, requirePermission('scan4m:view'), getScan4mRecordsController);
apiRouter.get('/scan4m/stats', authMiddleware, requirePermission('scan4m:view'), getDashboardStatsController);
apiRouter.post('/scan4m/trigger-scan', authMiddleware, requirePermission('config:manage'), triggerScanController);
apiRouter.get('/scan4m/export', authMiddleware, requirePermission('scan4m:export'), exportScan4mController);

// --- CVR 4M Tab 2 Routes ---
apiRouter.get('/cvr4m/records', authMiddleware, requirePermission('cvr4m:view'), getCvr4mRecordsController);
apiRouter.get('/cvr4m/stats', authMiddleware, requirePermission('cvr4m:view'), getCvr4mStatsController);
apiRouter.get('/cvr4m/export', authMiddleware, requirePermission('cvr4m:export'), exportCvr4mController);

// --- Account Management (Admin only) ---
apiRouter.get('/accounts', authMiddleware, requirePermission('accounts:manage'), getAccountsController);
apiRouter.post('/accounts', authMiddleware, requirePermission('accounts:manage'), createAccountController);
apiRouter.put('/accounts/:id', authMiddleware, requirePermission('accounts:manage'), updateAccountController);
apiRouter.patch('/accounts/:id/toggle', authMiddleware, requirePermission('accounts:manage'), toggleAccountActiveController);
apiRouter.post('/accounts/:id/reset-password', authMiddleware, requirePermission('accounts:manage'), resetPasswordController);

// --- Item Mapping (view: mapping:view, manage: mapping:manage) ---
apiRouter.get('/mapping', authMiddleware, requirePermission('mapping:view'), getMappingsController);
apiRouter.post('/mapping', authMiddleware, requirePermission('mapping:manage'), createMappingController);
apiRouter.put('/mapping/:id', authMiddleware, requirePermission('mapping:manage'), updateMappingController);
apiRouter.delete('/mapping/:id', authMiddleware, requirePermission('mapping:manage'), softDeleteMappingController);
apiRouter.post('/mapping/:id/restore', authMiddleware, requirePermission('mapping:manage'), restoreMappingController);

apiRouter.get('/audit', authMiddleware, requirePermission('audit:view'), getAuditController);
for (const report of ['scan4m', 'cvr4m'] as const) {
  apiRouter.post('/' + report + '/records/:id/exclude', authMiddleware, requirePermission(report + ':manage'), recordVisibilityController(report,true));
  apiRouter.post('/' + report + '/records/:id/restore', authMiddleware, requirePermission(report + ':manage'), recordVisibilityController(report,false));
}

// --- Realtime SSE Route ---
apiRouter.get('/realtime/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  sseManager.addClient(res);
  res.write(`event: scanner_status\ndata: ${JSON.stringify(scannerEngine.getStatus())}\n\n`);
});
