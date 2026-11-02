"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_ORDER_BY = void 0;
exports.appendItemFilters = appendItemFilters;
/** Shared by list and export so the downloaded report uses the same filters. */
function appendItemFilters(query, conditions, args) {
    for (const [key, column] of [['itemName', 'item_name'], ['itemCode', 'item_code'], ['lotNo', 'lot_no']]) {
        const value = query[key];
        if (typeof value !== 'string' || !value.trim())
            continue;
        conditions.push(`${column} LIKE ? ESCAPE '\\'`);
        args.push(`%${value.trim().replace(/[\\%_]/g, '\\$&')}%`);
    }
}
exports.REPORT_ORDER_BY = 'date DESC, start_time DESC, machine ASC, id ASC';
