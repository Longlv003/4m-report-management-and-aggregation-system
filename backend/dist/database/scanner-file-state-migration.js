"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureScannerFileState = ensureScannerFileState;
async function ensureScannerFileState(db) {
    await db.execute('CREATE INDEX IF NOT EXISTS idx_source_files_path ON source_files(source_system,file_path)');
    await db.execute(`CREATE TABLE IF NOT EXISTS scanner_file_state (
    source_system TEXT NOT NULL, file_path TEXT NOT NULL, source_file_id TEXT NOT NULL,
    sha256 TEXT NOT NULL, file_size INTEGER NOT NULL, mtime_ms REAL NOT NULL, ctime_ms REAL NOT NULL,
    parser_version INTEGER NOT NULL, status TEXT NOT NULL, checked_at TEXT NOT NULL,
    PRIMARY KEY(source_system,file_path),
    FOREIGN KEY(source_file_id) REFERENCES source_files(id) ON DELETE CASCADE
  )`);
    await db.execute('CREATE INDEX IF NOT EXISTS idx_scanner_state_source_file ON scanner_file_state(source_file_id)');
}
