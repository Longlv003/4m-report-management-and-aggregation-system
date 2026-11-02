import crypto from 'node:crypto';
import { ItemMappingInput, ItemMappingStore } from '../domain/item-mapping.js';

/** Authorized import rule: the last pasted row wins for an item/sequence pair. */
export function prepareItemMappings(rows: ItemMappingInput[]) {
  const selected = new Map<string, ItemMappingInput>();
  const quantities = new Map<string, Set<number>>();
  for (const row of rows) {
    const key = JSON.stringify([row.itemName, row.seqNo]);
    // A blank coefficient must not overwrite a known coefficient in a duplicate row.
    if (row.pcsPerSheet !== null || !selected.has(key)) selected.set(key, row);
    if (!quantities.has(key)) quantities.set(key, new Set());
    if (row.pcsPerSheet !== null) quantities.get(key)!.add(row.pcsPerSheet);
  }
  return { rows: [...selected.values()], sourceRows: rows.length, duplicateRows: rows.length - selected.size,
    conflictingPairs: [...quantities.values()].filter(values => values.size > 1).length };
}

export async function importItemMappings(repository: ItemMappingStore, rows: ItemMappingInput[], actorId: string) {
  const prepared = prepareItemMappings(rows);
  let inserted = 0;
  let updated = 0;
  for (const row of prepared.rows) {
    const old = await repository.findKey(row.itemName, row.seqNo);
    const id = old ? String(old.id) : 'map-' + crypto.randomUUID();
    await repository.save(id, row, actorId, Boolean(old));
    if (old) updated++; else inserted++;
  }
  return { sourceRows: prepared.sourceRows, selectedRows: prepared.rows.length, duplicateRows: prepared.duplicateRows,
    conflictingPairs: prepared.conflictingPairs, inserted, updated };
}
