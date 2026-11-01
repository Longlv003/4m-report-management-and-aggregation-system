import { createApp } from './app.js';
import { pathProvider } from './config/path-provider.js';
import { configurationProvider } from './config/configuration-provider.js';
import { logger } from './logging/logger.js';
import { runMigrations } from './database/migrations.js';
import { dbConnection } from './database/connection.js';
import { scannerEngine } from './modules/scanner/scanner-engine.js';
import { backupManager } from './modules/backup/backup-manager.js';

async function bootstrap() {
  // 1. Initialize Logger
  logger.init(pathProvider.getLogDir());
  logger.info('Starting Scan 4M Application Server...', { module: 'Bootstrap' });

  // 2. Run Database Migrations
  await runMigrations();

  // 3. Start Database Automated Backup
  backupManager.startPeriodicBackup();

  // Serve existing data immediately; network discovery must not delay the API.
  const app = createApp();
  const port = configurationProvider.getAppConfig().app.port || 4000;
  const displayUrl = `http://${process.env.SCAN4M_HOST_IP || 'localhost'}:${port}`;

  const server = app.listen(port, () => {
    logger.info(`Scan 4M Server is running at ${displayUrl}`, { module: 'Server', port });
    console.log(`\n======================================================`);
    console.log(`  SCAN 4M SERVER IS RUNNING AT: ${displayUrl} `);
    console.log(`======================================================\n`);
    if (configurationProvider.getScannerConfig().scanner.enabled) scannerEngine.scanOnce().then(initialScan => {
      logger.info('Initial file scan completed', { module: 'Bootstrap', ...initialScan });
    }).catch(err => {
      logger.error('Initial scan encountered error', { module: 'Bootstrap', err });
    });
    scannerEngine.startPeriodicScan();
  });

  // Graceful Shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`, { module: 'Server' });
    backupManager.stopPeriodicBackup();
    scannerEngine.stopPeriodicScan();
    server.close(async () => {
      await dbConnection.close();
      logger.info('Server closed. Goodbye!', { module: 'Server' });
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch(err => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
