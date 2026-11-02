"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureWcsFinishTimeColumns = ensureWcsFinishTimeColumns;
async function ensureWcsFinishTimeColumns(db) {
    const wcs = await db.execute('PRAGMA table_info(wcs_records)');
    if (!wcs.rows.some(column => column.name === 'finish_time')) {
        await db.execute('ALTER TABLE wcs_records ADD COLUMN finish_time TEXT');
    }
    const sources = await db.execute('PRAGMA table_info(source_files)');
    if (!sources.rows.some(column => column.name === 'parser_version')) {
        await db.execute('ALTER TABLE source_files ADD COLUMN parser_version INTEGER NOT NULL DEFAULT 0');
    }
}
