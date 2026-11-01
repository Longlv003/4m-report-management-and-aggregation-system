"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_js_1 = require("../src/app.js");
const migrations_js_1 = require("../src/database/migrations.js");
const connection_js_1 = require("../src/database/connection.js");
const path_provider_js_1 = require("../src/config/path-provider.js");
const logger_js_1 = require("../src/logging/logger.js");
const http_1 = __importDefault(require("http"));
logger_js_1.logger.init(path_provider_js_1.pathProvider.getLogDir());
async function runApiTests() {
    console.log('\n=============================================');
    console.log('       TESTING STEP 4: API, AUTH & EXPORT    ');
    console.log('=============================================');
    await (0, migrations_js_1.runMigrations)();
    const app = (0, app_js_1.createApp)();
    const server = http_1.default.createServer(app);
    await new Promise(resolve => server.listen(4001, () => resolve()));
    const baseUrl = 'http://localhost:4001/api/v1';
    try {
        // 1. Test Login Admin
        console.log('\n[TEST 1] Testing Admin Login...');
        const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin123' })
        });
        const adminLoginData = await adminLoginRes.json();
        if (!adminLoginData.success)
            throw new Error('Admin login failed');
        const adminToken = adminLoginData.data.token;
        console.log('-> Admin login PASSED! Token generated.');
        // 2. Test Login User
        console.log('\n[TEST 2] Testing User Login...');
        const userLoginRes = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'user', password: 'user123' })
        });
        const userLoginData = await userLoginRes.json();
        if (!userLoginData.success)
            throw new Error('User login failed');
        const userToken = userLoginData.data.token;
        console.log('-> User login PASSED! Token generated.');
        // 3. Test Get Scan 4M Records (User permitted)
        console.log('\n[TEST 3] Testing GET /scan4m/records with User Token...');
        const recordsRes = await fetch(`${baseUrl}/scan4m/records?page=1&pageSize=10`, {
            headers: { Authorization: `Bearer ${userToken}` }
        });
        const recordsData = await recordsRes.json();
        if (!recordsData.success)
            throw new Error('Failed to get records');
        console.log(` - Retrieved ${recordsData.data.records.length} records, Total: ${recordsData.data.pagination.total}`);
        console.log('-> User view records PASSED!');
        // 4. Test Get Stats
        console.log('\n[TEST 4] Testing GET /scan4m/stats...');
        const statsRes = await fetch(`${baseUrl}/scan4m/stats`, {
            headers: { Authorization: `Bearer ${userToken}` }
        });
        const statsData = await statsRes.json();
        console.log(' - Stats:', statsData.data);
        if (!statsData.success)
            throw new Error('Failed to get stats');
        console.log('-> Stats API PASSED!');
        // 5. Test Export Permission: USER MUST BE BLOCKED (HTTP 403)
        console.log('\n[TEST 5] Testing RBAC: User calling /scan4m/export (Must be 403 Forbidden)...');
        const userExportRes = await fetch(`${baseUrl}/scan4m/export`, {
            headers: { Authorization: `Bearer ${userToken}` }
        });
        console.log(` - User export status code: ${userExportRes.status} (Expected: 403)`);
        if (userExportRes.status !== 403) {
            throw new Error(`Security violation! User was able to access export with status: ${userExportRes.status}`);
        }
        console.log('-> RBAC Security PASSED: User was strictly blocked from export!');
        // 6. Test Export Permission: ADMIN MUST SUCCEED (HTTP 200)
        console.log('\n[TEST 6] Testing RBAC: Admin calling /scan4m/export (Must be 200 OK with Excel file)...');
        const adminExportRes = await fetch(`${baseUrl}/scan4m/export`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        console.log(` - Admin export status code: ${adminExportRes.status}`);
        const contentType = adminExportRes.headers.get('content-type');
        console.log(` - Content-Type: ${contentType}`);
        if (adminExportRes.status !== 200 || !contentType?.includes('spreadsheetml')) {
            throw new Error('Admin export failed or returned wrong content-type');
        }
        const arrayBuf = await adminExportRes.arrayBuffer();
        console.log(` - Downloaded Excel byte size: ${arrayBuf.byteLength} bytes`);
        console.log('-> Admin Excel export stream PASSED!');
        // 7. Test Account Management (Admin only)
        console.log('\n[TEST 7] Testing Account Management...');
        const accountsRes = await fetch(`${baseUrl}/accounts`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const accountsData = await accountsRes.json();
        console.log(` - Total accounts: ${accountsData.data.length}`);
        if (!accountsData.success)
            throw new Error('Failed to list accounts');
        console.log('-> Account management PASSED!');
        console.log('\n=============================================');
        console.log('      ALL STEP 4 TESTS PASSED 100%!         ');
        console.log('=============================================\n');
    }
    finally {
        server.close();
        await connection_js_1.dbConnection.close();
    }
}
runApiTests().catch(err => {
    console.error('API Test failed:', err);
    process.exit(1);
});
