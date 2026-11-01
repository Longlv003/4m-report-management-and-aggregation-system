import { getDb } from './connection.js';
import { logger } from '../logging/logger.js';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { pathProvider } from '../config/path-provider.js';
import { getInitialPassword } from '../config/secrets.js';
import { ensureUniquePlusKeys } from './plus-integrity.js';
import { rematchScanRecords } from '../modules/matcher/scan-matching-engine.js';
import { CvrMatchingEngine } from '../modules/matcher/cvr-matching-engine.js';

export async function ensureCvrRateColumns(db: Pick<ReturnType<typeof getDb>, 'execute'>): Promise<void> {
  const columns = await db.execute('PRAGMA table_info(cvr4m_records)');
  for (const column of ['ng_rate_a', 'ng_rate_b']) {
    if (!columns.rows.some(row => row.name === column)) {
      await db.execute(`ALTER TABLE cvr4m_records ADD COLUMN ${column} REAL`);
    }
  }
}

export async function runMigrations(): Promise<void> {
  const db = getDb();
  logger.info('Running database migrations...', { module: 'Migrations' });

  // 1. Source files table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS source_files (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      source_system TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      sha256 TEXT NOT NULL UNIQUE,
      detected_at TEXT NOT NULL,
      processed_at TEXT,
      status TEXT NOT NULL,
      record_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      error_message TEXT
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_source_files_sha256 ON source_files(sha256);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_source_files_status ON source_files(status);`);

  // 2. WCS Records table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS wcs_records (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      match_key TEXT NOT NULL,
      item_code TEXT NOT NULL,
      batch_no TEXT NOT NULL,
      seq_no TEXT NOT NULL,
      op_date TEXT,
      shift TEXT,
      start_time TEXT NOT NULL,
      machine_name TEXT,
      product_name TEXT,
      process_name TEXT,
      program_name TEXT,
      input_sheet INTEGER,
      op_c1 TEXT,
      op_name1 TEXT,
      op_c2 TEXT,
      op_name2 TEXT,
      outer_top_avg_a REAL,
      cpk_outer_top_a REAL,
      inner_bottom_avg_a REAL,
      cpk_inner_bottom_a REAL,
      outer_top_avg_b REAL,
      cpk_outer_top_b REAL,
      inner_bottom_avg_b REAL,
      cpk_inner_bottom_b REAL,
      check_light TEXT,
      check_master_machine TEXT,
      check_master_sample TEXT,
      exp_master_sample TEXT,
      roll_cleaning TEXT,
      air_pressure REAL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES source_files(id) ON DELETE CASCADE
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_wcs_match_key ON wcs_records(match_key);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_wcs_file_id ON wcs_records(file_id);`);

  // 3. Plus Records table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS plus_records (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      match_key TEXT NOT NULL,
      item_code TEXT NOT NULL,
      batch_no TEXT NOT NULL,
      seq_no TEXT NOT NULL,
      work_start TEXT,
      work_result TEXT NOT NULL,
      prod_qty INTEGER,
      accepted_qty INTEGER,
      bad_qty INTEGER,
      pic_code TEXT,
      pic_name TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES source_files(id) ON DELETE CASCADE
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_plus_match_key ON plus_records(match_key);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_plus_file_id ON plus_records(file_id);`);

  // 4. Scan 4M Aggregated Records (Tab 1 Form Scan)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS scan4m_records (
      id TEXT PRIMARY KEY,
      match_key TEXT NOT NULL UNIQUE,
      wcs_record_id TEXT NOT NULL,
      plus_record_id TEXT,
      match_status TEXT NOT NULL,
      date TEXT,
      machine TEXT,
      shift TEXT,
      start_time TEXT NOT NULL,
      finish_time TEXT,
      total_time TEXT,
      item_name TEXT,
      item_code TEXT NOT NULL,
      lot_no TEXT NOT NULL,
      seq_no TEXT NOT NULL,
      process TEXT,
      layer TEXT,
      program_name TEXT,
      total_sheet_indi INTEGER,
      total_sheet_scan INTEGER,
      op TEXT,
      outer_top_avg_a REAL,
      cpk_outer_top_a REAL,
      inner_bottom_avg_a REAL,
      cpk_inner_bottom_a REAL,
      outer_top_avg_b REAL,
      cpk_outer_top_b REAL,
      inner_bottom_avg_b REAL,
      cpk_inner_bottom_b REAL,
      check_light TEXT,
      check_master_machine TEXT,
      check_master_sample TEXT,
      exp_master_sample TEXT,
      roll_cleaning TEXT,
      air_pressure REAL,
      anomaly_flag TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (wcs_record_id) REFERENCES wcs_records(id) ON DELETE CASCADE,
      FOREIGN KEY (plus_record_id) REFERENCES plus_records(id) ON DELETE SET NULL
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_scan4m_match_key ON scan4m_records(match_key);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_scan4m_date_shift ON scan4m_records(date, shift);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_scan4m_match_status ON scan4m_records(match_status);`);

  // 6. Roles & Accounts
  await db.execute(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      role_name TEXT NOT NULL UNIQUE,
      permissions TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role_id TEXT NOT NULL,
      custom_permissions TEXT DEFAULT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );
  `);
  const accountColumns = await db.execute('PRAGMA table_info(accounts)');
  if (!accountColumns.rows.some(column => column.name === 'custom_permissions')) {
    await db.execute('ALTER TABLE accounts ADD COLUMN custom_permissions TEXT DEFAULT NULL');
  }


  // 7. Audit Logs
  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);`);

  const auditColumns = await db.execute('PRAGMA table_info(audit_logs)');
  for (const [name, definition] of [['actor_username','TEXT'],['outcome',"TEXT NOT NULL DEFAULT 'SUCCESS'"]]) {
    if (!auditColumns.rows.some(column => column.name === name)) await db.execute('ALTER TABLE audit_logs ADD COLUMN ' + name + ' ' + definition);
  }
  await db.execute(`CREATE TABLE IF NOT EXISTS record_exclusions (
    report_type TEXT NOT NULL CHECK(report_type IN ('scan4m','cvr4m')),
    record_key TEXT NOT NULL, is_excluded INTEGER NOT NULL DEFAULT 1,
    reason TEXT NOT NULL, snapshot_json TEXT NOT NULL, changed_by TEXT NOT NULL, changed_at TEXT NOT NULL,
    PRIMARY KEY(report_type,record_key))`);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_exclusion_active ON record_exclusions(report_type,is_excluded)');

  // 8. Item Mapping table (Item name <-> Số pcs/sheet <-> Process)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS item_mapping (
      id TEXT PRIMARY KEY,
      item_name TEXT NOT NULL UNIQUE,
      pcs_per_sheet INTEGER NOT NULL DEFAULT 0,
      process TEXT NOT NULL DEFAULT '',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_item_mapping_item_name ON item_mapping(item_name);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_item_mapping_deleted ON item_mapping(is_deleted);`);

  // 9. CVR 4M Records table (42 output columns)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS cvr4m_records (
      id TEXT PRIMARY KEY,
      wcs_file_id TEXT,
      wcs_row_id TEXT,
      date TEXT,
      machine TEXT,
      shift TEXT,
      start_time TEXT,
      finish_time TEXT,
      total_time TEXT,
      item_name TEXT,
      item_code TEXT,
      lot_no TEXT,
      seq_no TEXT,
      process TEXT,
      program_name TEXT,
      total_sheet_indi INTEGER,
      total_sheet_vrf INTEGER,
      op TEXT,
      total_pcs INTEGER,
      total_pattern_ng INTEGER,
      ng_rate REAL,
      accumulative_defect_a INTEGER,
      discoloration_a INTEGER,
      fm_a INTEGER,
      copper_residue_a INTEGER,
      broken_hole_a INTEGER,
      bvh_shift_a INTEGER,
      missing_hole_a INTEGER,
      extra_hole_a INTEGER,
      dfr_seepage_a INTEGER,
      other_a INTEGER,
      dfr_remain_a INTEGER,
      verify_zoom_a TEXT,
      accumulative_defect_b INTEGER,
      discoloration_b INTEGER,
      fm_b INTEGER,
      copper_residue_b INTEGER,
      broken_hole_b INTEGER,
      bvh_shift_b INTEGER,
      missing_hole_b INTEGER,
      extra_hole_b INTEGER,
      dfr_seepage_b INTEGER,
      other_b INTEGER,
      dfr_remain_b INTEGER,
      verify_zoom_b TEXT,
      match_status TEXT NOT NULL DEFAULT 'UNMATCHED_PLUS',
      raw_wcs_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (wcs_file_id) REFERENCES source_files(id) ON DELETE SET NULL
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_cvr4m_date ON cvr4m_records(date);`);
  await ensureCvrRateColumns(db);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_cvr4m_item_code ON cvr4m_records(item_code);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_cvr4m_lot_no ON cvr4m_records(lot_no);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_cvr4m_machine ON cvr4m_records(machine);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_cvr4m_match_status ON cvr4m_records(match_status);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_cvr4m_start_time ON cvr4m_records(start_time);`);

  // 10. Plus Error Records table (from Error-log-plus / ayqa4080 files)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS plus_error_records (
      id TEXT PRIMARY KEY,
      file_id TEXT,
      item_code TEXT NOT NULL,
      batch_no TEXT NOT NULL,
      product_name TEXT,
      process_type TEXT,
      inspection_date TEXT,
      total_ng_qty INTEGER,
      inspection_qty INTEGER,
      ng_rate REAL,
      d1 INTEGER DEFAULT 0,
      d2 INTEGER DEFAULT 0,
      d3 INTEGER DEFAULT 0,
      d4 INTEGER DEFAULT 0,
      d5 INTEGER DEFAULT 0,
      d6 INTEGER DEFAULT 0,
      d7 INTEGER DEFAULT 0,
      d8 INTEGER DEFAULT 0,
      d9 INTEGER DEFAULT 0,
      d10 INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES source_files(id) ON DELETE CASCADE
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_per_item_batch ON plus_error_records(item_code, batch_no);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_per_process ON plus_error_records(process_type);`);
  await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_per_unique ON plus_error_records(item_code, batch_no, process_type);`);

  // Seed default Roles (INSERT OR IGNORE = only creates if not exists)
  await db.execute({
    sql: `INSERT OR IGNORE INTO roles (id, role_name, permissions) VALUES (?, ?, ?);`,
    args: ['role-admin', 'ADMIN', JSON.stringify([
      'scan4m:view',
      'scan4m:export',
      'scan4m:manage',
      'cvr4m:manage',
      'cvr4m:view',
      'cvr4m:export',
      'accounts:manage',
      'config:manage',
      'audit:view',
      'mapping:view',
      'mapping:manage'
    ])]
  });
  // Always update existing admin role with latest permissions
  await db.execute({
    sql: `UPDATE roles SET permissions = ? WHERE id = 'role-admin';`,
    args: [JSON.stringify([
      'scan4m:view',
      'scan4m:export',
      'scan4m:manage',
      'cvr4m:manage',
      'cvr4m:view',
      'cvr4m:export',
      'accounts:manage',
      'config:manage',
      'audit:view',
      'mapping:view',
      'mapping:manage'
    ])]
  });

  await db.execute({
    sql: `INSERT OR IGNORE INTO roles (id, role_name, permissions) VALUES (?, ?, ?);`,
    args: ['role-user', 'USER', JSON.stringify([
      'scan4m:view',
      'cvr4m:view',
      'mapping:view'
    ])]
  });
  // Always update USER role
  await db.execute({
    sql: `UPDATE roles SET permissions = ? WHERE id = 'role-user';`,
    args: [JSON.stringify([
      'scan4m:view',
      'cvr4m:view',
      'mapping:view'
    ])]
  });

  // Seed default Admin Account if not exists
  const checkAdmin = await db.execute(`SELECT id FROM accounts WHERE username = 'admin' LIMIT 1;`);
  if (checkAdmin.rows.length === 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(getInitialPassword('admin'), salt);
    const now = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO accounts (id, username, password_hash, full_name, role_id, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      args: ['acc-admin', 'admin', hash, 'Administrator', 'role-admin', 1, now, now]
    });
    logger.info('Created initial administrator account (username: admin)', { module: 'Migrations' });
  }

  // Seed default User Account if not exists
  const checkUser = await db.execute(`SELECT id FROM accounts WHERE username = 'user' LIMIT 1;`);
  if (checkUser.rows.length === 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(getInitialPassword('user'), salt);
    const now = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO accounts (id, username, password_hash, full_name, role_id, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      args: ['acc-user', 'user', hash, 'Production Operator', 'role-user', 1, now, now]
    });
    logger.info('Created initial user account (username: user)', { module: 'Migrations' });
  }

  const duplicates = await db.execute('SELECT match_key FROM plus_records GROUP BY match_key HAVING COUNT(*) > 1 LIMIT 1');
  if (duplicates.rows.length) {
    const backup = path.join(pathProvider.getBackupDir(), 'before-plus-integrity-' + Date.now() + '.sqlite');
    await db.execute({ sql: 'VACUUM INTO ?', args: [backup] });
    logger.info('Saved backup before Plus duplicate migration', { module: 'Migrations', backup });
  }
  await ensureUniquePlusKeys(db);
  await rematchScanRecords(db);
  await new CvrMatchingEngine(() => db).rematchCvrRecords();

  logger.info('Migrations completed successfully.', { module: 'Migrations' });
}
