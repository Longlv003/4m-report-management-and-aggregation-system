import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb, dbConnection } from '../src/database/connection.js';
import { pathProvider } from '../src/config/path-provider.js';
import { parseCvrWcsCsv } from '../src/modules/parser/cvr-wcs-parser.js';
import { parsePlusErrorExcel } from '../src/modules/parser/plus-error-parser.js';
import { CvrMatchingEngine } from '../src/modules/matcher/cvr-matching-engine.js';
import { ensureCvrRateColumns } from '../src/database/migrations.js';

// Run with the backend stopped. Rebuild only derived CVR / Plus Error data.
async function rebuild() {
  const db = getDb();
  try {
    const sources = await db.execute("SELECT id, file_path, source_system FROM source_files WHERE source_system IN ('wcsCvr', 'plusError') AND status = 'SUCCESS'");
    if (!sources.rows.length) throw new Error('No imported CVR source files found');
    // Parse every source before changing the database; a missing file aborts the repair.
    const prepared = sources.rows.map(source => {
      const filePath = String(source.file_path);
      if (!fs.existsSync(filePath)) throw new Error(`Source file missing: ${filePath}`);
      return { id: String(source.id), type: String(source.source_system),
        wcs: source.source_system === 'wcsCvr' ? parseCvrWcsCsv(filePath) : [],
        errors: source.source_system === 'plusError' ? parsePlusErrorExcel(filePath) : [] };
    });
    const backup = path.join(pathProvider.getBackupDir(), `before-cvr-mapping-${Date.now()}.sqlite`);
    await db.execute({ sql: 'VACUUM INTO ?', args: [backup] });
    console.log('Backup:', backup);
    const transaction = await db.transaction('write');
    try {
      await ensureCvrRateColumns(transaction);
      const engine = new CvrMatchingEngine(() => transaction);
      const now = new Date().toISOString();
      for (const source of prepared.filter(source => source.type === 'plusError')) {
        await transaction.execute({ sql: 'DELETE FROM plus_error_records WHERE file_id = ?', args: [source.id] });
        for (const error of source.errors) {
          await transaction.execute({
            sql: `INSERT INTO plus_error_records (id, file_id, item_code, batch_no, product_name, process_type,
              inspection_date, total_ng_qty, inspection_qty, ng_rate, d1,d2,d3,d4,d5,d6,d7,d8,d9,d10,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(item_code,batch_no,process_type) DO UPDATE SET
              file_id=excluded.file_id, product_name=excluded.product_name, inspection_date=excluded.inspection_date,
              total_ng_qty=excluded.total_ng_qty, inspection_qty=excluded.inspection_qty, ng_rate=excluded.ng_rate,
              d1=excluded.d1,d2=excluded.d2,d3=excluded.d3,d4=excluded.d4,d5=excluded.d5,
              d6=excluded.d6,d7=excluded.d7,d8=excluded.d8,d9=excluded.d9,d10=excluded.d10,created_at=excluded.created_at`,
            args: ['err-' + crypto.randomUUID(), source.id, error.itemCode, error.batchNo, error.productName,
              error.processType, error.inspectionDate, error.totalNgQty, error.inspectionQty, error.ngRate,
              error.d1,error.d2,error.d3,error.d4,error.d5,error.d6,error.d7,error.d8,error.d9,error.d10,now]
          });
        }
      }
      // Delete old derived rows first; truncated CSV values may have produced different keys.
      for (const source of prepared.filter(source => source.type === 'wcsCvr')) {
        await transaction.execute({ sql: 'DELETE FROM cvr4m_records WHERE wcs_file_id = ?', args: [source.id] });
      }
      for (const source of prepared.filter(source => source.type === 'wcsCvr')) {
        await engine.processAndMatchCvrRecords(source.wcs, source.id);
      }
      for (const source of prepared) {
        const count = source.wcs.length + source.errors.length;
        await transaction.execute({ sql: 'UPDATE source_files SET record_count=?,success_count=?,error_count=0 WHERE id=?', args: [count,count,source.id] });
      }
      const summary = await transaction.execute(`SELECT COUNT(*) AS records,
        SUM(accumulative_defect_a) AS defects_a, SUM(accumulative_defect_b) AS defects_b,
        SUM(total_pattern_ng) AS display_ng, SUM(CASE WHEN verify_zoom_a != '' THEN 1 ELSE 0 END) AS zoom_rows FROM cvr4m_records`);
      await transaction.commit();
      console.log('Rebuilt:', JSON.stringify(summary.rows));
    } catch (error) { await transaction.rollback(); throw error; }
    finally { transaction.close(); }
  } finally { await dbConnection.close(); }
}
rebuild().catch(error => { console.error(error); process.exitCode = 1; });
