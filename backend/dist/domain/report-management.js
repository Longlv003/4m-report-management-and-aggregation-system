"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordKey = recordKey;
function recordKey(report, row) {
    return report === 'scan4m' ? String(row.match_key) : JSON.stringify(['item_code', 'lot_no', 'seq_no', 'start_time', 'machine'].map(key => String(row[key] ?? '')));
}
