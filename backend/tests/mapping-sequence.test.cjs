const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createClient } = require('@libsql/client');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), '4m-mapping-seq-'));
process.env.APP_DATABASE_URL = 'file:' + path.join(temp, 'test.sqlite').replace(/\\/g, '/');
process.env.JWT_SECRET = 'mapping-seq-test-secret-at-least-32-characters';
process.env.INITIAL_ADMIN_PASSWORD = 'MappingSequence123!';
process.env.INITIAL_USER_PASSWORD = 'MappingSeqUser123!';
const { runMigrations } = require('../dist/database/migrations');
const { ensureMappingSequence } = require('../dist/database/mapping-sequence-migration');
const { parseItemMappingText } = require('../dist/modules/parser/item-mapping-parser');
const { prepareItemMappings, importItemMappings } = require('../dist/application/import-item-mappings');
const { ItemMappingRepository } = require('../dist/infrastructure/repositories/item-mapping-repository');
const { auditedMutation } = require('../dist/composition/audited-mutation');
const { CvrMatchingEngine } = require('../dist/modules/matcher/cvr-matching-engine');
const { getDb, dbConnection } = require('../dist/database/connection');
const { createApp } = require('../dist/app');
const { signToken } = require('../dist/middlewares/auth.middleware');

async function main() {
  const legacy = createClient({ url: 'file:' + path.join(temp, 'legacy.sqlite').replace(/\\/g, '/') });
  try {
    await legacy.execute(`CREATE TABLE item_mapping (id TEXT PRIMARY KEY,item_name TEXT NOT NULL UNIQUE,
      pcs_per_sheet INTEGER NOT NULL DEFAULT 0,process TEXT,is_deleted INTEGER)`);
    await legacy.execute("INSERT INTO item_mapping VALUES ('old','Product',100,'Old',1)");
    await ensureMappingSequence(legacy);
    await ensureMappingSequence(legacy);
    const old = (await legacy.execute('SELECT * FROM item_mapping')).rows[0];
    assert.equal(old.id, 'old'); assert.equal(old.is_deleted, 1); assert.equal(old.seq_no, '');
    await legacy.execute("INSERT INTO item_mapping(id,item_name,seq_no,pcs_per_sheet) VALUES ('seq','Product','0350',NULL)");
    await assert.rejects(legacy.execute("INSERT INTO item_mapping(id,item_name,seq_no) VALUES ('duplicate','Product','0350')"), /UNIQUE/);
  } finally { legacy.close(); }
  const parsed = parseItemMappingText('Item name\tSeq no\tPT/1SH\tCÔNG ĐOẠN\tBUILD\tMODEL\nProduct\t" \t0350"\t96\t\tP1\t2024\nProduct\t0350\t174\tElectroless\tP2\t2024\nProduct\t0350\t\t\t\t\nMissing\t0600\t\t\t\t');
  const prepared = prepareItemMappings(parsed);
  assert.equal(prepared.rows.length, 2);
  assert.equal(prepared.rows[0].seqNo, '0350');
  assert.equal(prepared.rows[0].pcsPerSheet, 174);
  assert.equal(prepared.rows[0].build, 'P2');
  assert.equal(prepared.rows[1].pcsPerSheet, null);
  assert.equal(prepared.conflictingPairs, 1);
  assert.throws(() => parseItemMappingText('Wrong\tHeaders\n1\t2'), /Item name/);

  const db = getDb(); let server;
  try {
    await runMigrations();
    await db.execute(`INSERT INTO source_files(id,file_path,file_name,file_type,source_system,file_size,sha256,detected_at,status)
      VALUES ('source','','','CSV','test',0,'test','','SUCCESS')`);
    await db.execute(`INSERT INTO plus_records(id,file_id,match_key,item_code,batch_no,seq_no,work_result,prod_qty,created_at)
      VALUES ('plus','source','ITEM_00001_0350','ITEM','00001','0350','2026-11-01 09:00:00',10,'')`);
    for (const seq of ['0350','0600','035','0999']) {
      const raw = { 'Mã item': 'ITEM', 'Số lot': '00001', 'Công đoạn số': seq, 'Tên sản phẩm': 'Product',
        'Tên thiết bị': 'Verify', 'Thời gian bắt đầu': '2026-11-01 07:00:00', 'Thời gian kết thúc': '2026-11-01 08:00:00' };
      await db.execute({ sql: `INSERT INTO cvr4m_records(id,item_name,item_code,lot_no,seq_no,machine,start_time,raw_wcs_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,'','')`, args: [seq,'Product','ITEM','00001',seq,'Verify',raw['Thời gian bắt đầu'],JSON.stringify(raw)] });
    }
    // Legacy item-only mappings must not supply a denominator for any sequence.
    await db.execute("INSERT INTO item_mapping(id,item_name,seq_no,pcs_per_sheet,created_at,updated_at) VALUES ('unassigned','Product','',999,'','')");
    server = createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const token = signToken({ id: 'acc-admin', username: 'admin', fullName: 'Admin', roleId: 'role-admin', roleName: 'ADMIN', permissions: ['mapping:view','mapping:manage'] });
    const send = (route, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}/api/v1` + route, {
      method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    assert.equal((await send('/mapping','POST',{itemName:'Product',pcsPerSheet:96})).status,400);
    let response = await send('/mapping','POST',{itemName:'Product',seqNo:' \t0350 ',pcsPerSheet:96,process:'Electroless',build:'P1',model:'2024'});
    assert.equal(response.status,201); const firstId=(await response.json()).data.id;
    response=await send('/mapping','POST',{itemName:'Product',seqNo:'0600',pcsPerSheet:174});
    assert.equal(response.status,201); const secondId=(await response.json()).data.id;
    assert.equal((await send('/mapping','POST',{itemName:'Product',seqNo:'0350',pcsPerSheet:1})).status,409);
    assert.equal((await send('/mapping/'+secondId,'PUT',{itemName:'Product',seqNo:'0350',pcsPerSheet:1})).status,409);
    async function pcs() { return Object.fromEntries((await db.execute('SELECT seq_no,total_pcs FROM cvr4m_records')).rows.map(r=>[r.seq_no,r.total_pcs])); }
    assert.deepEqual(await pcs(), {'0350':960,'0600':1740,'035':null,'0999':null});
    assert.equal((await send('/mapping/'+firstId,'PUT',{itemName:'Product',seqNo:'0350',pcsPerSheet:112})).status,200);
    assert.equal((await pcs())['0350'],1120); assert.equal((await pcs())['0600'],1740);
    assert.equal((await send('/mapping/'+firstId,'DELETE')).status,200);
    assert.equal((await pcs())['0350'],null); assert.equal((await pcs())['0600'],1740);
    assert.equal((await send('/mapping/'+firstId+'/restore','POST',{})).status,200);
    assert.equal((await pcs())['0350'],1120);
    assert.equal((await send('/mapping','POST',{itemName:'Product',seqNo:'0999',pcsPerSheet:null})).status,201);
    assert.equal((await pcs())['0999'],null);
    const search=(await (await send('/mapping?search=0600')).json()).data;
    assert.equal(search.length,1); assert.equal(search[0].seq_no,'0600');
    await db.execute("CREATE TRIGGER fail_mapping_import BEFORE UPDATE ON cvr4m_records BEGIN SELECT RAISE(ABORT,'injected CVR failure'); END");
    const actor={id:'acc-admin',username:'admin'};
    await assert.rejects(auditedMutation(actor,'item_mapping','IMPORT',undefined,async tx=>{
      await importItemMappings(new ItemMappingRepository(tx),parsed,actor.id);
      await new CvrMatchingEngine(()=>tx).rematchCvrRecords();
    }),/injected CVR failure/);
    assert.equal((await db.execute("SELECT pcs_per_sheet FROM item_mapping WHERE id='"+firstId+"'")).rows[0].pcs_per_sheet,112);
    assert.equal((await db.execute("SELECT COUNT(*) AS n FROM item_mapping WHERE item_name='Missing'")).rows[0].n,0);
    await db.execute('DROP TRIGGER fail_mapping_import');
    console.log('Mapping sequence tests passed: legacy migration, quoted TSV/duplicates/blanks, exact item+seq match, leading zeroes, CRUD/search/rematch, isolation across sequences and atomic import rollback.');
  } finally {
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await dbConnection.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
