import { Client, Transaction } from '@libsql/client';
import { getDb } from './connection.js';

// SQLite has one writer. Queue application transactions while file discovery runs concurrently.
let writer: Promise<unknown> = Promise.resolve();
export function withWriteTransaction<T>(work: (tx: Transaction) => Promise<T>, db: Client = getDb()): Promise<T> {
  const result = writer.then(async () => {
    const tx = await db.transaction('write');
    try {
      const value = await work(tx);
      await tx.commit();
      return value;
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  });
  writer = result.catch(() => undefined);
  return result;
}
