"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordManagement = exports.auditService = void 0;
const connection_js_1 = require("../database/connection.js");
const transaction_js_1 = require("../database/transaction.js");
const audit_repository_js_1 = require("../infrastructure/repositories/audit-repository.js");
const exclusion_repository_js_1 = require("../infrastructure/repositories/exclusion-repository.js");
const audit_service_js_1 = require("../application/audit-service.js");
const record_management_js_1 = require("../application/record-management.js");
const auditService = () => new audit_service_js_1.AuditService({
    append: entry => (0, transaction_js_1.withWriteTransaction)(tx => new audit_repository_js_1.SqlAuditRepository(tx).append(entry)),
    complete: (id, outcome, details) => (0, transaction_js_1.withWriteTransaction)(tx => new audit_repository_js_1.SqlAuditRepository(tx).complete(id, outcome, details)),
    list: filter => new audit_repository_js_1.SqlAuditRepository((0, connection_js_1.getDb)()).list(filter)
});
exports.auditService = auditService;
exports.recordManagement = new record_management_js_1.RecordManagementService({
    run: work => (0, transaction_js_1.withWriteTransaction)(tx => work({ audit: new audit_repository_js_1.SqlAuditRepository(tx), exclusions: new exclusion_repository_js_1.SqlExclusionRepository(tx) }))
});
