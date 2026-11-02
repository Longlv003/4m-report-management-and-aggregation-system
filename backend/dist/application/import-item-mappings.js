"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareItemMappings = prepareItemMappings;
exports.importItemMappings = importItemMappings;
const node_crypto_1 = __importDefault(require("node:crypto"));
/** Authorized import rule: the last pasted row wins for an item/sequence pair. */
function prepareItemMappings(rows) {
    const selected = new Map();
    const quantities = new Map();
    for (const row of rows) {
        const key = JSON.stringify([row.itemName, row.seqNo]);
        // A blank coefficient must not overwrite a known coefficient in a duplicate row.
        if (row.pcsPerSheet !== null || !selected.has(key))
            selected.set(key, row);
        if (!quantities.has(key))
            quantities.set(key, new Set());
        if (row.pcsPerSheet !== null)
            quantities.get(key).add(row.pcsPerSheet);
    }
    return { rows: [...selected.values()], sourceRows: rows.length, duplicateRows: rows.length - selected.size,
        conflictingPairs: [...quantities.values()].filter(values => values.size > 1).length };
}
async function importItemMappings(repository, rows, actorId) {
    const prepared = prepareItemMappings(rows);
    let inserted = 0;
    let updated = 0;
    for (const row of prepared.rows) {
        const old = await repository.findKey(row.itemName, row.seqNo);
        const id = old ? String(old.id) : 'map-' + node_crypto_1.default.randomUUID();
        await repository.save(id, row, actorId, Boolean(old));
        if (old)
            updated++;
        else
            inserted++;
    }
    return { sourceRows: prepared.sourceRows, selectedRows: prepared.rows.length, duplicateRows: prepared.duplicateRows,
        conflictingPairs: prepared.conflictingPairs, inserted, updated };
}
