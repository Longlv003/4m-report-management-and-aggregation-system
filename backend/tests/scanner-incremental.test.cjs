// Isolated integration tests: real files/SQLite/parser, instrumented hash/stability calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const xlsx=require('xlsx');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'4m-incremental-'));
process.env.APP_DATABASE_URL='file:'+path.join(temp,'test.sqlite').replace(/\\/g,'/');
process.env.JWT_SECRET='incremental-test-secret-at-least-32-characters';
process.env.INITIAL_ADMIN_PASSWORD='IncrementalAdmin123!';
process.env.INITIAL_USER_PASSWORD='IncrementalUser123!';
const {getDb,dbConnection}=require('../dist/database/connection');
const {runMigrations}=require('../dist/database/migrations');
const {ScannerEngine}=require('../dist/modules/scanner/scanner-engine');
const {configurationProvider}=require('../dist/config/configuration-provider');
const {pathProvider}=require('../dist/config/path-provider');
const io=require('../dist/modules/scanner/file-stability');
const parser=require('../dist/modules/parser/excel-parser');

async function main(){
  let db=getDb();const config=configurationProvider.getScannerConfig().scanner;
  const originalConfig={...config};config.stabilityCheckMs=0;
  const originalHash=io.computeFileSha256,originalStability=io.isFileStable,originalParse=parser.parsePlusExcel;
  let hashes=0,stability=0,parses=0;
  io.computeFileSha256=async file=>{hashes++;return originalHash(file);};
  io.isFileStable=async(...args)=>{stability++;return originalStability(...args);};
  parser.parsePlusExcel=(...args)=>{parses++;return originalParse(...args);};
  const workbook=(qty,lot='LOT')=>{
    const book=xlsx.utils.book_new();xlsx.utils.book_append_sheet(book,xlsx.utils.json_to_sheet([{
      'Item Code Of Product':'ITEM','Batch No':lot,'Seq No.':'0070','Production Qty':qty,
      'Work Start':'2026-11-01 07:00:00','Work Result':'2026-11-01 08:00:00'
    }]),'Sheet0');return xlsx.write(book,{type:'buffer',bookType:'xlsx'});
  };
  let stamp=Date.now();
  function write(file,bytes){fs.writeFileSync(file,bytes);stamp+=1000;fs.utimesSync(file,new Date(stamp),new Date(stamp));}
  const file=path.join(temp,'incremental.xlsx'),bytesA=workbook(10),bytesB=workbook(25);
  const processFile=(scanner,file)=>scanner.processFile(db,'plusExcel','EXCEL',file,path.basename(file));
  const qty=async lot=>(await db.execute({sql:'SELECT prod_qty FROM plus_records WHERE batch_no=?',args:[lot]})).rows[0]?.prod_qty;
  try{
    await runMigrations();let scanner=new ScannerEngine(()=>db);
    write(file,bytesA);assert.equal(await processFile(scanner,file),true);
    assert.equal(await qty('LOT'),10);assert.deepEqual([hashes,stability,parses],[1,1,1]);
    assert.equal(await processFile(scanner,file),false);
    assert.deepEqual([hashes,stability,parses],[1,1,1]);
    // Persistent state survives both a new scanner instance and a reopened database.
    await dbConnection.close();db=getDb();scanner=new ScannerEngine(()=>db);
    assert.equal(await processFile(scanner,file),false);
    assert.deepEqual([hashes,stability,parses],[1,1,1]);
    // Changed timestamp, unchanged bytes: hash once, do not parse/import again.
    write(file,bytesA);assert.equal(await processFile(scanner,file),false);
    assert.deepEqual([hashes,stability,parses],[2,2,1]);
    assert.equal(await processFile(scanner,file),false);assert.equal(hashes,2);
    // Changed content with the same byte length must import; reverting to old bytes must also import.
    assert.equal(bytesA.length,bytesB.length);
    write(file,bytesB);assert.equal(await processFile(scanner,file),true);assert.equal(await qty('LOT'),25);
    write(file,bytesA);assert.equal(await processFile(scanner,file),true);assert.equal(await qty('LOT'),10);
    const copy=path.join(temp,'copy.xlsx');write(copy,bytesA);
    const beforeCopy=parses;assert.equal(await processFile(scanner,copy),false);assert.equal(parses,beforeCopy);
    const beforeFastCopy=hashes;assert.equal(await processFile(scanner,copy),false);assert.equal(hashes,beforeFastCopy);

    const failed=path.join(temp,'failed.xlsx');write(failed,workbook(7,'FAIL'));
    await db.execute("CREATE TRIGGER fail_incremental BEFORE INSERT ON plus_records WHEN NEW.batch_no='FAIL' BEGIN SELECT RAISE(ABORT,'injected failure'); END");
    await assert.rejects(processFile(scanner,failed),/injected failure/);
    const beforeRetry=hashes;await assert.rejects(processFile(scanner,failed),/injected failure/);
    assert.equal(hashes,beforeRetry+1); // FAILED never takes the metadata fast path.
    await db.execute('DROP TRIGGER fail_incremental');
    assert.equal(await processFile(scanner,failed),true);assert.equal(await qty('FAIL'),7);
    write(failed,Buffer.from([80,75,3,4,0,0,0,0])); // Truncated XLSX ZIP, not plaintext CSV fallback.
    await assert.rejects(processFile(scanner,failed));
    write(failed,workbook(8,'FAIL'));assert.equal(await processFile(scanner,failed),true);
    assert.equal(await qty('FAIL'),8);
    assert.equal((await db.execute("SELECT COUNT(*) AS n FROM source_files WHERE status='FAILED'")).rows[0].n,0);
    assert.equal((await db.execute("SELECT COUNT(*) AS n FROM source_files WHERE status='SUPERSEDED'")).rows[0].n,1);

    // A file being written is deferred without hashing, importing or a false failure record.
    const unstable=path.join(temp,'unstable.xlsx');write(unstable,workbook(9,'UNSTABLE'));
    const countedStability=io.isFileStable;io.isFileStable=async()=>false;
    const beforeUnstable=hashes;assert.equal(await processFile(scanner,unstable),false);assert.equal(hashes,beforeUnstable);
    assert.equal(await qty('UNSTABLE'),undefined);io.isFileStable=countedStability;
    assert.equal(await processFile(scanner,unstable),true);

    // Replacing a file between hashing and parsing must leave no partially imported revision.
    write(file,bytesB);const countedHash=io.computeFileSha256;
    io.computeFileSha256=async name=>{const hash=await countedHash(name);write(name,bytesA);return hash;};
    assert.equal(await processFile(scanner,file),false);assert.equal(await qty('LOT'),10);
    io.computeFileSha256=countedHash;
    // A change during parsing rolls the complete data transaction back.
    write(file,bytesB);const countedParse=parser.parsePlusExcel;
    parser.parsePlusExcel=(...args)=>{const rows=countedParse(...args);write(file,bytesA);return rows;};
    assert.equal(await processFile(scanner,file),false);assert.equal(await qty('LOT'),10);
    parser.parsePlusExcel=countedParse;
    assert.equal(await processFile(scanner,file),false); // Same final A bytes; refresh metadata only.

    // A parser upgrade/invalid source status overrides an otherwise unchanged fingerprint.
    const csv=path.join(temp,'wcs.csv');const row={'Mã item':'WCS','Số lot':'LOT','Công đoạn số':'0070',
      'Thời gian thao tác':'2026-11-01 07:00:00','Time01':'2026-11-01 08:00:00'};
    const columns=[...new Set([...configurationProvider.getDataMapping().wcsRequiredColumns,...Object.keys(row)])];
    write(csv,Buffer.from(columns.join(',')+'\n'+columns.map(c=>row[c]||'').join(',')));
    assert.equal(await scanner.processFile(db,'wcsScan','CSV',csv,'wcs.csv'),true);
    await db.execute("UPDATE source_files SET parser_version=0 WHERE source_system='wcsScan'");
    assert.equal(await scanner.processFile(db,'wcsScan','CSV',csv,'wcs.csv'),true);

    const sources=configurationProvider.getSourceFiles().sources,resolve=pathProvider.resolveInputDirectory;
    try{
      configurationProvider.getSourceFiles().sources={plusExcel:{enabled:true,type:'EXCEL',pattern:'.*\\.xlsx$',subDirectory:''}};
      pathProvider.resolveInputDirectory=async()=>temp;
      // Simulate an existing installation with successful file history but no metadata cache yet.
      await db.execute("DELETE FROM scanner_file_state WHERE source_system='plusExcel'");
      const beforeWarm=[hashes,stability,parses];
      const warmed=await new ScannerEngine(()=>db).scanOnce();
      assert.equal(warmed.filesProcessed,0);assert.equal(warmed.filesSkipped,4);
      // The copied alias has no canonical path in source_files, so it still needs one stability check.
      assert.deepEqual([hashes,stability,parses],[beforeWarm[0]+4,beforeWarm[1]+1,beforeWarm[2]]);
      const before=[hashes,stability,parses];const result=await new ScannerEngine(()=>db).scanOnce();
      assert.equal(result.filesProcessed,0);assert.equal(result.filesSkipped,4);assert.equal(result.errors,0);
      assert.deepEqual([hashes,stability,parses],before);
    }finally{configurationProvider.getSourceFiles().sources=sources;pathProvider.resolveInputDirectory=resolve;}
    console.log('Incremental scanner passed: persistent fast skip with zero hash/stability/parser calls, changed/touched/reverted/renamed files, unchanged failures retry, stale-error cleanup, parser upgrades, unstable-file deferral and atomic rollback.');
  }finally{
    io.computeFileSha256=originalHash;io.isFileStable=originalStability;parser.parsePlusExcel=originalParse;
    Object.assign(config,originalConfig);await dbConnection.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
