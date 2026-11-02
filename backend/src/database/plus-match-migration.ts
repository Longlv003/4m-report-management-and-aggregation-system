import { Client } from '@libsql/client';

export async function ensurePlusMatchColumns(db: Pick<Client,'execute'>): Promise<void> {
  for (const table of ['scan4m_records','cvr4m_records']) {
    const columns = await db.execute(`PRAGMA table_info(${table})`);
    if (!columns.rows.length) continue;
    if (!columns.rows.some(row => row.name === 'plus_match_method')) {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN plus_match_method TEXT NOT NULL DEFAULT 'UNMATCHED'`);
    }
    if (!columns.rows.some(row => row.name === 'plus_match_details')) {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN plus_match_details TEXT`);
    }
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_${table}_plus_method ON ${table}(plus_match_method)`);
  }
  await db.execute('CREATE INDEX IF NOT EXISTS idx_plus_item_lot_seq ON plus_records(item_code,batch_no,seq_no)');
  const wcs = await db.execute('PRAGMA table_info(wcs_records)');
  if (wcs.rows.length) await db.execute('CREATE INDEX IF NOT EXISTS idx_wcs_item_seq_lot ON wcs_records(item_code,seq_no,batch_no)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_cvr_item_seq_lot ON cvr4m_records(item_code,seq_no,lot_no)');
}
