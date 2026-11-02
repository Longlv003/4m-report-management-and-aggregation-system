"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlExclusionRepository = void 0;
exports.visibilitySql = visibilitySql;
function visibilitySql(report, excluded = false) {
    const table = report === 'scan4m' ? 'scan4m_records' : 'cvr4m_records';
    const tuple = `json_array(${['item_code', 'lot_no', 'seq_no', 'start_time', 'machine'].map(key => `COALESCE(${table}.${key},'')`).join(',')})`;
    const key = report === 'scan4m' ? `COALESCE(${table}.record_key,${tuple})` : tuple;
    return `${excluded ? '' : 'NOT '}EXISTS (SELECT 1 FROM record_exclusions e WHERE e.report_type='${report}' AND e.record_key=${key} AND e.is_excluded=1)`;
}
class SqlExclusionRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findRecord(report, id) {
        const table = report === 'scan4m' ? 'scan4m_records' : 'cvr4m_records';
        const result = await this.db.execute({ sql: `SELECT * FROM ${table} WHERE id=?`, args: [id] });
        return result.rows[0];
    }
    async find(report, key) {
        const result = await this.db.execute({ sql: 'SELECT * FROM record_exclusions WHERE report_type=? AND record_key=?', args: [report, key] });
        return result.rows[0];
    }
    async save(report, key, record, excluded, reason, actor) {
        await this.db.execute({ sql: `INSERT INTO record_exclusions
      (report_type,record_key,is_excluded,reason,snapshot_json,changed_by,changed_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(report_type,record_key) DO UPDATE SET
      is_excluded=excluded.is_excluded,reason=excluded.reason,snapshot_json=excluded.snapshot_json,
      changed_by=excluded.changed_by,changed_at=excluded.changed_at`,
            args: [report, key, excluded ? 1 : 0, reason, JSON.stringify(record), actor.id, new Date().toISOString()] });
    }
}
exports.SqlExclusionRepository = SqlExclusionRepository;
