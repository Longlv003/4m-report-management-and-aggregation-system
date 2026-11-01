"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = exports.dbConnection = void 0;
const client_1 = require("@libsql/client");
const path_provider_js_1 = require("../config/path-provider.js");
const logger_js_1 = require("../logging/logger.js");
const app_error_js_1 = require("../errors/app-error.js");
class DatabaseConnection {
    static instance = null;
    client = null;
    constructor() { }
    static getInstance() {
        if (!DatabaseConnection.instance) {
            DatabaseConnection.instance = new DatabaseConnection();
        }
        return DatabaseConnection.instance;
    }
    getClient() {
        if (!this.client) {
            const dbFile = path_provider_js_1.pathProvider.getDatabaseFile();
            try {
                // file: URL protocol for local SQLite database
                const url = process.env.APP_DATABASE_URL || `file:${dbFile.replace(/\\/g, '/')}`;
                logger_js_1.logger.info(`Connecting to SQLite database: ${url}`, { module: 'Database' });
                this.client = (0, client_1.createClient)({ url });
            }
            catch (err) {
                throw new app_error_js_1.DatabaseError(`Failed to connect to SQLite database: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        return this.client;
    }
    async close() {
        if (this.client) {
            await this.client.close();
            this.client = null;
            logger_js_1.logger.info('Database connection closed gracefully', { module: 'Database' });
        }
    }
}
exports.dbConnection = DatabaseConnection.getInstance();
const getDb = () => exports.dbConnection.getClient();
exports.getDb = getDb;
