import { Client } from '@libsql/client';
import { Actor } from '../domain/report-management.js';
import { withWriteTransaction } from '../database/transaction.js';
import { SqlAuditRepository } from '../infrastructure/repositories/audit-repository.js';
import { AuditedChangeService } from '../application/audited-change.js';
import { SqlMutationSnapshotRepository } from '../infrastructure/repositories/mutation-snapshot-repository.js';

// Adapter for existing CRUD handlers: the change and its audit entry use one transaction.
export async function auditedMutation<T>(actor: Actor, resource: 'accounts' | 'item_mapping' | 'password', action: string,
  targetId: string | undefined, work: (db: Pick<Client,'execute'>) => Promise<T>): Promise<T> {
  return withWriteTransaction(async tx => {
    return new AuditedChangeService(new SqlAuditRepository(tx),new SqlMutationSnapshotRepository(tx))
      .run(actor,resource,action,targetId,() => work(tx));
  });
}
