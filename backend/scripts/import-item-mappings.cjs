// Preview: node scripts/import-item-mappings.cjs <pasted-text-path>
// Apply to the migrated database: append --apply (atomic mapping + CVR update + audit).
const fs = require('node:fs');
const { parseItemMappingText } = require('../dist/modules/parser/item-mapping-parser');
const { prepareItemMappings, importItemMappings } = require('../dist/application/import-item-mappings');
const { ItemMappingRepository } = require('../dist/infrastructure/repositories/item-mapping-repository');
const { auditedMutation } = require('../dist/composition/audited-mutation');
const { CvrMatchingEngine } = require('../dist/modules/matcher/cvr-matching-engine');
const { getDb, dbConnection } = require('../dist/database/connection');
const { ensureMappingSequence } = require('../dist/database/mapping-sequence-migration');

async function main() {
  const source = process.argv[2];
  if (!source || source.startsWith('--')) throw new Error('Provide the mapping text file path.');
  const rows = parseItemMappingText(fs.readFileSync(source, 'utf8'));
  const prepared = prepareItemMappings(rows);
  console.log(JSON.stringify({ sourceRows: prepared.sourceRows, selectedRows: prepared.rows.length,
    duplicateRows: prepared.duplicateRows, conflictingPairs: prepared.conflictingPairs, policy: 'last row wins' }));
  if (!process.argv.includes('--apply')) return;
  try {
    await ensureMappingSequence(getDb());
    const admin = (await getDb().execute("SELECT id FROM accounts WHERE username='admin'")).rows[0];
    if (!admin) throw new Error('Administrator account not found.');
    const actor = { id: String(admin.id), username: 'admin' };
    const result = await auditedMutation(actor, 'item_mapping', 'IMPORT', undefined, async tx => {
      const imported = await importItemMappings(new ItemMappingRepository(tx), rows, actor.id);
      const cvr = await new CvrMatchingEngine(() => tx).rematchCvrRecords();
      return { ...imported, cvrRecalculated: cvr.rematchedCount };
    });
    console.log('Import committed:', JSON.stringify(result));
  } finally { await dbConnection.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
