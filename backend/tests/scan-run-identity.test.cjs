// Run after building backend. Every database and fixture lives in the OS temp directory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createClient } = require('@libsql/client');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), '4m-run-identity-'));
process.env.APP_DATABASE_URL = 'file:' + path.join(temp, 'test.sqlite').replace(/\\/g, '/');
process.env.JWT_SECRET = 'scan-run-test-secret-at-least-32-characters';
process.env.INITIAL_ADMIN_PASSWORD = 'RunIdentityAdmin123!';
process.env.INITIAL_USER_PASSWORD = 'RunIdentityUser123!';
const { ensureScanRunIdentity } = require('../dist/database/scan-identity-migration');
const { scanRecordKey } = require('../dist/domain/scan-record-identity');
const { runMigrations } = require('../dist/database/migrations');
const { getDb, dbConnection } = require('../dist/database/connection');
const { ScannerEngine } = require('../dist/modules/scanner/scanner-engine');
const { configurationProvider } = require('../dist/config/configuration-provider');
const { rematchScanRecords } = require('../dist/modules/matcher/scan-matching-engine');
const { createApp } = require('../dist/app');
const { signToken } = require('../dist/middlewares/auth.middleware');
const xlsx = require('xlsx');

async function testLegacyMigration() {
  const db = createClient({ url: 'file:' + path.join(temp, 'legacy.sqlite').replace(/\\/g, '/') });
  const snapshot = { id: 'keep-id', item_code: 'ITEM', lot_no: '00022', seq_no: '0370', start_time: '2026-10-30 19:51:14', machine: 'STS Via AOI #12' };
  try {
    await db.execute(`CREATE TABLE scan4m_records (id TEXT PRIMARY KEY, match_key TEXT NOT NULL UNIQUE,
      item_code TEXT,lot_no TEXT,seq_no TEXT,start_time TEXT,machine TEXT,date TEXT,shift TEXT,match_status TEXT)`);
    await db.execute(`CREATE TABLE record_exclusions (report_type TEXT,record_key TEXT,snapshot_json TEXT,
      PRIMARY KEY(report_type,record_key))`);
    await db.execute({ sql: 'INSERT INTO scan4m_records VALUES (?,?,?,?,?,?,?,?,?,?)', args:
      [snapshot.id, 'ITEM_00022_0370', 'ITEM', '00022', '0370', snapshot.start_time, snapshot.machine, '2026-10-30', 'A', 'MATCHED'] });
    await db.execute({ sql: 'INSERT INTO record_exclusions VALUES (?,?,?)', args: ['scan4m', 'ITEM_00022_0370', 'broken JSON'] });
    await assert.rejects(ensureScanRunIdentity(db), /JSON/);
    assert.ok(!(await db.execute('PRAGMA table_info(scan4m_records)')).rows.some(row => row.name === 'record_key'));
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM scan4m_records')).rows[0].n, 1);
    await db.execute({ sql: 'UPDATE record_exclusions SET snapshot_json=?', args: [JSON.stringify(snapshot)] });
    await ensureScanRunIdentity(db);
    await ensureScanRunIdentity(db); // Idempotent across application restarts.
    assert.equal((await db.execute('SELECT id FROM scan4m_records')).rows[0].id, snapshot.id);
    assert.equal((await db.execute('SELECT record_key FROM record_exclusions')).rows[0].record_key, scanRecordKey(snapshot));
    await db.execute({ sql: `INSERT INTO scan4m_records (id,match_key,record_key) VALUES ('second','ITEM_00022_0370',?)`,
      args: [scanRecordKey({ ...snapshot, machine: 'STS Via AOI #3' })] });
    await assert.rejects(db.execute({ sql: `INSERT INTO scan4m_records (id,match_key,record_key) VALUES ('duplicate','ITEM_00022_0370',?)`,
      args: [scanRecordKey(snapshot)] }), /UNIQUE/);
  } finally { db.close(); }
}

async function main() {
  await testLegacyMigration();
  const db = getDb();
  let server;
  const config = configurationProvider.getScannerConfig().scanner;
  const savedStability = config.stabilityCheckMs;
  config.stabilityCheckMs = 0;
  try {
    await runMigrations();
    const scanner = new ScannerEngine(() => db);
    const baseRow = { 'Mã item': '7M013201000B', 'Số lot': '00022', 'Công đoạn số': '0370', 'Ngày tháng': '2026-10-30',
      'Ca': 'A', 'Tên sản phẩm': 'Product', 'Tên thiết bị': 'STS Via AOI #12', 'Thời gian thao tác': '2026-10-30 19:51:14',
      'Số tấm input (Block)': '185', Time01: '2026-10-30 20:00:00' };
    const rows = [baseRow,
      { ...baseRow, 'Tên thiết bị': 'STS Via AOI #3', 'Thời gian thao tác': '2026-10-30 22:55:00', 'Số tấm input (Block)': '136' },
      { ...baseRow, 'Thời gian thao tác': '2026-10-30 21:00:00', 'Số tấm input (Block)': '10' },
      { ...baseRow, 'Tên thiết bị': 'STS Via AOI #4', 'Số tấm input (Block)': '15' },
      // Deliberately different operation/start dates verifies that Date is the primary sort key.
      { ...baseRow, 'Ngày tháng': '2026-11-02', 'Thời gian thao tác': '2026-10-29 09:00:00', 'Số tấm input (Block)': '20' }];
    const columns = [...new Set([...configurationProvider.getDataMapping().wcsRequiredColumns, ...Object.keys(baseRow)])];
    const csv = path.join(temp, 'scan.csv');
    function write(values) { fs.writeFileSync(csv, columns.join(',') + '\n' + values.map(row => columns.map(column => row[column] || '').join(',')).join('\n')); }
    write(rows);
    await scanner.processFile(db, 'wcsScan', 'CSV', csv, 'scan.csv');
    let records = (await db.execute('SELECT * FROM scan4m_records')).rows;
    assert.equal(records.length, 5);
    const ids = new Map(records.map(row => [row.record_key, row.id]));
    const target = records.find(row => row.machine === baseRow['Tên thiết bị'] && row.start_time === baseRow['Thời gian thao tác']);
    assert.equal(target.total_sheet_scan, 185);
    assert.equal(records.find(row => row.machine === 'STS Via AOI #3').total_sheet_scan, 136);
    // Reordered exports and changes to one run must preserve every other run and their IDs.
    write([...rows].reverse().map(row => row === baseRow ? { ...row, 'Số tấm input (Block)': '190' } : row));
    await scanner.processFile(db, 'wcsScan', 'CSV', csv, 'reordered.csv');
    records = (await db.execute('SELECT * FROM scan4m_records')).rows;
    assert.equal(records.length, 5);
    assert.ok(records.every(row => ids.get(row.record_key) === row.id));
    assert.equal(records.find(row => row.id === target.id).total_sheet_scan, 190);
    const sourceId = (await db.execute('SELECT id FROM source_files LIMIT 1')).rows[0].id;
    await db.execute({ sql: `INSERT INTO plus_records
      (id,file_id,match_key,item_code,batch_no,seq_no,work_result,prod_qty,created_at) VALUES ('plus',?,'7M013201000B_00022_0370','7M013201000B','00022','0370','2026-10-30 23:00:00',321,'')`, args: [sourceId] });
    await rematchScanRecords(db);
    records = (await db.execute('SELECT * FROM scan4m_records')).rows;
    assert.ok(records.every(row => row.plus_record_id === 'plus' && row.total_sheet_indi === 321));
    assert.equal(records.length, 5);

    server = createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const token = signToken({ id: 'acc-admin', username: 'admin', fullName: 'Admin', roleId: 'role-admin', roleName: 'ADMIN',
      permissions: ['scan4m:view', 'scan4m:manage', 'scan4m:export', 'cvr4m:view', 'cvr4m:export'] });
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const send = async (url, method = 'GET', body) => {
      const response = await fetch(base + url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined });
      assert.equal(response.status, 200);
      return response;
    };
    await send('/scan4m/records/' + target.id + '/exclude', 'POST', { reason: 'Only this machine run' });
    let data = (await (await send('/scan4m/records?pageSize=all')).json()).data;
    assert.equal(data.records.length, 4);
    assert.ok(data.records.some(row => row.machine === 'STS Via AOI #3'));
    assert.ok(data.records.some(row => row.machine === 'STS Via AOI #12'));
    assert.equal((await (await send('/scan4m/records?visibility=excluded')).json()).data.records.length, 1);
    await send('/scan4m/records/' + target.id + '/restore', 'POST', {});
    for (let i = 0; i < rows.length; i++) await db.execute({
      sql: `INSERT INTO cvr4m_records (id,item_code,lot_no,seq_no,date,start_time,machine,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'','')`,
      args: ['cvr' + i, '7M013201000B', '00022', '0370', rows[i]['Ngày tháng'], rows[i]['Thời gian thao tác'], rows[i]['Tên thiết bị']]
    });
    for (const report of ['scan4m', 'cvr4m']) {
      data = (await (await send('/' + report + '/records?pageSize=all')).json()).data;
      assert.deepEqual(data.records.map(row => row.date), ['2026-11-02', '2026-10-30', '2026-10-30', '2026-10-30', '2026-10-30']);
      assert.deepEqual(data.records.slice(1).map(row => row.start_time), ['2026-10-30 22:55:00', '2026-10-30 21:00:00', '2026-10-30 19:51:14', '2026-10-30 19:51:14']);
      const workbook = xlsx.read(Buffer.from(await (await send('/' + report + '/export')).arrayBuffer()));
      const exported = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      assert.deepEqual(exported.map(row => row.Date), data.records.map(row => row.date));
    }
    console.log('Scan run tests passed: legacy migration/ID/exclusions, multiple machines and repeat runs, idempotent updates, shared Plus matching, date/start ordering in both lists and exports.');
  } finally {
    config.stabilityCheckMs = savedStability;
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await dbConnection.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
