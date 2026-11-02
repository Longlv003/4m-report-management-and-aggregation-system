const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'4m-plus-match-'));
process.env.APP_DATABASE_URL='file:'+path.join(temp,'test.sqlite').replace(/\\/g,'/');
process.env.JWT_SECRET='plus-match-test-secret-at-least-32-characters';
process.env.INITIAL_ADMIN_PASSWORD='PlusMatchAdmin123!';
process.env.INITIAL_USER_PASSWORD='PlusMatchUser123!';
const {selectPlusProduction}=require('../dist/domain/plus-production-match');
const {PlusProductionMatcher}=require('../dist/application/plus-production-matcher');
const {SqlPlusProductionRepository}=require('../dist/infrastructure/repositories/plus-production-repository');
const {SqlWcsLotRepository}=require('../dist/infrastructure/repositories/wcs-lot-repository');
const {ensurePlusMatchColumns}=require('../dist/database/plus-match-migration');
const {runMigrations}=require('../dist/database/migrations');
const {getDb,dbConnection}=require('../dist/database/connection');
const {ScannerEngine}=require('../dist/modules/scanner/scanner-engine');
const {rematchScanRecords}=require('../dist/modules/matcher/scan-matching-engine');
const {CvrMatchingEngine}=require('../dist/modules/matcher/cvr-matching-engine');
const {parseCvrWcsRow}=require('../dist/modules/parser/cvr-wcs-parser');
const {configurationProvider}=require('../dist/config/configuration-provider');
const {createApp}=require('../dist/app');const {signToken}=require('../dist/middlewares/auth.middleware');
const xlsx=require('xlsx');

async function main(){
  const candidate=(lot,seq,qty,item='ITEM')=>({id:lot+'_'+seq,itemCode:item,lotNo:lot,seqNo:seq,quantity:qty});
  const rows=[candidate('00022-01','0370',140),candidate('00022-02','0370',183),
    candidate('00022-01','0380',140),candidate('00022-01','0150',324),candidate('00022-02','0150',0),
    candidate('0002201','0370',999),candidate('00022-X','0370',999),candidate('00022-03','0370',999,'OTHER')];
  let match=selectPlusProduction(rows,'ITEM','00022','0370');
  assert.equal(match.method,'SPLIT');assert.equal(match.quantity,323);assert.equal(match.records.length,2);
  match=selectPlusProduction(rows,'ITEM','00022','0380');assert.equal(match.method,'INCOMPLETE_SPLIT');
  assert.equal(match.quantity,null);assert.deepEqual(match.missingLots,['00022-02']);
  assert.equal(selectPlusProduction(rows,'ITEM','00022-02','0380').quantity,null);
  assert.equal(selectPlusProduction(rows,'ITEM','00022','370').quantity,null);
  assert.equal(selectPlusProduction([...rows,candidate('00022','0370',500)],'ITEM','00022','0370').quantity,500);
  assert.equal(selectPlusProduction([...rows,candidate('00022','0370',0)],'ITEM','00022','0370').quantity,0);
  assert.equal(selectPlusProduction([...rows,candidate('00022-01-01','0370',10)],'ITEM','00022','0370').method,'INCOMPLETE_SPLIT');
  assert.equal(selectPlusProduction([...rows,candidate('00022-01','0370',140)],'ITEM','00022','0370').quantity,null);
  assert.equal(selectPlusProduction([candidate('LOT-01','0070',10),candidate('LOT-02','0070',null)],'ITEM','LOT','0070').quantity,null);
  assert.equal(selectPlusProduction([candidate('LOT-01','0070',10),candidate('LOT-02','0070',0)],'ITEM','LOT','0070').quantity,10);

  const db=getDb();let server;const scannerConfig=configurationProvider.getScannerConfig().scanner;
  const oldStability=scannerConfig.stabilityCheckMs;scannerConfig.stabilityCheckMs=0;
  try{
    await runMigrations();await ensurePlusMatchColumns(db);await ensurePlusMatchColumns(db);
    const scanner=new ScannerEngine(()=>db);const csv=path.join(temp,'scan.csv');
    const scanRow={'Mã item':'ITEM','Số lot':'00022','Công đoạn số':'0370','Tên sản phẩm':'Product','Tên thiết bị':'AOI #12',
      'Thời gian thao tác':'2026-10-30 19:51:14','Time01':'2026-10-30 23:30:00','Số tấm input (Block)':'185'};
    const scanRows=[scanRow,{...scanRow,'Tên thiết bị':'AOI #3','Thời gian thao tác':'2026-10-30 22:55:00','Số tấm input (Block)':'136'}];
    const columns=[...new Set([...configurationProvider.getDataMapping().wcsRequiredColumns,...Object.keys(scanRow)])];
    function writeScan(values){fs.writeFileSync(csv,columns.join(',')+'\n'+values.map(row=>columns.map(c=>row[c]||'').join(',')).join('\n'));}
    writeScan(scanRows);await scanner.processFile(db,'wcsScan','CSV',csv,'scan.csv');
    assert.ok((await db.execute('SELECT * FROM scan4m_records')).rows.every(r=>r.total_sheet_indi===null));
    const sourceId=(await db.execute('SELECT id FROM source_files LIMIT 1')).rows[0].id;
    async function addPlus(id,lot,seq,qty,item='ITEM'){
      await db.execute({sql:`INSERT INTO plus_records(id,file_id,match_key,item_code,batch_no,seq_no,prod_qty,work_result,created_at)
        VALUES (?,?,?,?,?,?,?,'2026-10-31 02:18:51','2026-11-01')`,args:[id,sourceId,item+'_'+lot+'_'+seq,item,lot,seq,qty]});
    }
    for(const [i,row]of rows.entries())await addPlus('p'+i,row.lotNo,row.seqNo,row.quantity,row.itemCode);
    const matcher=new PlusProductionMatcher(new SqlPlusProductionRepository(db),new SqlWcsLotRepository(db));
    assert.equal((await matcher.match('ITEM','00022','0370')).quantity,323);
    // LIKE wildcards in a lot are literal identifiers and must never broaden the family.
    await addPlus('literal','L_%-01','0070',7);await addPlus('unrelated','LXX-01','0070',999);
    assert.equal((await matcher.match('ITEM','L_%','0070')).quantity,7);
    await rematchScanRecords(db);
    let scans=(await db.execute('SELECT * FROM scan4m_records')).rows;
    assert.equal(scans.length,2);assert.ok(scans.every(r=>r.total_sheet_indi===323&&r.match_status==='MATCHED'));
    assert.ok(scans.every(r=>r.plus_record_id===null&&r.plus_match_method==='SPLIT'&&r.finish_time==='2026-10-30 23:30:00'));
    const ids=new Set(scans.map(r=>r.id));
    writeScan([...scanRows,{...scanRow,'Tên thiết bị':'AOI #9'}]);
    await scanner.processFile(db,'wcsScan','CSV',csv,'scan-updated.csv');
    scans=(await db.execute('SELECT * FROM scan4m_records')).rows;
    assert.equal(scans.length,3);assert.ok(scans.every(r=>r.total_sheet_indi===323));assert.equal(scans.filter(r=>ids.has(r.id)).length,2);
    for(const seq of ['0370','0380'])await db.execute({sql:"INSERT INTO item_mapping(id,item_name,seq_no,pcs_per_sheet,created_at,updated_at) VALUES (?,'Product',?,448,'','')",args:[seq,seq]});
    await db.execute({sql:`INSERT INTO plus_error_records(id,file_id,item_code,batch_no,process_type,d1,created_at)
      VALUES ('error',?,'ITEM','00022-02','AEA',1,'')`,args:[sourceId]});
    const raw={'Mã item':'ITEM','Tên sản phẩm':'Product','Số lot':'00022-01','Công đoạn số':'0380','Số tấm input':'80',
      'Tên thiết bị':'Verify','Thời gian bắt đầu':'2026-10-31 02:23:25','Thời gian kết thúc':'2026-10-31 04:00:00'};
    const cvr=new CvrMatchingEngine(()=>db);
    await cvr.processAndMatchCvrRecords([parseCvrWcsRow(raw),
      parseCvrWcsRow({...raw,'Số lot':'00022-02','Số tấm input':'20'}),
      parseCvrWcsRow({...raw,'Số lot':'00022','Công đoạn số':'0370'}),
      parseCvrWcsRow({...raw,'Số lot':'00022'})],sourceId);
    let cvrs=(await db.execute('SELECT * FROM cvr4m_records')).rows;
    const child1=cvrs.find(r=>r.lot_no==='00022-01'),child2=cvrs.find(r=>r.lot_no==='00022-02');
    assert.equal(child1.total_sheet_indi,140);assert.equal(child1.total_pcs,62720);assert.equal(child1.total_pcs_cvr,35840);
    assert.equal(child2.total_sheet_indi,null);assert.equal(child2.total_pcs,null);assert.equal(child2.total_pcs_cvr,8960);
    assert.equal(child2.match_status,'MATCHED_ERROR_ONLY');
    assert.equal(cvrs.find(r=>r.lot_no==='00022'&&r.seq_no==='0370').total_sheet_indi,323);
    assert.equal(cvrs.find(r=>r.lot_no==='00022'&&r.seq_no==='0380').plus_match_method,'WCS_CHILD_PRESENT');
    await addPlus('child2-0380','00022-02','0380',183);await cvr.rematchCvrRecords();
    cvrs=(await db.execute('SELECT * FROM cvr4m_records')).rows;
    assert.equal(cvrs.find(r=>r.lot_no==='00022-02').total_sheet_indi,183);
    assert.equal(cvrs.find(r=>r.lot_no==='00022'&&r.seq_no==='0380').total_sheet_indi,null);
    await db.execute("UPDATE plus_records SET prod_qty=130 WHERE id='p0'");await rematchScanRecords(db);
    assert.ok((await db.execute('SELECT * FROM scan4m_records')).rows.every(r=>r.total_sheet_indi===313));
    await db.execute("DELETE FROM plus_records WHERE id='p1'");await rematchScanRecords(db);await cvr.rematchCvrRecords();
    scans=(await db.execute('SELECT * FROM scan4m_records')).rows;
    assert.ok(scans.every(r=>r.total_sheet_indi===null&&r.match_status==='UNMATCHED_PLUS'&&r.plus_match_method==='INCOMPLETE_SPLIT'));
    await addPlus('parent','00022','0370',500);await rematchScanRecords(db);
    assert.ok((await db.execute('SELECT * FROM scan4m_records')).rows.every(r=>r.total_sheet_indi===500&&r.plus_record_id==='parent'&&r.plus_match_method==='EXACT'));

    server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const token=signToken({id:'acc-admin',username:'admin',fullName:'Admin',roleId:'role-admin',roleName:'ADMIN',permissions:['cvr4m:view','cvr4m:export','scan4m:view']});
    const headers={Authorization:'Bearer '+token},base=`http://127.0.0.1:${server.address().port}/api/v1`;
    const scanPayload=await(await fetch(base+'/scan4m/records',{headers})).json();
    assert.ok(scanPayload.data.records.every(r=>JSON.parse(r.plus_match_details).seqNo==='0370'));
    const exported=await fetch(base+'/cvr4m/export?lotNo=00022-01',{headers});assert.equal(exported.status,200);
    const book=xlsx.read(Buffer.from(await exported.arrayBuffer()));const output=xlsx.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
    assert.equal(output[0]['Total sheet (Indi)'],140);assert.equal(output[0]['Total pcs (lot)'],62720);
    console.log('Plus production matching passed: strict item/lot/seq, split sums, exact priority/zero, partial/overlapping/duplicate/missing children, literal prefixes, Scan import/rematch, CVR quantities/status/PCS, stale-value clearing, traceability and Excel.');
  }finally{scannerConfig.stabilityCheckMs=oldStability;if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await dbConnection.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
