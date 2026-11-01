import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xlsx from 'xlsx';
import jwt from 'jsonwebtoken';
import { getDb, dbConnection } from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrations.js';
import { ensureUniquePlusKeys } from '../src/database/plus-integrity.js';
import { ScannerEngine } from '../src/modules/scanner/scanner-engine.js';
import { configurationProvider } from '../src/config/configuration-provider.js';
import { pathProvider } from '../src/config/path-provider.js';
import { sseManager } from '../src/modules/realtime/sse-manager.js';
import { createApp } from '../src/app.js';
import { signToken } from '../src/middlewares/auth.middleware.js';
import { createClient } from '@libsql/client';

// Every database operation in this suite is isolated from the installed application.

process.env.JWT_SECRET = 'regression-test-secret-that-is-at-least-32-characters';
process.env.INITIAL_ADMIN_PASSWORD = 'RegressionAdmin123!';
process.env.INITIAL_USER_PASSWORD = 'RegressionUser123!';

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), '4m-regressions-'));
  process.env.APP_DATABASE_URL = 'file:' + path.join(temp,'test.sqlite').replace(/\\/g,'/');
  const db = getDb();
  const scanner = new ScannerEngine(() => db);
  const config = configurationProvider.getScannerConfig().scanner;
  const original = { ...config };
  config.stabilityCheckMs = 0;
  config.retryDelayMs = 0;
  const events: string[] = [];
  const broadcast = sseManager.broadcast.bind(sseManager);
  sseManager.broadcast = event => { events.push(event.event); };
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  try {
    await runMigrations();
    const book = (filename: string, records: object[]) => {
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(records), 'Sheet0');
      const file = path.join(temp, filename);
      xlsx.writeFile(workbook, file);
      return file;
    };
    const prod = (quantity: number, lot = '00001') => ({
      'Item Code Of Product': 'ITEM', 'Batch No': lot, 'Seq No.': '0070',
      'Work Start': '2026-11-01 07:00:00', 'Work Result': '2026-11-01 08:00:00',
      'Production Qty': quantity, 'Accepted Qty': quantity, 'Bad Item Qty': 0, 'PIC Code': 'OP', 'PIC Name': 'Operator'
    });
    const first = book('ayda-first.xlsx', [prod(10)]);
    await scanner.processFile(db, 'plusExcel', 'EXCEL', first, path.basename(first));
    const plusId = (await db.execute('SELECT id FROM plus_records')).rows[0].id;
    await db.execute("INSERT INTO wcs_records (id,file_id,match_key,item_code,batch_no,seq_no,start_time,created_at) SELECT 'wcs',id,'ITEM_00001_0070','ITEM','00001','0070','2026-11-01 07:00:00','' FROM source_files LIMIT 1");
    await db.execute(`INSERT INTO scan4m_records (id,match_key,wcs_record_id,plus_record_id,match_status,start_time,item_code,lot_no,seq_no,created_at,updated_at)
      VALUES ('scan','ITEM_00001_0070','wcs','${plusId}','MATCHED','2026-11-01 07:00:00','ITEM','00001','0070','','')`);
    const second = book('ayda-second.xlsx', [prod(25)]);
    await scanner.processFile(db, 'plusExcel', 'EXCEL', second, path.basename(second));
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM plus_records')).rows[0].n, 1);
    assert.equal((await db.execute('SELECT id FROM plus_records')).rows[0].id, plusId);
    assert.equal((await db.execute('SELECT total_sheet_indi FROM scan4m_records')).rows[0].total_sheet_indi, 25);
    assert.equal(await scanner.processFile(db, 'plusExcel', 'EXCEL', second, 'renamed.xlsx'), false);

    // Failure after the first valid row must roll back that row and keep FAILED metadata.
    await db.execute(`CREATE TRIGGER fail_second BEFORE INSERT ON plus_records WHEN NEW.batch_no='FAIL'
      BEGIN SELECT RAISE(ABORT,'injected write failure'); END`);
    const broken = book('ayda-broken.xlsx', [prod(1, 'ROLLBACK'), prod(2, 'FAIL')]);
    await assert.rejects(scanner.processFile(db, 'plusExcel', 'EXCEL', broken, path.basename(broken)), /injected write failure/);
    assert.equal((await db.execute("SELECT COUNT(*) AS n FROM plus_records WHERE batch_no='ROLLBACK'")).rows[0].n, 0);
    assert.equal((await db.execute("SELECT status FROM source_files WHERE file_name='ayda-broken.xlsx'")).rows[0].status, 'FAILED');
    await db.execute('DROP TRIGGER fail_second');
    await scanner.processFile(db, 'plusExcel', 'EXCEL', broken, path.basename(broken));
    assert.equal((await db.execute("SELECT COUNT(*) AS n FROM source_files WHERE file_name='ayda-broken.xlsx'")).rows[0].n, 1);

    // Old duplicate keys are consolidated without breaking derived record links.
    const legacy = createClient({ url: 'file:' + path.join(temp,'legacy.sqlite').replace(/\\/g,'/') });
    try {
      await legacy.execute('CREATE TABLE plus_records(id TEXT,match_key TEXT,created_at TEXT)');
      await legacy.execute('CREATE TABLE scan4m_records(match_key TEXT,plus_record_id TEXT)');
      await legacy.execute("INSERT INTO plus_records VALUES ('old','key','2026-01-01'),('new','key','2026-11-01')");
      await legacy.execute("INSERT INTO scan4m_records VALUES ('key','old')");
      await ensureUniquePlusKeys(legacy);
      await ensureUniquePlusKeys(legacy);
      assert.equal((await legacy.execute('SELECT id FROM plus_records')).rows[0].id, 'new');
      assert.equal((await legacy.execute('SELECT plus_record_id FROM scan4m_records')).rows[0].plus_record_id, 'new');
      await assert.rejects(legacy.execute("INSERT INTO plus_records VALUES ('duplicate','key','')"));
    } finally { legacy.close(); }

    // A normal scan cycle (including background callers) notifies clients and honors concurrency/retry.
    const sourceConfig = configurationProvider.getSourceFiles();
    const savedSources = sourceConfig.sources;
    const resolve = pathProvider.resolveInputDirectory;
    sourceConfig.sources = { plusExcel: { name: 'test', type: 'EXCEL', directory: temp, pattern: '^ayda-.*\\.xlsx$', enabled: true } };
    pathProvider.resolveInputDirectory = async () => temp;
    try {
      fs.copyFileSync(first, path.join(temp, 'ayda-duplicate.xlsx'));
      book('ayda-background.xlsx', [prod(30, 'BACKGROUND')]);
      events.length = 0;
      const result = await scanner.scanOnce();
      assert.ok(result.filesProcessed > 0);
      assert.ok(events.includes('data_imported'));
      // Retry one transient failure and demonstrate the worker limit.
      const processFile = scanner.processFile;
      let calls = 0, active = 0, maximum = 0;
      scanner.processFile = async () => {
        calls++;
        if (calls === 1) throw new Error('transient IO');
        maximum = Math.max(maximum, ++active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active--;
        return false;
      };
      config.maxConcurrentFiles = 2;
      config.retryAttempts = 1;
      await scanner.scanOnce();
      assert.equal(calls, fs.readdirSync(temp).filter(name => /^ayda-.*\.xlsx$/.test(name)).length + 1);
      assert.equal(maximum, 2);
      scanner.processFile = processFile;
      config.enabled = false;
      scanner.startPeriodicScan();
      assert.equal((scanner as any).intervalId, null);
    } finally {
      sourceConfig.sources = savedSources;
      pathProvider.resolveInputDirectory = resolve;
    }

    const raw = { 'Mã item': 'ITEM', 'Số lot': '00001', 'Công đoạn số': '0070', 'Tên sản phẩm': 'Product',
      'Tên thiết bị': 'Verify', 'Thời gian bắt đầu': '2026-11-01 07:00:00', 'Thời gian kết thúc': '2026-11-01 08:00:00' };
    await db.execute({ sql: `INSERT INTO cvr4m_records (id,item_code,lot_no,seq_no,start_time,machine,raw_wcs_json,created_at,updated_at)
      VALUES ('cvr','ITEM','00001','0070','2026-11-01 07:00:00','Verify',?,'','')`, args: [JSON.stringify(raw)] });
    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}/api/v1`;
    const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: process.env.INITIAL_ADMIN_PASSWORD }) });
    const token = (await login.json()).data.token;
    const request = async (endpoint: string, method = 'GET', body?: object) => fetch(base + endpoint, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    let response = await request('/mapping', 'POST', { itemName: 'Product', pcsPerSheet: 100, process: 'Test' });
    assert.equal(response.status, 201);
    const id = (await response.json()).data.id;
    assert.equal((await db.execute("SELECT total_pcs FROM cvr4m_records WHERE id='cvr'")).rows[0].total_pcs, 2500);
    response = await request('/mapping/' + id, 'PUT', { itemName: 'Product', pcsPerSheet: 200, process: 'Test' });
    assert.equal(response.status, 200);
    assert.equal((await db.execute("SELECT total_pcs FROM cvr4m_records WHERE id='cvr'")).rows[0].total_pcs, 5000);
    await request('/mapping/' + id, 'DELETE');
    assert.equal((await db.execute("SELECT total_pcs FROM cvr4m_records WHERE id='cvr'")).rows[0].total_pcs, null);
    await request('/mapping/' + id + '/restore', 'POST');
    assert.equal((await db.execute("SELECT total_pcs FROM cvr4m_records WHERE id='cvr'")).rows[0].total_pcs, 5000);
    assert.ok(events.includes('record_updated'));
    assert.equal((await request('/mapping/' + id, 'PUT', { itemName: 'Product', pcsPerSheet: -1, process: 'Test' })).status, 400);

    // A failed derived update must also roll back the mapping edit.
    await db.execute("CREATE TRIGGER fail_cvr BEFORE UPDATE ON cvr4m_records BEGIN SELECT RAISE(ABORT,'CVR failure'); END");
    assert.equal((await request('/mapping/' + id, 'PUT', { itemName: 'Product', pcsPerSheet: 300, process: 'Test' })).status, 500);
    assert.equal((await db.execute('SELECT pcs_per_sheet FROM item_mapping')).rows[0].pcs_per_sheet, 200);
    await db.execute('DROP TRIGGER fail_cvr');
    response = await request('/accounts', 'POST', { username: 'cvr-user', password: 'Password123!', fullName: 'CVR',
      permissions: ['cvr4m:view', 'cvr4m:export'] });
    assert.equal(response.status, 201);
    const user = (await (await request('/accounts')).json()).data.find((row: any) => row.username === 'cvr-user');
    await request('/accounts/' + user.id, 'PUT', { fullName: 'Renamed', permissions: user.permissions });
    assert.deepEqual((await (await request('/accounts')).json()).data.find((row: any) => row.id === user.id).permissions, ['cvr4m:view','cvr4m:export']);
    const cors = await fetch(base + '/auth/me', { headers: { Origin: 'https://untrusted.example', Authorization: `Bearer ${token}` } });
    assert.equal(cors.headers.get('access-control-allow-origin'), null);
    const appConfig = configurationProvider.getAppConfig().app;
    const expiration = appConfig.jwt.expiresIn;
    appConfig.jwt.expiresIn = '5m';
    const payload = jwt.decode(signToken({ id: 'test', username: 'test', fullName: '', roleId: '', roleName: '', permissions: [] })) as jwt.JwtPayload;
    assert.equal(payload.exp! - payload.iat!, 300);
    appConfig.jwt.expiresIn = expiration;
    console.log('Regression tests passed: atomic import/retry, unique Plus migration/upsert, matched Scan refresh, background SSE, concurrency, mapping CRUD rollback/rematch, CVR permissions, CORS and JWT config');
  } finally {
    scanner.stopPeriodicScan();
    Object.assign(config, original);
    sseManager.broadcast = broadcast;
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await dbConnection.close();
    try { fs.rmSync(temp, { recursive: true, force: true }); }
    catch { console.log('Temporary SQLite files pending process exit:', temp); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
