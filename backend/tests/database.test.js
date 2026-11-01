"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_provider_js_1 = require("../src/config/path-provider.js");
const connection_js_1 = require("../src/database/connection.js");
const migrations_js_1 = require("../src/database/migrations.js");
const logger_js_1 = require("../src/logging/logger.js");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
logger_js_1.logger.init(path_provider_js_1.pathProvider.getLogDir());
async function testDatabase() {
    console.log('\n=============================================');
    console.log('       TESTING STEP 2: DATABASE & SCHEMA    ');
    console.log('=============================================');
    // Run migrations
    await (0, migrations_js_1.runMigrations)();
    const db = (0, connection_js_1.getDb)();
    // Test 1: Verify tables exist
    console.log('\n[TEST 1] Verifying created tables...');
    const tables = await db.execute(`
    SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
  `);
    const tableNames = tables.rows.map(r => r.name);
    console.log('Created tables:', tableNames);
    const requiredTables = [
        'accounts',
        'audit_logs',
        'import_errors',
        'plus_records',
        'roles',
        'scan4m_records',
        'source_files',
        'wcs_records'
    ];
    for (const t of requiredTables) {
        if (!tableNames.includes(t)) {
            throw new Error(`Missing table: ${t}`);
        }
    }
    console.log('-> All 8 required tables exist!');
    // Test 2: Verify Roles and Admin Account
    console.log('\n[TEST 2] Verifying seed accounts & roles...');
    const adminAcc = await db.execute(`SELECT * FROM accounts WHERE username = 'admin' LIMIT 1;`);
    if (adminAcc.rows.length === 0)
        throw new Error('Admin account not found');
    const adminRow = adminAcc.rows[0];
    console.log(' - Admin account found:', adminRow.username, '| Role:', adminRow.role_id);
    const isPasswordCorrect = bcryptjs_1.default.compareSync('admin123', adminRow.password_hash);
    if (!isPasswordCorrect)
        throw new Error('Admin password hash mismatch');
    console.log(' - Admin password verification: OK');
    const userAcc = await db.execute(`SELECT * FROM accounts WHERE username = 'user' LIMIT 1;`);
    if (userAcc.rows.length === 0)
        throw new Error('User account not found');
    console.log(' - User account found:', userAcc.rows[0].username);
    // Test 3: Test Transaction & Rollback
    console.log('\n[TEST 3] Testing Transaction & Rollback integrity...');
    const tx = await db.transaction('write');
    try {
        await tx.execute({
            sql: 'INSERT INTO roles (id, role_name, permissions) VALUES (?, ?, ?);',
            args: ['role-temp', 'TEMP', '[]']
        });
        // Intentional rollback
        await tx.rollback();
    }
    catch {
        await tx.rollback();
    }
    const checkTemp = await db.execute(`SELECT * FROM roles WHERE id = 'role-temp';`);
    if (checkTemp.rows.length !== 0)
        throw new Error('Transaction rollback failed');
    console.log('-> Transaction rollback test PASSED!');
    await connection_js_1.dbConnection.close();
    console.log('\n=============================================');
    console.log('      ALL STEP 2 TESTS PASSED 100%!         ');
    console.log('=============================================\n');
}
testDatabase().catch(err => {
    console.error('Database test failed:', err);
    process.exit(1);
});
