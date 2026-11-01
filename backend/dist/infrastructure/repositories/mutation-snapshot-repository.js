"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlMutationSnapshotRepository = void 0;
const audit_repository_js_1 = require("./audit-repository.js");
class SqlMutationSnapshotRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async read(resource, targetId) {
        const table = resource === 'item_mapping' ? 'item_mapping' : 'accounts';
        const result = await this.db.execute({ sql: `SELECT * FROM ${table}` + (targetId ? ' WHERE id=?' : ''), args: targetId ? [targetId] : [] });
        return result.rows.map(row => (0, audit_repository_js_1.redact)(row));
    }
}
exports.SqlMutationSnapshotRepository = SqlMutationSnapshotRepository;
