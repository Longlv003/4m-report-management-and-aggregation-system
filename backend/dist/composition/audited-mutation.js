"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditedMutation = auditedMutation;
const transaction_js_1 = require("../database/transaction.js");
const audit_repository_js_1 = require("../infrastructure/repositories/audit-repository.js");
const audited_change_js_1 = require("../application/audited-change.js");
const mutation_snapshot_repository_js_1 = require("../infrastructure/repositories/mutation-snapshot-repository.js");
// Adapter for existing CRUD handlers: the change and its audit entry use one transaction.
async function auditedMutation(actor, resource, action, targetId, work) {
    return (0, transaction_js_1.withWriteTransaction)(async (tx) => {
        return new audited_change_js_1.AuditedChangeService(new audit_repository_js_1.SqlAuditRepository(tx), new mutation_snapshot_repository_js_1.SqlMutationSnapshotRepository(tx))
            .run(actor, resource, action, targetId, () => work(tx));
    });
}
