"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureScanRunIdentity = ensureScanRunIdentity;
const transaction_js_1 = require("./transaction.js");
const scan_record_identity_js_1 = require("../domain/scan-record-identity.js");
/** Keep surviving IDs and exclusions; the versioned scanner restores missing runs. */
async function ensureScanRunIdentity(db) {
    const columns = await db.execute('PRAGMA table_info(scan4m_records)');
    if (columns.rows.some(column => column.name === 'record_key'))
        return;
    await (0, transaction_js_1.withWriteTransaction)(async (tx) => {
        await tx.execute('ALTER TABLE scan4m_records ADD COLUMN record_key TEXT');
        await tx.execute(`UPDATE scan4m_records SET record_key=json_array(
      TRIM(COALESCE(item_code,'')),TRIM(COALESCE(lot_no,'')),TRIM(COALESCE(seq_no,'')),
      TRIM(COALESCE(start_time,'')),TRIM(COALESCE(machine,'')))`);
        // SQLite cannot drop the inline UNIQUE constraint without rebuilding the table.
        const schema = await tx.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='scan4m_records'");
        const original = String(schema.rows[0].sql);
        if (!/match_key\s+TEXT\s+NOT NULL\s+UNIQUE/i.test(original)) {
            throw new Error('Cannot migrate Scan run identity: expected legacy match key constraint');
        }
        const create = original.replace('scan4m_records', 'scan4m_records_with_runs')
            .replace(/match_key\s+TEXT\s+NOT NULL\s+UNIQUE/i, 'match_key TEXT NOT NULL');
        if (create === original || /match_key\s+TEXT\s+NOT NULL\s+UNIQUE/i.test(create)) {
            throw new Error('Cannot migrate Scan run identity: unexpected table schema');
        }
        await tx.execute(create);
        await tx.execute('INSERT INTO scan4m_records_with_runs SELECT * FROM scan4m_records');
        await tx.execute('DROP TABLE scan4m_records');
        await tx.execute('ALTER TABLE scan4m_records_with_runs RENAME TO scan4m_records');
        await tx.execute('CREATE UNIQUE INDEX idx_scan4m_run_key ON scan4m_records(record_key)');
        await tx.execute('CREATE INDEX idx_scan4m_match_key ON scan4m_records(match_key)');
        await tx.execute('CREATE INDEX idx_scan4m_date_shift ON scan4m_records(date,shift)');
        await tx.execute('CREATE INDEX idx_scan4m_match_status ON scan4m_records(match_status)');
        const exclusions = await tx.execute("SELECT record_key,snapshot_json FROM record_exclusions WHERE report_type='scan4m'");
        for (const exclusion of exclusions.rows) {
            const snapshot = JSON.parse(String(exclusion.snapshot_json));
            if (!snapshot || typeof snapshot !== 'object' || !('item_code' in snapshot)) {
                throw new Error('Cannot migrate Scan exclusion: invalid record snapshot');
            }
            await tx.execute({
                sql: "UPDATE record_exclusions SET record_key=? WHERE report_type='scan4m' AND record_key=?",
                args: [(0, scan_record_identity_js_1.scanRecordKey)(snapshot), exclusion.record_key]
            });
        }
    }, db);
}
