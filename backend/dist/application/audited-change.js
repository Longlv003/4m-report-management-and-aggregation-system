"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditedChangeService = void 0;
class AuditedChangeService {
    audit;
    snapshots;
    constructor(audit, snapshots) {
        this.audit = audit;
        this.snapshots = snapshots;
    }
    async run(actor, resource, action, targetId, work) {
        const before = await this.snapshots.read(resource, targetId);
        const result = await work();
        const after = await this.snapshots.read(resource, targetId);
        const changedBefore = before.filter(row => !after.some(item => JSON.stringify(item) === JSON.stringify(row)));
        const changedAfter = after.filter(row => !before.some(item => JSON.stringify(item) === JSON.stringify(row)));
        if (resource === 'item_mapping' && action === 'CREATE' && changedBefore.some(row => row && typeof row === 'object' && 'is_deleted' in row && row.is_deleted === 1))
            action = 'RESTORE';
        await this.audit.append({ actor, resource, action, outcome: 'SUCCESS',
            details: { targetId, before: changedBefore, after: changedAfter } });
        return result;
    }
}
exports.AuditedChangeService = AuditedChangeService;
