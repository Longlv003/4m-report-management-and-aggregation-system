// Run after npm run build; uses a temporary database, never the installed data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), '4m-report-updates-'));
process.env.APP_DATABASE_URL = 'file:' + path.join(temp, 'test.sqlite').replace(/\\/g, '/');
process.env.JWT_SECRET = 'report-update-test-secret-at-least-32-characters';
process.env.INITIAL_ADMIN_PASSWORD = 'ReportUpdate123!';
process.env.INITIAL_USER_PASSWORD = 'ReportUser123!';
const { latestWcsFinishTime } = require('../dist/domain/scan-time.js');
const { aggregateWcsAndPlus, calculateTotalTime, rematchScanRecords } = require('../dist/modules/matcher/scan-matching-engine.js');
const { getDb, dbConnection } = require('../dist/database/connection.js');
const { runMigrations } = require('../dist/database/migrations.js');
const { scannerEngine } = require('../dist/modules/scanner/scanner-engine.js');
const { configurationProvider } = require('../dist/config/configuration-provider.js');
const { pathProvider } = require('../dist/config/path-provider.js');
const { sseManager } = require('../dist/modules/realtime/sse-manager.js');
const { createApp } = require('../dist/app.js');
const { signToken } = require('../dist/middlewares/auth.middleware.js');
const xlsx = require('xlsx');

async function main() {
  let server;
  const db = getDb();
  const scannerConfig = configurationProvider.getScannerConfig().scanner;
  const savedScannerConfig = { ...scannerConfig };
  scannerConfig.stabilityCheckMs = 0;
  try {
    assert.equal(latestWcsFinishTime({ Time01: '2026-11-01 08:00:00', Time02: '2026-11-01 09:00:00' }), '2026-11-01 09:00:00');
    assert.equal(latestWcsFinishTime({ Time01: '2026-11-01 23:00:00', Time05: '2026-11-02 01:00:00', Time03: 'bad' }), '2026-11-02 01:00:00');
    assert.equal(latestWcsFinishTime({ Time02: '2026-02-30 12:00:00', Time01: 'NA', Time05: '' }), null);
    assert.equal(latestWcsFinishTime({ Time04: ' 2026-11-01T09:00:00 ' }), '2026-11-01 09:00:00');
    assert.equal(calculateTotalTime('2026-11-01 09:00:00', '2026-11-01 08:00:00').totalTime, 'N/A');
    assert.equal(calculateTotalTime('bad', '2026-11-01 08:00:00').totalTime, null);
    assert.equal(calculateTotalTime('2026-11-01 08:00:00').totalTime, null);
    assert.equal(calculateTotalTime('2026-11-01 08:00:00', '2026-11-01 08:00:00').totalTime, '0');
    const row = { 'Mã item': 'ITEM', 'Số lot': '00001', 'Công đoạn số': '0070',
      'Thời gian thao tác': '2026-11-01 08:00:00', 'Ngày tháng': '2026-11-01',
      'Tên sản phẩm': 'Product_%', 'Tên thiết bị': 'Scan machine', 'Ca': 'A',
      'Time01': '2026-11-01 08:30:00', 'Time05': '2026-11-01 09:00:00',
      'Áp suất khí đầu vào': '5' };
    const aggregated = aggregateWcsAndPlus('scan', 'wcs', row, { workResult: '2026-11-01 07:00:00', prodQty: 12 });
    assert.equal(aggregated.finishTime, '2026-11-01 09:00:00');
    assert.equal(aggregated.totalTime, '60');
    assert.match(aggregated.anomalyFlag, /Áp suất/);
    assert.equal(aggregateWcsAndPlus('scan', 'wcs', row).totalTime, '60');

    await runMigrations();
    const columns = [...new Set([...configurationProvider.getDataMapping().wcsRequiredColumns, ...Object.keys(row)])];
    const csv = path.join(temp, 'wcs.csv');
    function writeCsv(values) {
      fs.writeFileSync(csv, columns.join(',') + '\n' + columns.map(column => values[column] || '').join(',') + '\n');
    }
    writeCsv(row);
    await scannerEngine.processFile(db, 'wcsScan', 'CSV', csv, 'wcs.csv');
    let record = (await db.execute('SELECT * FROM scan4m_records')).rows[0];
    const recordId = record.id;
    assert.equal(record.finish_time, '2026-11-01 09:00:00');
    assert.equal(record.total_time, '60');
    assert.equal(await scannerEngine.processFile(db, 'wcsScan', 'CSV', csv, 'wcs.csv'), false);
    // A file imported by the old parser must be read once again, with record IDs retained.
    await db.execute('UPDATE source_files SET parser_version = 0');
    assert.equal(await scannerEngine.processFile(db, 'wcsScan', 'CSV', csv, 'wcs.csv'), true);
    assert.equal((await db.execute('SELECT id FROM scan4m_records')).rows[0].id, recordId);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([{
      'Item Code Of Product': 'ITEM', 'Batch No': '00001', 'Seq No.': '0070',
      'Work Start': '2026-11-01 06:00:00', 'Work Result': '2026-11-01 07:00:00',
      'Production Qty': 99, 'Accepted Qty': 99, 'Bad Item Qty': 0
    }]), 'Sheet0');
    const plus = path.join(temp, 'plus.xlsx');
    xlsx.writeFile(workbook, plus);
    await scannerEngine.processFile(db, 'plusExcel', 'EXCEL', plus, 'plus.xlsx');
    record = (await db.execute('SELECT * FROM scan4m_records')).rows[0];
    assert.equal(record.finish_time, '2026-11-01 09:00:00');
    assert.equal(record.total_time, '60');
    assert.equal(record.total_sheet_indi, 99);
    writeCsv({ ...row, Time01: '', Time05: '' });
    await scannerEngine.processFile(db, 'wcsScan', 'CSV', csv, 'wcs.csv');
    await rematchScanRecords(db);
    record = (await db.execute('SELECT * FROM scan4m_records')).rows[0];
    assert.equal(record.finish_time, null);
    assert.equal(record.total_time, null);
    assert.equal(record.id, recordId);

    const token = signToken({ id: 'acc-admin', username: 'admin', fullName: 'Admin', roleId: 'role-admin', roleName: 'ADMIN',
      permissions: ['scan4m:view', 'scan4m:export', 'cvr4m:view', 'cvr4m:export', 'config:manage'] });
    server = createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    async function request(url) {
      const response = await fetch(base + url, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 200);
      return response;
    }
    // More than 500 rows demonstrates that 'all' does not hit the old API limit.
    for (const table of ['scan4m_records', 'cvr4m_records']) {
      for (let i = 0; i < 505; i++) await db.execute({
        sql: table === 'scan4m_records'
          ? `INSERT INTO scan4m_records (id,item_name,item_code,lot_no,match_key,wcs_record_id,match_status,seq_no,start_time,created_at,updated_at)
              VALUES (?,?,?,?,?,?,'UNMATCHED_PLUS','0070','2026-11-01 08:00:00','','')`
          : `INSERT INTO cvr4m_records (id,item_name,item_code,lot_no,start_time,created_at,updated_at)
              VALUES (?,?,?,?,'2026-11-01 08:00:00','','')`,
        args: table === 'scan4m_records'
          ? [table + i, 'Other product', 'CODE' + i, 'LOT' + i, 'key' + i, record.wcs_record_id]
          : [table + i, 'Other product', 'CODE' + i, 'LOT' + i]
      });
      if (table === 'cvr4m_records') await db.execute(`INSERT INTO cvr4m_records
        (id,item_name,item_code,lot_no,start_time,created_at,updated_at) VALUES ('target','Product_%','ITEM','00001','','','')`);
      const route = table === 'scan4m_records' ? '/scan4m' : '/cvr4m';
      const all = (await (await request(route + '/records?pageSize=all&page=9')).json()).data;
      assert.equal(all.records.length, 506);
      assert.equal(all.pagination.page, 1);
      assert.equal(all.pagination.totalPages, 1);
      assert.equal((await (await request(route + '/records?pageSize=50')).json()).data.records.length, 50);
      const filters = '?itemName=Product_%25&itemCode=ITEM&lotNo=00001';
      assert.equal((await (await request(route + '/records' + filters)).json()).data.records.length, 1);
      assert.equal((await (await request(route + '/records' + filters + 'NO')).json()).data.records.length, 0);
      const exported = xlsx.read(Buffer.from(await (await request(route + '/export' + filters)).arrayBuffer()), { type: 'buffer' });
      const output = xlsx.utils.sheet_to_json(exported.Sheets[exported.SheetNames[0]], { header: 1 });
      assert.ok(output.flat().includes('Product_%'));
      assert.ok(!output.flat().includes('Other product'));
    }

    // Background state, duplicate request guard, initial SSE snapshot and finally cleanup.
    const savedSources = configurationProvider.getSourceFiles().sources;
    const savedResolve = pathProvider.resolveInputDirectory;
    const savedProcessFile = scannerEngine.processFile;
    const savedBroadcast = sseManager.broadcast;
    const statuses = [];
    let release;
    try {
      configurationProvider.getSourceFiles().sources = { wcsScan: { enabled: true, type: 'CSV', pattern: '^wcs.csv$', subDirectory: '' } };
      pathProvider.resolveInputDirectory = async () => temp;
      scannerEngine.processFile = async () => { await new Promise(resolve => { release = resolve; }); return false; };
      sseManager.broadcast = function(event) { if (event.event === 'scanner_status') statuses.push(event.data.scanning); savedBroadcast.call(this, event); };
      const running = scannerEngine.scanOnce();
      while (!release) await new Promise(resolve => setTimeout(resolve, 1));
      assert.equal(scannerEngine.getStatus().scanning, true);
      assert.equal((await scannerEngine.scanOnce()).skipped, true);
      const abort = new AbortController();
      const stream = await fetch(base + '/realtime/stream', { signal: abort.signal });
      const reader = stream.body.getReader();
      const initial = new TextDecoder().decode((await reader.read()).value);
      assert.match(initial, /event: scanner_status/);
      assert.match(initial, /"scanning":true/);
      abort.abort();
      release();
      await running;
      assert.deepEqual(statuses, [true, false]);
      assert.equal(scannerEngine.getStatus().scanning, false);
      pathProvider.resolveInputDirectory = async () => { throw new Error('discovery failed'); };
      await assert.rejects(scannerEngine.scanOnce(), /discovery failed/);
      assert.equal(scannerEngine.getStatus().scanning, false);
      assert.deepEqual(statuses.slice(-2), [true, false]);
    } finally {
      configurationProvider.getSourceFiles().sources = savedSources;
      pathProvider.resolveInputDirectory = savedResolve;
      scannerEngine.processFile = savedProcessFile;
      sseManager.broadcast = savedBroadcast;
    }
    console.log('Report updates passed: latest WCS time, Plus independence, parser upgrade, null clearing, filters/export, all >500, scanner SSE/duplicate/failure.');
  } finally {
    Object.assign(scannerConfig, savedScannerConfig);
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await dbConnection.close();
    // Leave any temporarily locked SQLite file to the OS temp cleaner.
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
