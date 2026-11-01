"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUniquePlusKeys = ensureUniquePlusKeys;
const transaction_js_1 = require("./transaction.js");
async function ensureUniquePlusKeys(db) {
    await (0, transaction_js_1.withWriteTransaction)(async (tx) => {
        // Repoint links before removing historical duplicates; keep the latest imported value.
        await tx.execute(`UPDATE scan4m_records SET plus_record_id = (
      SELECT p.id FROM plus_records p WHERE p.match_key = scan4m_records.match_key
      ORDER BY p.created_at DESC, p.rowid DESC LIMIT 1
    ) WHERE EXISTS (SELECT 1 FROM plus_records p WHERE p.match_key = scan4m_records.match_key)`);
        await tx.execute(`DELETE FROM plus_records WHERE rowid NOT IN (
      SELECT rowid FROM (SELECT rowid, ROW_NUMBER() OVER (
        PARTITION BY match_key ORDER BY created_at DESC, rowid DESC) AS position FROM plus_records
      ) WHERE position = 1
    )`);
        await tx.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_plus_unique_match_key ON plus_records(match_key)');
    }, db);
}
