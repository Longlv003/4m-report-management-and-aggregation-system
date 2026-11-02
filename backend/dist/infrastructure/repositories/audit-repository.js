"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlAuditRepository = void 0;
exports.redact = redact;
const node_crypto_1 = __importDefault(require("node:crypto"));
// Never persist credentials, tokens or password hashes, even in before/after snapshots.
function redact(value) {
    if (Array.isArray(value))
        return value.map(redact);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value)
            .filter(([key]) => !/password|token|secret|authorization/i.test(key)).map(([key, item]) => [key, redact(item)]));
    return value;
}
class SqlAuditRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async append(entry) {
        const id = 'audit-' + node_crypto_1.default.randomUUID();
        await this.db.execute({ sql: `INSERT INTO audit_logs
      (id,account_id,actor_username,action,resource,details,ip_address,created_at,outcome)
      VALUES (?,?,?,?,?,?,?,?,?)`, args: [id, entry.actor?.id || null, entry.actor?.username || 'anonymous',
                entry.action, entry.resource, JSON.stringify(redact(entry.details ?? {})), entry.ip || entry.actor?.ip || null, new Date().toISOString(), entry.outcome] });
        return id;
    }
    async complete(id, outcome, details) {
        await this.db.execute({ sql: 'UPDATE audit_logs SET outcome=?,details=? WHERE id=?',
            args: [outcome, JSON.stringify(redact(details)), id] });
    }
    async list(filter) {
        const conditions = ['1=1'];
        const args = [];
        if (filter.search) {
            conditions.push('(COALESCE(l.actor_username,a.username,\'\') LIKE ? OR l.resource LIKE ? OR l.details LIKE ?)');
            args.push(...Array(3).fill('%' + filter.search + '%'));
        }
        if (filter.action) {
            conditions.push('l.action=?');
            args.push(filter.action);
        }
        if (filter.from) {
            conditions.push('l.created_at>=?');
            args.push(filter.from);
        }
        if (filter.to) {
            conditions.push('l.created_at<?');
            args.push(filter.to);
        }
        const from = 'FROM audit_logs l LEFT JOIN accounts a ON a.id=l.account_id WHERE ' + conditions.join(' AND ');
        const count = await this.db.execute({ sql: 'SELECT COUNT(*) AS total ' + from, args });
        const rows = await this.db.execute({ sql: `SELECT l.*,COALESCE(l.actor_username,a.username,'unknown') AS username ${from}
      ORDER BY l.created_at DESC,l.rowid DESC LIMIT ? OFFSET ?`, args: [...args, filter.pageSize, (filter.page - 1) * filter.pageSize] });
        return { records: rows.rows, total: Number(count.rows[0].total) };
    }
}
exports.SqlAuditRepository = SqlAuditRepository;
