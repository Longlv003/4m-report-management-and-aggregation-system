"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_js_1 = require("./app.js");
const path_provider_js_1 = require("./config/path-provider.js");
const configuration_provider_js_1 = require("./config/configuration-provider.js");
const logger_js_1 = require("./logging/logger.js");
const migrations_js_1 = require("./database/migrations.js");
const connection_js_1 = require("./database/connection.js");
const scanner_engine_js_1 = require("./modules/scanner/scanner-engine.js");
const backup_manager_js_1 = require("./modules/backup/backup-manager.js");
async function bootstrap() {
    // 1. Initialize Logger
    logger_js_1.logger.init(path_provider_js_1.pathProvider.getLogDir());
    logger_js_1.logger.info('Starting Scan 4M Application Server...', { module: 'Bootstrap' });
    // 2. Run Database Migrations
    await (0, migrations_js_1.runMigrations)();
    // 3. Start Database Automated Backup
    backup_manager_js_1.backupManager.startPeriodicBackup();
    // Serve existing data immediately; network discovery must not delay the API.
    const app = (0, app_js_1.createApp)();
    const port = configuration_provider_js_1.configurationProvider.getAppConfig().app.port || 4000;
    const server = app.listen(port, () => {
        logger_js_1.logger.info(`Scan 4M Server is running at http://localhost:${port}`, { module: 'Server', port });
        console.log(`\n======================================================`);
        console.log(`  SCAN 4M SERVER IS RUNNING AT: http://localhost:${port} `);
        console.log(`======================================================\n`);
        if (configuration_provider_js_1.configurationProvider.getScannerConfig().scanner.enabled)
            scanner_engine_js_1.scannerEngine.scanOnce().then(initialScan => {
                logger_js_1.logger.info('Initial file scan completed', { module: 'Bootstrap', ...initialScan });
            }).catch(err => {
                logger_js_1.logger.error('Initial scan encountered error', { module: 'Bootstrap', err });
            });
        scanner_engine_js_1.scannerEngine.startPeriodicScan();
    });
    // Graceful Shutdown
    const shutdown = async (signal) => {
        logger_js_1.logger.info(`Received ${signal}. Shutting down gracefully...`, { module: 'Server' });
        backup_manager_js_1.backupManager.stopPeriodicBackup();
        scanner_engine_js_1.scannerEngine.stopPeriodicScan();
        server.close(async () => {
            await connection_js_1.dbConnection.close();
            logger_js_1.logger.info('Server closed. Goodbye!', { module: 'Server' });
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
