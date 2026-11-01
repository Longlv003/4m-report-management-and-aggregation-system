import fs from 'fs';
import path from 'path';
import { pathProvider } from '../../config/path-provider.js';
import { configurationProvider } from '../../config/configuration-provider.js';
import { logger } from '../../logging/logger.js';

export class BackupManager {
  private timer: NodeJS.Timeout | null = null;

  public createBackup(): { success: boolean; backupFile?: string; error?: string } {
    try {
      const dbFile = pathProvider.getDatabaseFile();
      const backupDir = pathProvider.getBackupDir();

      if (!fs.existsSync(dbFile)) {
        logger.warn(`Database file does not exist, skipping backup: ${dbFile}`, { module: 'BackupManager' });
        return { success: false, error: 'Database file not found' };
      }

      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const backupFileName = `4m_aom_report_${timestamp}.sqlite`;
      const targetPath = path.join(backupDir, backupFileName);

      fs.copyFileSync(dbFile, targetPath);
      const stat = fs.statSync(targetPath);

      logger.info(`Database backup created successfully: ${backupFileName} (${(stat.size / 1024).toFixed(1)} KB)`, {
        module: 'BackupManager',
        backupFileName,
        fileSize: stat.size
      });

      // Enforce retention limit (max 30 copies)
      this.enforceRetention(backupDir);

      return { success: true, backupFile: targetPath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Database backup failed: ${msg}`, { module: 'BackupManager', err });
      return { success: false, error: msg };
    }
  }

  private enforceRetention(backupDir: string): void {
    try {
      const cfg = configurationProvider.getScannerConfig().scanner.backup;
      const maxRetention = cfg?.maxRetentionCopies || 30;

      const files = fs.readdirSync(backupDir)
        .filter(f => (f.startsWith('4m_aom_report_') || f.startsWith('scan4m_')) && f.endsWith('.sqlite'))
        .map(f => {
          const filePath = path.join(backupDir, f);
          const stat = fs.statSync(filePath);
          return { name: f, path: filePath, mtime: stat.mtimeMs };
        })
        .sort((a, b) => a.mtime - b.mtime); // Oldest first

      if (files.length > maxRetention) {
        const toDeleteCount = files.length - maxRetention;
        const toDelete = files.slice(0, toDeleteCount);

        for (const item of toDelete) {
          try {
            fs.unlinkSync(item.path);
            logger.info(`Retention cleanup: deleted old backup ${item.name}`, { module: 'BackupManager' });
          } catch (delErr) {
            logger.warn(`Failed to delete old backup file: ${item.name}`, { module: 'BackupManager', delErr });
          }
        }
      }
    } catch (err) {
      logger.error(`Error enforcing backup retention: ${err instanceof Error ? err.message : String(err)}`, {
        module: 'BackupManager'
      });
    }
  }

  public startPeriodicBackup(): void {
    const cfg = configurationProvider.getScannerConfig().scanner.backup;
    if (!cfg || !cfg.enabled) {
      logger.info('Periodic SQLite backup is disabled in configuration.', { module: 'BackupManager' });
      return;
    }

    const intervalMs = (cfg.intervalHours || 24) * 60 * 60 * 1000;
    logger.info(`Starting periodic backup: interval ${cfg.intervalHours}h, retention max ${cfg.maxRetentionCopies || 30} copies.`, {
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

  public stopPeriodicBackup(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Periodic backup stopped.', { module: 'BackupManager' });
    }
  }
}

export const backupManager = new BackupManager();
