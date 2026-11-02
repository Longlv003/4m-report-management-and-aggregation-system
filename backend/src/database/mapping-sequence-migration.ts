import { Client } from '@libsql/client';
import { withWriteTransaction } from './transaction.js';

export async function ensureMappingSequence(db: Client): Promise<void> {
  const columns = await db.execute('PRAGMA table_info(item_mapping)');
  if (columns.rows.some(column => column.name === 'seq_no')) return;
  await withWriteTransaction(async tx => {
    const schema = await tx.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='item_mapping'");
    const original = String(schema.rows[0].sql);
    if (!/item_name\s+TEXT\s+NOT NULL\s+UNIQUE/i.test(original)) throw new Error('Unexpected legacy mapping schema');
    const create = original.replace('item_mapping', 'item_mapping_with_seq')
      .replace(/item_name\s+TEXT\s+NOT NULL\s+UNIQUE/i, 'item_name TEXT NOT NULL')
      .replace(/pcs_per_sheet\s+INTEGER\s+NOT NULL\s+DEFAULT\s+0/i, 'pcs_per_sheet INTEGER');
    await tx.execute(create);
    await tx.execute('INSERT INTO item_mapping_with_seq SELECT * FROM item_mapping');
    await tx.execute("ALTER TABLE item_mapping_with_seq ADD COLUMN seq_no TEXT NOT NULL DEFAULT ''");
    await tx.execute("ALTER TABLE item_mapping_with_seq ADD COLUMN build TEXT NOT NULL DEFAULT ''");
    await tx.execute("ALTER TABLE item_mapping_with_seq ADD COLUMN model TEXT NOT NULL DEFAULT ''");
    await tx.execute('DROP TABLE item_mapping');
    await tx.execute('ALTER TABLE item_mapping_with_seq RENAME TO item_mapping');
    await tx.execute('CREATE UNIQUE INDEX idx_item_mapping_name_seq ON item_mapping(item_name,seq_no)');
    await tx.execute('CREATE INDEX idx_item_mapping_item_name ON item_mapping(item_name)');
    await tx.execute('CREATE INDEX idx_item_mapping_deleted ON item_mapping(is_deleted)');
  }, db);
}
