"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backupManager = exports.BackupManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const path_provider_js_1 = require("../../config/path-provider.js");
const configuration_provider_js_1 = require("../../config/configuration-provider.js");
const logger_js_1 = require("../../logging/logger.js");
class BackupManager {
    timer = null;
    createBackup() {
        try {
            const dbFile = path_provider_js_1.pathProvider.getDatabaseFile();
            const backupDir = path_provider_js_1.pathProvider.getBackupDir();
            if (!fs_1.default.existsSync(dbFile)) {
                logger_js_1.logger.warn(`Database file does not exist, skipping backup: ${dbFile}`, { module: 'BackupManager' });
                return { success: false, error: 'Database file not found' };
            }
            if (!fs_1.default.existsSync(backupDir)) {
                fs_1.default.mkdirSync(backupDir, { recursive: true });
            }
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
            const backupFileName = `4m_aom_report_${timestamp}.sqlite`;
            const targetPath = path_1.default.join(backupDir, backupFileName);
            fs_1.default.copyFileSync(dbFile, targetPath);
            const stat = fs_1.default.statSync(targetPath);
            logger_js_1.logger.info(`Database backup created successfully: ${backupFileName} (${(stat.size / 1024).toFixed(1)} KB)`, {
                module: 'BackupManager',
                backupFileName,
                fileSize: stat.size
            });
            // Enforce retention limit (max 30 copies)
            this.enforceRetention(backupDir);
            return { success: true, backupFile: targetPath };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_js_1.logger.error(`Database backup failed: ${msg}`, { module: 'BackupManager', err });
            return { success: false, error: msg };
        }
    }
    enforceRetention(backupDir) {
        try {
            const cfg = configuration_provider_js_1.configurationProvider.getScannerConfig().scanner.backup;
            const maxRetention = cfg?.maxRetentionCopies || 30;
            const files = fs_1.default.readdirSync(backupDir)
                .filter(f => (f.startsWith('4m_aom_report_') || f.startsWith('scan4m_')) && f.endsWith('.sqlite'))
                .map(f => {
                const filePath = path_1.default.join(backupDir, f);
                const stat = fs_1.default.statSync(filePath);
                return { name: f, path: filePath, mtime: stat.mtimeMs };
            })
                .sort((a, b) => a.mtime - b.mtime); // Oldest first
            if (files.length > maxRetention) {
                const toDeleteCount = files.length - maxRetention;
                const toDelete = files.slice(0, toDeleteCount);
                for (const item of toDelete) {
                    try {
                        fs_1.default.unlinkSync(item.path);
                        logger_js_1.logger.info(`Retention cleanup: deleted old backup ${item.name}`, { module: 'BackupManager' });
                    }
                    catch (delErr) {
                        logger_js_1.logger.warn(`Failed to delete old backup file: ${item.name}`, { module: 'BackupManager', delErr });
                    }
                }
            }
        }
        catch (err) {
            logger_js_1.logger.error(`Error enforcing backup retention: ${err instanceof Error ? err.message : String(err)}`, {
                module: 'BackupManager'
            });
        }
    }
    startPeriodicBackup() {
        const cfg = configuration_provider_js_1.configurationProvider.getScannerConfig().scanner.backup;
        if (!cfg || !cfg.enabled) {
            logger_js_1.logger.info('Periodic SQLite backup is disabled in configuration.', { module: 'BackupManager' });
            return;
        }
        const intervalMs = (cfg.intervalHours || 24) * 60 * 60 * 1000;
        logger_js_1.logger.info(`Starting periodic backup: interval ${cfg.intervalHours}h, retention max ${cfg.maxRetentionCopies || 30} copies.`, {
            module: 'BackupManager',
            intervalHours: cfg.intervalHours,
            maxRetentionCopies: cfg.maxRetentionCopies
        });
        // Create an initial backup on startup
        this.createBackup();
        this.timer = setInterval(() => {
            this.createBackup();
        }, intervalMs);
    }
    stopPeriodicBackup() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            logger_js_1.logger.info('Periodic backup stopped.', { module: 'BackupManager' });
        }
    }
}
exports.BackupManager = BackupManager;
exports.backupManager = new BackupManager();
