import { createClient, Client } from '@libsql/client';
import { pathProvider } from '../config/path-provider.js';
import { logger } from '../logging/logger.js';
import { DatabaseError } from '../errors/app-error.js';

class DatabaseConnection {
  private static instance: DatabaseConnection | null = null;
  private client: Client | null = null;

  private constructor() {}

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public getClient(): Client {
    if (!this.client) {
      const dbFile = pathProvider.getDatabaseFile();
      try {
        // file: URL protocol for local SQLite database
        const url = process.env.APP_DATABASE_URL || `file:${dbFile.replace(/\\/g, '/')}`;
        logger.info(`Connecting to SQLite database: ${url}`, { module: 'Database' });
        this.client = createClient({ url });
      } catch (err) {
        throw new DatabaseError(`Failed to connect to SQLite database: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return this.client;
  }

  public async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      logger.info('Database connection closed gracefully', { module: 'Database' });
    }
  }
}

export const dbConnection = DatabaseConnection.getInstance();
export const getDb = () => dbConnection.getClient();
