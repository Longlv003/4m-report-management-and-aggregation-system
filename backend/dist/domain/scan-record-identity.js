"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WCS_SCAN_PARSER_VERSION = void 0;
exports.scanRecordKey = scanRecordKey;
exports.WCS_SCAN_PARSER_VERSION = 2;
/** A Plus lot/process match can have many WCS machine runs. */
function scanRecordKey(row) {
    return JSON.stringify(['item_code', 'lot_no', 'seq_no', 'start_time', 'machine']
        .map(column => String(row[column] ?? '').trim()));
}
