const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'4m-cvr-pcs-'));
process.env.APP_DATABASE_URL='file:'+path.join(temp,'test.sqlite').replace(/\\/g,'/');
process.env.JWT_SECRET='cvr-pcs-test-secret-at-least-32-characters';
process.env.INITIAL_ADMIN_PASSWORD='CvrPcsAdmin123!';
process.env.INITIAL_USER_PASSWORD='CvrPcsUser123!';
const {runMigrations,ensureCvrPcsColumn}=require('../dist/database/migrations');
const {getDb,dbConnection}=require('../dist/database/connection');
const {CvrMatchingEngine}=require('../dist/modules/matcher/cvr-matching-engine');
const {parseCvrWcsRow}=require('../dist/modules/parser/cvr-wcs-parser');
const {createApp}=require('../dist/app');
const {signToken}=require('../dist/middlewares/auth.middleware');
const xlsx=require('xlsx');

async function main(){
  const db=getDb();let server;
  try{
    await runMigrations();
    // Exercise the column migration on an existing table, twice.
    await db.execute('ALTER TABLE cvr4m_records DROP COLUMN total_pcs_cvr');
    await ensureCvrPcsColumn(db);await ensureCvrPcsColumn(db);
    await db.execute(`INSERT INTO source_files(id,file_path,file_name,file_type,source_system,file_size,sha256,detected_at,status)
      VALUES ('source','','','CSV','test',0,'test','','SUCCESS')`);
    await db.execute(`INSERT INTO plus_records(id,file_id,match_key,item_code,batch_no,seq_no,work_result,prod_qty,created_at)
      VALUES ('plus','source','ITEM_LOT_0350','ITEM','LOT','0350','2026-11-01 09:00:00',10,'')`);
    await db.execute(`INSERT INTO plus_error_records(id,file_id,item_code,batch_no,process_type,d1,created_at)
      VALUES ('error','source','ITEM','LOT','AEA',10,'')`);
    for(const [seq,pcs] of [['0350',100],['0600',200]])await db.execute({
      sql:"INSERT INTO item_mapping(id,item_name,seq_no,pcs_per_sheet,created_at,updated_at) VALUES (?,'Product',?,?,'','')",args:[seq,seq,pcs]});
    const raw={'Mã item':'ITEM','Số lot':'LOT','Công đoạn số':'0350','Tên sản phẩm':'Product',
      'Tên thiết bị':'Verify','Thời gian bắt đầu':'2026-11-01 07:00:00','Thời gian kết thúc':'2026-11-01 08:00:00','Số tấm input':'2'};
    const engine=new CvrMatchingEngine(()=>db);
    await engine.processAndMatchCvrRecords([
      parseCvrWcsRow(raw),parseCvrWcsRow({...raw,'Công đoạn số':'0600','Số tấm input':'3'}),
      parseCvrWcsRow({...raw,'Công đoạn số':'9999','Số tấm input':'4'})
    ],'source');
    const records=()=>db.execute('SELECT * FROM cvr4m_records ORDER BY seq_no');
    let rows=(await records()).rows;
    assert.deepEqual(rows.map(r=>r.total_pcs),[1000,2000,null]);
    assert.deepEqual(rows.map(r=>r.total_pcs_cvr),[200,600,null]);
    assert.equal(rows[0].ng_rate,1); // Existing %NG continues to use the lot denominator.
    const originalId=rows[0].id;
    server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const token=signToken({id:'acc-admin',username:'admin',fullName:'Admin',roleId:'role-admin',roleName:'ADMIN',permissions:['cvr4m:view','cvr4m:export']});
    const base=`http://127.0.0.1:${server.address().port}/api/v1/cvr4m`;
    const headers={Authorization:'Bearer '+token};
    const response=await fetch(base+'/export',{headers});assert.equal(response.status,200);
    const book=xlsx.read(Buffer.from(await response.arrayBuffer()));
    const sheet=book.Sheets[book.SheetNames[0]];
    const columns=xlsx.utils.sheet_to_json(sheet,{header:1})[0];
    assert.equal(columns[columns.indexOf('Total pcs (lot)')+1],'Total pcs (cvr)');
    const exported=xlsx.utils.sheet_to_json(sheet);const first=exported.find(r=>r['Seq no']==='0350');
    assert.equal(first['Total pcs (lot)'],1000);assert.equal(first['Total pcs (cvr)'],200);
    const payload=await(await fetch(base+'/records?pageSize=all',{headers})).json();
    assert.equal(payload.data.records.find(r=>r.seq_no==='0350').total_pcs_cvr,200);
    await engine.processAndMatchCvrRecords([parseCvrWcsRow({...raw,'Số tấm input':'0'})],'source');
    rows=(await records()).rows;assert.equal(rows[0].id,originalId);assert.equal(rows[0].total_pcs_cvr,0);
    await db.execute("UPDATE item_mapping SET pcs_per_sheet=120 WHERE seq_no='0600'");
    await engine.rematchCvrRecords();assert.equal((await records()).rows[1].total_pcs_cvr,360);
    await db.execute('DELETE FROM plus_records');await engine.rematchCvrRecords();
    rows=(await records()).rows;assert.ok(rows.every(r=>r.total_pcs===null));assert.equal(rows[1].total_pcs_cvr,360);
    await db.execute("UPDATE item_mapping SET is_deleted=1 WHERE seq_no='0600'");await engine.rematchCvrRecords();
    assert.equal((await records()).rows[1].total_pcs_cvr,null);
    console.log('CVR PCS tests passed: insert/update, distinct lot/VRF quantities, exact sequence mapping, zero/missing inputs, independent Plus data, rematch, API, migration and Excel columns/values.');
  }finally{
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await dbConnection.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
