"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordKey = recordKey;
function recordKey(report, row) {
    return report === 'scan4m' ? (0, scan_record_identity_js_1.scanRecordKey)(row) : JSON.stringify(['item_code', 'lot_no', 'seq_no', 'start_time', 'machine'].map(key => String(row[key] ?? '')));
}
const scan_record_identity_js_1 = require("./scan-record-identity.js");
