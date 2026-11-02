import { fixturePath } from './fixture-path.js';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { CvrMatchingEngine } from '../src/modules/matcher/cvr-matching-engine.js';
import { parseCvrWcsRow } from '../src/modules/parser/cvr-wcs-parser.js';
import { parseCvrWcsCsv } from '../src/modules/parser/cvr-wcs-parser.js';
import { parsePlusErrorExcel } from '../src/modules/parser/plus-error-parser.js';
import { ensureCvrRateColumns, ensureCvrPcsColumn } from '../src/database/migrations.js';
import { configurationProvider } from '../src/config/configuration-provider.js';
const CVR_EXPORT_COLUMNS = configurationProvider.getCvrOutputSchema().columns;

async function test() {
  const db = createClient({ url: ':memory:' });
  try {
    await db.execute('CREATE TABLE item_mapping (item_name TEXT, pcs_per_sheet INTEGER, process TEXT, is_deleted INTEGER, seq_no TEXT)');
    await db.execute('CREATE TABLE plus_records (item_code TEXT, batch_no TEXT, prod_qty INTEGER, created_at TEXT)');
    await db.execute(`CREATE TABLE plus_error_records (item_code TEXT, batch_no TEXT, process_type TEXT,
      d1 INTEGER, d2 INTEGER, d3 INTEGER, d4 INTEGER, d5 INTEGER, d6 INTEGER, d7 INTEGER, d8 INTEGER, d9 INTEGER, d10 INTEGER)`);
    const textColumns = ['id', 'wcs_file_id', 'date', 'machine', 'shift', 'start_time', 'finish_time', 'total_time',
      'item_name', 'item_code', 'lot_no', 'seq_no', 'process', 'program_name', 'op', 'match_status', 'raw_wcs_json', 'created_at', 'updated_at'];
    const numberColumns = ['total_sheet_indi', 'total_sheet_vrf', 'total_pcs', 'total_pattern_ng', 'ng_rate'];
    for (const side of ['a', 'b']) {
      for (const field of ['accumulative_defect', 'discoloration', 'fm', 'copper_residue', 'broken_hole',
        'bvh_shift', 'missing_hole', 'extra_hole', 'dfr_seepage', 'other', 'dfr_remain']) numberColumns.push(`${field}_${side}`);
      textColumns.push(`verify_zoom_${side}`);
    }
    await db.execute(`CREATE TABLE cvr4m_records (${textColumns.map(c => `${c} TEXT`).join(',')}, ${numberColumns.map(c => `${c} REAL`).join(',')})`);
    await ensureCvrPcsColumn(db);
    await ensureCvrRateColumns(db);
    await ensureCvrRateColumns(db); // Safe for an existing database on every startup.
    assert.equal(CVR_EXPORT_COLUMNS.length, 45);
    for (const side of ['a', 'b']) {
      const index = CVR_EXPORT_COLUMNS.findIndex(column => column.key === `accumulative_defect_${side}`);
      assert.equal(CVR_EXPORT_COLUMNS[index + 1].key, `ng_rate_${side}`);
    }
    await db.execute("INSERT INTO item_mapping VALUES ('Product', 100, 'Electroless', 0, '0070')");
    await db.execute("INSERT INTO plus_records VALUES ('ITEM', '00001', 10, '2026-11-01')");
    for (const [type, value] of [['AEA', 1], ['ASA', 10], ['ASS', 100], ['AEB', 2], ['ASB', 20], ['BSS', 200]] as const) {
      await db.execute({ sql: 'INSERT INTO plus_error_records VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0)', args: ['ITEM', '00001', type, value, value * 2] });
    }
    // A more recent production export for a similar lot must not supply this lot's denominator.
    await db.execute("INSERT INTO plus_records VALUES ('ITEM', '000010', 99999, '2027-01-01')");
    await db.execute("INSERT INTO plus_records VALUES ('ITEM', '1', 88888, '2027-01-02')");
    // Similar lots, other items and unrelated PF codes must never be included.
    await db.execute("INSERT INTO plus_error_records VALUES ('ITEM', '000010', 'AEA', 9999, 0, 0, 0, 0, 0, 0, 0, 0, 0)");
    await db.execute("INSERT INTO plus_error_records VALUES ('OTHER', '00001', 'ASA', 9999, 0, 0, 0, 0, 0, 0, 0, 0, 0)");
    await db.execute("INSERT INTO plus_error_records VALUES ('ITEM', '00001', 'PF', 9999, 0, 0, 0, 0, 0, 0, 0, 0, 0)");
    await db.execute('ALTER TABLE plus_error_records ADD COLUMN total_ng_qty INTEGER DEFAULT 0');
    await db.execute('ALTER TABLE plus_error_records ADD COLUMN ng_rate REAL DEFAULT 0');
    await db.execute("ALTER TABLE plus_error_records ADD COLUMN inspection_date TEXT DEFAULT '46325'");
    await db.execute("ALTER TABLE plus_error_records ADD COLUMN created_at TEXT DEFAULT ''");
    await db.execute("UPDATE plus_error_records SET total_ng_qty=23, ng_rate=0.018, inspection_date='46326' WHERE process_type='AEA'");
    await db.execute("UPDATE plus_error_records SET total_ng_qty=999, ng_rate=9.99 WHERE process_type='AEB'");
    const raw = {
      'Mã item': 'ITEM', 'Số lot': '00001', 'Công đoạn số': '0070', 'Tên sản phẩm': 'Product',
      'Tên chương trình': 'RECIPE', 'Số tấm input': '2', 'Số hàng NG': '12',
      'Thời gian bắt đầu': '2026-11-01 07:00:00', 'Thời gian kết thúc': '2026-11-01 08:00:00',
      'Độ phóng đại verify': 'OK'
    };
    const engine = new CvrMatchingEngine(() => db);
    await engine.processAndMatchCvrRecords([parseCvrWcsRow(raw)], 'test-file');
    const record = (await db.execute('SELECT * FROM cvr4m_records')).rows[0];
    assert.equal(record.discoloration_a, 111);
    assert.equal(record.fm_a, 222);
    assert.equal(record.accumulative_defect_a, 333);
    assert.equal(record.discoloration_b, 222);
    assert.equal(record.fm_b, 444);
    assert.equal(record.accumulative_defect_b, 666);
    assert.equal(record.total_pattern_ng, 999); // A + B, independent of source Display/WCS quantities.
    assert.equal(record.total_pcs, 1000);
    assert.equal(record.total_pcs_cvr, 200);
    assert.equal(record.ng_rate, 99.9);
    assert.equal(record.ng_rate_a, 33.3);
    assert.equal(record.ng_rate_b, 66.6);
    assert.equal(record.verify_zoom_a, 'OK');
    assert.equal(record.verify_zoom_b, 'OK');
    assert.equal(record.match_status, 'MATCHED');
    await db.execute("UPDATE plus_error_records SET d1 = 101 WHERE process_type = 'ASS'");
    assert.equal((await engine.rematchCvrRecords()).rematchedCount, 1);
    const refreshed = (await db.execute('SELECT * FROM cvr4m_records')).rows[0];
    assert.equal(refreshed.discoloration_a, 112); // Already-matched rows must refresh, too.
    assert.equal(refreshed.total_pattern_ng, 1000);
    assert.equal(refreshed.ng_rate, 100);
    assert.equal(refreshed.ng_rate_a, 33.4);
    assert.equal(refreshed.ng_rate_b, 66.6);
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM cvr4m_records')).rows[0].n, 1);
    await engine.processAndMatchCvrRecords([parseCvrWcsRow({ ...raw, 'Tên thiết bị': 'Second Verify' })], 'test-file');
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM cvr4m_records')).rows[0].n, 2);
    // User-reported regression, using actual AEA/AEB workbooks and WCS rows.
    for (const filename of ['ayqa4080_20261031114831.xlsx', 'ayqa4080_20261031114858.xlsx']) {
      const errors = parsePlusErrorExcel(fixturePath('plusError',filename));
      for (const error of errors.filter(error => error.itemCode === '7M028H01000B' && error.batchNo === '00005')) {
        await db.execute({ sql: `INSERT INTO plus_error_records (item_code,batch_no,process_type,total_ng_qty,ng_rate,
          inspection_date,created_at,d1,d2,d3,d4,d5,d6,d7,d8,d9,d10) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [error.itemCode,error.batchNo,error.processType,error.totalNgQty,error.ngRate,error.inspectionDate,'',
            error.d1,error.d2,error.d3,error.d4,error.d5,error.d6,error.d7,error.d8,error.d9,error.d10] });
      }
    }
    await db.execute("INSERT INTO plus_records VALUES ('7M028H01000B','00005',334,'2026-11-01')");
    const sample = parseCvrWcsCsv(fixturePath('wcsCvr','S_S+Verify+#5620261031.csv'))
      .find(row => row.itemCode === '7M028H01000B' && row.lotNo === '00005')!;
    await db.execute({ sql: "INSERT INTO item_mapping VALUES ('6HRAV',384,'Electroless',0,?)", args: [sample.seqNo] });
    assert.equal(sample.wcsNgQty, 0);
    await engine.processAndMatchCvrRecords([sample], 'test-file');
    const actual = (await db.execute("SELECT * FROM cvr4m_records WHERE item_code='7M028H01000B' AND lot_no='00005'")).rows[0];
    assert.equal(actual.total_pattern_ng, 31);
    assert.equal(actual.total_pcs, 128256);
    assert.equal(actual.ng_rate, 0.02417);
    assert.equal(actual.ng_rate_a, 0.017933);
    assert.equal(actual.ng_rate_b, 0.006238);
    assert.equal(actual.accumulative_defect_a, 23);
    assert.equal(actual.accumulative_defect_b, 8);
    // The remaining B defects still contribute when no A log is present.
    await db.execute("DELETE FROM plus_error_records WHERE item_code='7M028H01000B' AND process_type='AEA'");
    await engine.rematchCvrRecords();
    const missing = (await db.execute("SELECT * FROM cvr4m_records WHERE item_code='7M028H01000B'")).rows[0];
    assert.equal(missing.total_pattern_ng, 8);
    assert.equal(missing.ng_rate_a, 0);
    await db.execute("DELETE FROM plus_records WHERE item_code='7M028H01000B'");
    await engine.rematchCvrRecords();
    const noPlus = (await db.execute("SELECT * FROM cvr4m_records WHERE item_code='7M028H01000B'")).rows[0];
    assert.equal(noPlus.total_pcs, null);
    assert.equal(noPlus.ng_rate, null);
    assert.equal(noPlus.ng_rate_a, null);
    assert.equal(noPlus.ng_rate_b, null);
    await db.execute("INSERT INTO plus_records VALUES ('7M028H01000B','00005',0,'2026-11-01')");
    await engine.rematchCvrRecords();
    assert.equal((await db.execute("SELECT ng_rate FROM cvr4m_records WHERE item_code='7M028H01000B'")).rows[0].ng_rate, null);
    await db.execute("UPDATE plus_records SET prod_qty=334 WHERE item_code='7M028H01000B'");
    await db.execute("UPDATE item_mapping SET pcs_per_sheet=0 WHERE item_name='6HRAV'");
    await engine.rematchCvrRecords();
    assert.equal((await db.execute("SELECT ng_rate FROM cvr4m_records WHERE item_code='7M028H01000B'")).rows[0].ng_rate, null);
    console.log('CVR tests passed: A+B, Indi pcs denominator, side percentages, export positions, rematch and missing/zero denominators');
  } finally { db.close(); }
}
test().catch(error => { console.error(error); process.exitCode = 1; });
