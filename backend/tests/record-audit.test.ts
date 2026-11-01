import './test-environment.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xlsx from 'xlsx';
import { getDb, dbConnection } from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrations.js';
import { createApp } from '../src/app.js';
import { ScannerEngine, scannerEngine } from '../src/modules/scanner/scanner-engine.js';
import { configurationProvider } from '../src/config/configuration-provider.js';
import { withWriteTransaction } from '../src/database/transaction.js';

async function main() {
  const db = getDb(); const scanner = new ScannerEngine(() => db);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'4m-record-audit-'));
  await runMigrations();
  const server = createApp().listen(0,'127.0.0.1');
  await new Promise<void>(resolve => server.once('listening',resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  const send = (endpoint: string, token = '', method = 'GET', body?: object) => fetch(base+endpoint,{
    method, headers: { 'Content-Type':'application/json',...(token ? { Authorization:'Bearer '+token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const login = async (username: string, password: string) => {
    const response = await send('/auth/login','','POST',{username,password}); assert.equal(response.status,200);
    return (await response.json()).data.token as string;
  };
  try {
    const admin = await login('admin',process.env.INITIAL_ADMIN_PASSWORD!);
    const csv = (file: string,headers: string[],values: Record<string,string>) => {
      const quote = (s: string) => '"' + s.replace(/"/g,'""') + '"';
      const location = path.join(temp,file);
      fs.writeFileSync(location,headers.map(quote).join(',')+'\n'+headers.map(key => quote(values[key] || '')).join(','));
      return location;
    };
    const scanValues = { 'Mã item':'ITEM','Số lot':'00001','Công đoạn số':'0070','Thời gian thao tác':'2026-11-01 07:00:00',
      'Ngày tháng':'2026-11-01','Ca':'Day','Tên sản phẩm':'Product','Tên thiết bị':'Scan','Số tấm input (Block)':'10' };
    const scanHeaders = [...new Set([...configurationProvider.getDataMapping().wcsRequiredColumns,...Object.keys(scanValues)])];
    let file = csv('scan.csv',scanHeaders,scanValues);
    await scanner.processFile(db,'wcsScan','CSV',file,'scan.csv');
    const rawCvr = { 'Mã item':'ITEM','Số lot':'00001','Công đoạn số':'0070','Tên sản phẩm':'Product',
      'Tên thiết bị':'Verify','Ngày tháng':'2026-11-01','Thời gian bắt đầu':'2026-11-01 07:00:00',
      'Thời gian kết thúc':'2026-11-01 08:00:00','Số tấm input':'10' };
    const cvrHeaders = [...new Set([...configurationProvider.getCvrDataMapping().wcsRequiredColumns,...Object.keys(rawCvr)])];
    file = csv('verify.csv',cvrHeaders,rawCvr);
    await scanner.processFile(db,'wcsCvr','CSV',file,'verify.csv');
    for (const report of ['scan4m','cvr4m']) {
      let response = await send('/'+report+'/records',admin); let rows = (await response.json()).data.records;
      assert.equal(rows.length,1); const id = rows[0].id;
      response = await send('/'+report+'/records/'+id+'/exclude',admin,'POST',{ reason:'Dòng thử cần loại bỏ' });
      assert.equal(response.status,200);
      assert.equal((await (await send('/'+report+'/records',admin)).json()).data.records.length,0);
      const stats = (await (await send('/'+report+'/stats',admin)).json()).data;
      assert.equal(report === 'scan4m' ? stats.totalRecords : stats.total,0);
      response = await send('/'+report+'/export',admin); assert.equal(response.status,200);
      const workbook = xlsx.read(Buffer.from(await response.arrayBuffer()));
      assert.equal(xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]).length,0);
      response = await send('/'+report+'/records?visibility=excluded',admin); rows = (await response.json()).data.records;
      assert.equal(rows.length,1);
      // Rebuilding the derived row gives it a new ID, but its business key stays excluded.
      await db.execute('DELETE FROM '+report+'_records');
      if (report === 'scan4m') file = csv('scan-updated.csv',scanHeaders,{...scanValues,'Số tấm input (Block)':'11'});
      else file = csv('verify-updated.csv',cvrHeaders,{...rawCvr,'Số tấm input':'11'});
      await scanner.processFile(db,report==='scan4m'?'wcsScan':'wcsCvr','CSV',file,path.basename(file));
      assert.equal((await (await send('/'+report+'/records',admin)).json()).data.records.length,0);
      const hidden = (await (await send('/'+report+'/records?visibility=excluded',admin)).json()).data.records[0];
      assert.notEqual(hidden.id,id);
      response = await send('/'+report+'/records/'+hidden.id+'/restore',admin,'POST',{}); assert.equal(response.status,200);
      assert.equal((await (await send('/'+report+'/records',admin)).json()).data.records.length,1);
      assert.equal((await (await send('/'+report+'/records?visibility=excluded',admin)).json()).data.records.length,0);
    }
    const scan = (await (await send('/scan4m/records',admin)).json()).data.records[0];
    await db.execute("CREATE TRIGGER fail_exclusion_audit BEFORE INSERT ON audit_logs WHEN NEW.action='EXCLUDE' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
    assert.equal((await send('/scan4m/records/'+scan.id+'/exclude',admin,'POST',{reason:'Must rollback'})).status,500);
    assert.equal((await (await send('/scan4m/records',admin)).json()).data.records.length,1);
    await db.execute('DROP TRIGGER fail_exclusion_audit');

    let response = await send('/accounts',admin,'POST',{username:'viewer',password:'ViewerPassword123!',fullName:'Viewer',permissions:['scan4m:view','cvr4m:view']});
    assert.equal(response.status,201); const accountId = (await response.json()).data.id;
    const viewer = await login('viewer','ViewerPassword123!');
    assert.equal((await send('/scan4m/records/'+scan.id+'/exclude',viewer,'POST',{reason:'Denied'})).status,403);
    assert.equal((await send('/scan4m/records?visibility=excluded',viewer)).status,403);
    assert.equal((await send('/audit',viewer)).status,403);
    assert.equal((await send('/accounts/'+accountId,admin,'PUT',{fullName:'Viewer updated',permissions:['scan4m:view','scan4m:manage','audit:view']})).status,200);
    assert.equal((await send('/scan4m/records/'+scan.id+'/exclude',viewer,'POST',{reason:'Allowed after grant'})).status,200);
    assert.equal((await send('/scan4m/records/'+scan.id+'/restore',viewer,'POST',{})).status,200);
    assert.equal((await send('/accounts/'+accountId+'/toggle',admin,'PATCH')).status,200);
    assert.equal((await send('/accounts/'+accountId+'/toggle',admin,'PATCH')).status,200);
    assert.equal((await send('/accounts/'+accountId+'/reset-password',admin,'POST',{newPassword:'NewViewerPassword123!'})).status,200);
    const viewer2 = await login('viewer','NewViewerPassword123!');
    assert.equal((await send('/auth/change-password',viewer2,'POST',{currentPassword:'NewViewerPassword123!',newPassword:'FinalViewerPassword123!'})).status,200);
    assert.equal((await send('/auth/logout',viewer2,'POST')).status,200);

    response = await send('/mapping',admin,'POST',{itemName:'Product',pcsPerSheet:100,process:'Test'}); const mappingId=(await response.json()).data.id;
    await send('/mapping/'+mappingId,admin,'PUT',{itemName:'Product',pcsPerSheet:200,process:'Changed'});
    await send('/mapping/'+mappingId,admin,'DELETE');
    await send('/mapping/'+mappingId+'/restore',admin,'POST');
    const original = scannerEngine.scanOnce;
    scannerEngine.scanOnce = async () => ({filesProcessed:0,errors:0,skipped:true});
    try { assert.equal((await send('/scan4m/trigger-scan',admin,'POST')).status,200); }
    finally { scannerEngine.scanOnce = original; }
    await withWriteTransaction(async () => undefined); // Drain request-completion audits.
    response = await send('/audit?pageSize=200',admin); assert.equal(response.status,200);
    const audit = (await response.json()).data.records;
    for (const action of ['LOGIN','LOGOUT','CREATE','UPDATE','DELETE','EXCLUDE','RESTORE','EXPORT','MANUAL_SCAN','TOGGLE_ACTIVE','RESET_PASSWORD','CHANGE_PASSWORD','VIEW']) {
      assert.ok(audit.some((row: any) => row.action===action),action+' must be audited');
    }
    assert.ok(audit.some((row: any) => row.outcome==='FAILED'));
    assert.ok(audit.some((row: any) => row.action==='VIEW' && row.outcome==='SUCCESS' && row.resource==='/api/v1/scan4m/records'));
    assert.ok(audit.every((row: any) => row.username && row.created_at));
    assert.ok(!JSON.stringify(audit).includes('ViewerPassword123'));
    assert.ok(!JSON.stringify(audit).includes('password_hash'));
    const accountUpdate=audit.find((row: any) => row.action==='UPDATE' && row.resource==='accounts');
    assert.ok(JSON.parse(accountUpdate.details).before.length);
    response=await send('/audit?action=EXCLUDE&search=Allowed',admin);
    assert.equal((await response.json()).data.records.length,1);
    await runMigrations(); // Existing installations remain migratable and exclusions survive refresh.
    console.log('Record/audit tests passed: both reports hide from list/stats/Excel, survive rebuild, restore, require permission, rollback on audit failure; account/mapping/auth/export/manual/read audit and redaction verified');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await dbConnection.close(); fs.rmSync(temp,{recursive:true,force:true});
  }
}
main().catch(error => { console.error(error);process.exitCode=1; });
