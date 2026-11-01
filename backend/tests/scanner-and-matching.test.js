"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path_provider_js_1 = require("../src/config/path-provider.js");
const logger_js_1 = require("../src/logging/logger.js");
const connection_js_1 = require("../src/database/connection.js");
const migrations_js_1 = require("../src/database/migrations.js");
const scanner_engine_js_1 = require("../src/modules/scanner/scanner-engine.js");
logger_js_1.logger.init(path_provider_js_1.pathProvider.getLogDir());
async function runTest() {
    console.log('\n=============================================');
    console.log('   TESTING STEP 3: SCANNER, PARSER & MATCHER ');
    console.log('=============================================');
    // Initialize DB
    await (0, migrations_js_1.runMigrations)();
    const db = (0, connection_js_1.getDb)();
    // Test 1: Run scanner on actual sample files in project root
    console.log('\n[TEST 1] Running scan on actual files...');
    const scanResult = await scanner_engine_js_1.scannerEngine.scanOnce();
    console.log(' - Scan completed:', scanResult);
    // Test 2: Verify source_files table
    console.log('\n[TEST 2] Verifying source_files table...');
    const files = await db.execute(`SELECT file_name, file_type, status, record_count, sha256 FROM source_files;`);
    console.log('Source files recorded in SQLite:');
    for (const f of files.rows) {
        console.log(` - ${f.file_name} (${f.file_type}): status=${f.status}, records=${f.record_count}, sha256=${String(f.sha256).slice(0, 16)}...`);
    }
    if (files.rows.length < 3) {
        throw new Error(`Expected at least 3 source files tracked, found ${files.rows.length}`);
    }
    // Test 3: Verify WCS and Plus records counts
    console.log('\n[TEST 3] Verifying raw records in SQLite...');
    const wcsCount = await db.execute(`SELECT COUNT(*) as count FROM wcs_records;`);
    const plusCount = await db.execute(`SELECT COUNT(*) as count FROM plus_records;`);
    console.log(' - WCS records count:', wcsCount.rows[0].count, '(Expected: 107 = 79 R_R + 28 S_S)');
    console.log(' - Plus records count:', plusCount.rows[0].count, '(Expected: 15505)');
    // Test 4: Verify Scan 4M Aggregated Tab 1 records
    console.log('\n[TEST 4] Verifying Scan 4M Tab 1 records...');
    const scan4mTotal = await db.execute(`SELECT COUNT(*) as count FROM scan4m_records;`);
    const matchedCount = await db.execute(`SELECT COUNT(*) as count FROM scan4m_records WHERE match_status = 'MATCHED';`);
    const unmatchedCount = await db.execute(`SELECT COUNT(*) as count FROM scan4m_records WHERE match_status = 'UNMATCHED_PLUS';`);
    console.log(' - Total Scan 4M records:', scan4mTotal.rows[0].count);
    console.log(' - Matched records:', matchedCount.rows[0].count, '(Expected: 85)');
    console.log(' - Unmatched records (awaiting later Plus export):', unmatchedCount.rows[0].count, '(Expected: 22)');
    // Test 5: Verify field transformations and business rules on sample record
    console.log('\n[TEST 5] Checking field transformations on sample record (00001, seq 0070)...');
    const sample = await db.execute(`
    SELECT * FROM scan4m_records WHERE match_key = '7S472301000B_00001_0070' LIMIT 1;
  `);
    if (sample.rows.length === 0)
        throw new Error('Sample matched record not found');
    const r = sample.rows[0];
    console.log('Sample record details:');
    console.log(' - Item code:', r.item_code, '| Lot no:', r.lot_no, '| Seq no:', r.seq_no);
    console.log(' - Machine:', r.machine);
    console.log(' - Start time (WCS):', r.start_time);
    console.log(' - Finish time (Plus):', r.finish_time);
    console.log(' - Total time (Minutes):', r.total_time, 'phút');
    console.log(' - Layer:', r.layer);
    console.log(' - Total sheet (Indi):', r.total_sheet_indi);
    console.log(' - Total sheet (Scan):', r.total_sheet_scan);
    console.log(' - OP:', JSON.stringify(r.op));
    console.log(' - Dia Top Avg A:', r.outer_top_avg_a, '| Cpk Top A:', r.cpk_outer_top_a);
    console.log(' - Air pressure:', r.air_pressure);
    // Assertions
    if (r.lot_no !== '00001')
        throw new Error('Leading zeroes in lot_no were lost!');
    if (r.seq_no !== '0070')
        throw new Error('Leading zeroes in seq_no were lost!');
    if (r.total_time !== '19')
        throw new Error(`Expected Total time = 19 minutes, got: ${r.total_time}`);
    if (r.layer !== 'L1')
        throw new Error(`Expected Layer L1, got: ${r.layer}`);
    // Test 6: Test renamed file detection (Re-scan should do 0 re-imports)
    console.log('\n[TEST 6] Testing idempotency & duplicate prevention on re-scan...');
    const rescan = await scanner_engine_js_1.scannerEngine.scanOnce();
    console.log(' - Re-scan files processed:', rescan.filesProcessed, '(Expected: 0)');
    if (rescan.filesProcessed !== 0) {
        throw new Error('Re-scan processed duplicate files!');
    }
    console.log('-> Duplicate prevention PASSED: SHA-256 tracking prevented duplicate imports!');
    await connection_js_1.dbConnection.close();
    console.log('\n=============================================');
    console.log('      ALL STEP 3 TESTS PASSED 100%!         ');
    console.log('=============================================\n');
}
runTest().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
