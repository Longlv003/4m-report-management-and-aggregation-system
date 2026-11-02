const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'4m-wcs-children-'));
process.env.APP_DATABASE_URL='file:'+path.join(temp,'test.sqlite').replace(/\\/g,'/');
process.env.JWT_SECRET='wcs-child-test-secret-at-least-32-characters';
process.env.INITIAL_ADMIN_PASSWORD='WcsChildrenAdmin123!';
process.env.INITIAL_USER_PASSWORD='WcsChildrenUser123!';
const {selectPlusProduction}=require('../dist/domain/plus-production-match');
const {runMigrations}=require('../dist/database/migrations');
const {getDb,dbConnection}=require('../dist/database/connection');
const {ScannerEngine}=require('../dist/modules/scanner/scanner-engine');
const {rematchScanRecords}=require('../dist/modules/matcher/scan-matching-engine');
const {configurationProvider}=require('../dist/config/configuration-provider');

async function main(){
  const rows=[{id:'a',itemCode:'ITEM',lotNo:'00022-01',seqNo:'0370',quantity:140},
    {id:'b',itemCode:'ITEM',lotNo:'00022-02',seqNo:'0370',quantity:183}];
  let m=selectPlusProduction(rows,'ITEM','00022','0370',['00022-01','00022-02']);
  assert.equal(m.method,'WCS_CHILD_PRESENT');assert.equal(m.quantity,null);assert.equal(m.records.length,0);
  assert.equal(selectPlusProduction(rows,'ITEM','00022','0370',['00022-01']).quantity,null);
  assert.equal(selectPlusProduction(rows,'ITEM','00022','0370',['0002201','00022-X']).quantity,323);
  assert.equal(selectPlusProduction([...rows,{id:'parent',itemCode:'ITEM',lotNo:'00022',seqNo:'0370',quantity:500}],
    'ITEM','00022','0370',['00022-01']).quantity,500);
  const db=getDb(),scanner=new ScannerEngine(()=>db);const config=configurationProvider.getScannerConfig().scanner;
  const old=config.stabilityCheckMs;config.stabilityCheckMs=0;let serial=0;
  try{
    await runMigrations();
    await db.execute(`INSERT INTO source_files(id,file_path,file_name,file_type,source_system,file_size,sha256,detected_at,status)
      VALUES ('plus-file','','','EXCEL','plusExcel',0,'fixture','','SUCCESS')`);
    async function plus(item,lot,seq,qty){const id='plus-'+(++serial);await db.execute({
      sql:`INSERT INTO plus_records(id,file_id,match_key,item_code,batch_no,seq_no,prod_qty,work_result,created_at)
        VALUES (?,'plus-file',?,?,?,?,?,'2026-11-01 09:00:00','')`,args:[id,item+'_'+lot+'_'+seq,item,lot,seq,qty]});return id;}
    async function pair(item,lot,seq,a=10,b=20){await plus(item,lot+'-01',seq,a);await plus(item,lot+'-02',seq,b);}
    const raw=(item,lot,seq)=>({'Mã item':item,'Số lot':lot,'Công đoạn số':seq,'Tên sản phẩm':'Product','Tên thiết bị':'Scan',
      'Thời gian thao tác':'2026-11-01 07:00:00','Time01':'2026-11-01 08:00:00','Số tấm input (Block)':'5'});
    const cvrRaw=(item,lot,seq)=>({'Mã item':item,'Số lot':lot,'Công đoạn số':seq,'Tên sản phẩm':'Product','Tên thiết bị':'Verify',
      'Thời gian bắt đầu':'2026-11-01 07:00:00','Thời gian kết thúc':'2026-11-01 08:00:00','Số tấm input':'2'});
    async function importRows(source,rows){
      const required=source==='wcsScan'?configurationProvider.getDataMapping().wcsRequiredColumns:configurationProvider.getCvrDataMapping().wcsRequiredColumns;
      const columns=[...new Set([...required,...rows.flatMap(row=>Object.keys(row))])];
      const file=path.join(temp,source+'-'+(++serial)+'.csv');
      fs.writeFileSync(file,columns.join(',')+'\n'+rows.map(row=>columns.map(c=>row[c]||'').join(',')).join('\n'));
      await scanner.processFile(db,source,'CSV',file,path.basename(file));return file;
    }
    async function find(report,item,lot,seq){return(await db.execute({sql:`SELECT * FROM ${report}_records WHERE item_code=? AND lot_no=? AND seq_no=?`,args:[item,lot,seq]})).rows[0];}
    await pair('ITEM','00022','0370',140,183);
    // Same lot suffix on another item/sequence must not reserve these Plus rows.
    await importRows('wcsScan',[raw('ITEM','00022','0370'),raw('OTHER','00022-01','0370'),raw('ITEM','00022-02','0380')]);
    let parent=await find('scan4m','ITEM','00022','0370');const parentId=parent.id;
    assert.equal(parent.total_sheet_indi,323);assert.equal(parent.plus_match_method,'SPLIT');
    // A child arriving in a later file must invalidate the parent in that same transaction.
    await importRows('wcsScan',[raw('ITEM','00022-01','0370')]);
    parent=await find('scan4m','ITEM','00022','0370');
    assert.equal(parent.id,parentId);assert.equal(parent.total_sheet_indi,null);assert.equal(parent.plus_match_method,'WCS_CHILD_PRESENT');
    assert.equal((await find('scan4m','ITEM','00022-01','0370')).total_sheet_indi,140);
    await importRows('wcsScan',[raw('ITEM','00022-02','0370')]);
    assert.equal((await find('scan4m','ITEM','00022-02','0370')).total_sheet_indi,183);
    assert.equal((await find('scan4m','ITEM','00022','0370')).total_sheet_indi,null);
    const direct=await plus('ITEM','00022','0370',500);await rematchScanRecords(db);
    assert.equal((await find('scan4m','ITEM','00022','0370')).total_sheet_indi,500);
    await db.execute({sql:'DELETE FROM plus_records WHERE id=?',args:[direct]});await rematchScanRecords(db);
    assert.equal((await find('scan4m','ITEM','00022','0370')).total_sheet_indi,null);

    // Entire incoming batches are considered, in either row order, for both reports.
    for(const source of ['wcsScan','wcsCvr'])for(const reverse of [false,true]){
      const report=source==='wcsScan'?'scan4m':'cvr4m',make=source==='wcsScan'?raw:cvrRaw;
      const lot=source+(reverse?'R':'F');await pair('BATCH',lot,'0070');
      const batch=[make('BATCH',lot,'0070'),make('BATCH',lot+'-01','0070'),make('BATCH',lot+'-02','0070')];
      if(reverse)batch.reverse();await importRows(source,batch);
      assert.equal((await find(report,'BATCH',lot,'0070')).plus_match_method,'WCS_CHILD_PRESENT');
      assert.equal((await find(report,'BATCH',lot+'-01','0070')).total_sheet_indi,10);
      assert.equal((await find(report,'BATCH',lot+'-02','0070')).total_sheet_indi,20);
    }
    // WCS identity is global across the Scan and CVR reports, scoped to the same item/sequence.
    await pair('CROSS','01000','0070');await importRows('wcsScan',[raw('CROSS','01000','0070')]);
    assert.equal((await find('scan4m','CROSS','01000','0070')).total_sheet_indi,30);
    await importRows('wcsCvr',[cvrRaw('CROSS','01000-01','0070')]);
    assert.equal((await find('scan4m','CROSS','01000','0070')).plus_match_method,'WCS_CHILD_PRESENT');
    await db.execute("INSERT INTO item_mapping(id,item_name,seq_no,pcs_per_sheet,created_at,updated_at) VALUES ('map','Product','0080',10,'','')");
    await pair('REVERSE','02000','0080',11,19);await importRows('wcsCvr',[cvrRaw('REVERSE','02000','0080')]);
    let cvrParent=await find('cvr4m','REVERSE','02000','0080');const cvrId=cvrParent.id;
    assert.equal(cvrParent.total_pcs,300);assert.equal(cvrParent.total_pcs_cvr,20);
    await importRows('wcsScan',[raw('REVERSE','02000-01','0080')]);
    cvrParent=await find('cvr4m','REVERSE','02000','0080');
    assert.equal(cvrParent.id,cvrId);assert.equal(cvrParent.total_sheet_indi,null);assert.equal(cvrParent.total_pcs,null);
    assert.equal(cvrParent.total_pcs_cvr,20);assert.equal(cvrParent.plus_match_method,'WCS_CHILD_PRESENT');

    // Failure while invalidating a parent rolls back the newly imported child as well.
    await pair('ROLLBACK','03000','0070');await importRows('wcsScan',[raw('ROLLBACK','03000','0070')]);
    await db.execute("CREATE TRIGGER fail_parent BEFORE UPDATE ON scan4m_records WHEN OLD.item_code='ROLLBACK' AND OLD.lot_no='03000' BEGIN SELECT RAISE(ABORT,'parent update failure'); END");
    await assert.rejects(importRows('wcsScan',[raw('ROLLBACK','03000-01','0070')]),/parent update failure/);
    assert.equal((await find('scan4m','ROLLBACK','03000','0070')).total_sheet_indi,30);
    assert.equal(await find('scan4m','ROLLBACK','03000-01','0070'),undefined);
    assert.equal((await db.execute("SELECT COUNT(*) AS n FROM wcs_records WHERE item_code='ROLLBACK' AND batch_no='03000-01'")).rows[0].n,0);
    await db.execute('DROP TRIGGER fail_parent');
    await importRows('wcsScan',[raw('ROLLBACK','03000-01','0070')]);
    assert.equal((await find('scan4m','ROLLBACK','03000','0070')).plus_match_method,'WCS_CHILD_PRESENT');
    console.log('WCS child ownership passed: parent/children coexistence, exact-parent priority, item/sequence isolation, batch order independence, late child invalidation, cross-report ownership, recalculated PCS and atomic rollback.');
  }finally{config.stabilityCheckMs=old;await dbConnection.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
