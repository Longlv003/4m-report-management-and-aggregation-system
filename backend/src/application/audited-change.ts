import { Actor, AuditRepository, MutationResource, MutationSnapshotRepository } from '../domain/report-management.js';

export class AuditedChangeService {
  constructor(private readonly audit: AuditRepository, private readonly snapshots: MutationSnapshotRepository) {}
  async run<T>(actor: Actor, resource: MutationResource, action: string, targetId: string | undefined, work: () => Promise<T>): Promise<T> {
    const before = await this.snapshots.read(resource,targetId);
    const result = await work();
    const after = await this.snapshots.read(resource,targetId);
    const changedBefore = before.filter(row => !after.some(item => JSON.stringify(item) === JSON.stringify(row)));
    const changedAfter = after.filter(row => !before.some(item => JSON.stringify(item) === JSON.stringify(row)));
    if (resource === 'item_mapping' && action === 'CREATE' && changedBefore.some(row =>
      row && typeof row === 'object' && 'is_deleted' in row && row.is_deleted === 1)) action = 'RESTORE';
    await this.audit.append({ actor,resource,action,outcome: 'SUCCESS',
      details: { targetId, before: changedBefore, after: changedAfter } });
    return result;
  }
}
