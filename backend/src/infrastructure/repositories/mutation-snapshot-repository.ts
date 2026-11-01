import { Client } from '@libsql/client';
import { redact } from './audit-repository.js';
import { MutationSnapshotRepository } from '../../domain/report-management.js';

export class SqlMutationSnapshotRepository implements MutationSnapshotRepository {
  constructor(private readonly db: Pick<Client,'execute'>) {}
  async read(resource: 'accounts' | 'item_mapping' | 'password', targetId?: string) {
    const table = resource === 'item_mapping' ? 'item_mapping' : 'accounts';
    const result = await this.db.execute({ sql: `SELECT * FROM ${table}` + (targetId ? ' WHERE id=?' : ''), args: targetId ? [targetId] : [] });
    return result.rows.map(row => redact(row));
  }
}
