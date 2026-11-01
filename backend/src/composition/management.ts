import { getDb } from '../database/connection.js';
import { withWriteTransaction } from '../database/transaction.js';
import { SqlAuditRepository } from '../infrastructure/repositories/audit-repository.js';
import { SqlExclusionRepository } from '../infrastructure/repositories/exclusion-repository.js';
import { AuditService } from '../application/audit-service.js';
import { RecordManagementService } from '../application/record-management.js';
export const auditService = () => new AuditService({
  append: entry => withWriteTransaction(tx => new SqlAuditRepository(tx).append(entry)),
  complete: (id,outcome,details) => withWriteTransaction(tx => new SqlAuditRepository(tx).complete(id,outcome,details)),
  list: filter => new SqlAuditRepository(getDb()).list(filter)
});
export const recordManagement = new RecordManagementService({
  run: work => withWriteTransaction(tx => work({ audit: new SqlAuditRepository(tx), exclusions: new SqlExclusionRepository(tx) }))
});
