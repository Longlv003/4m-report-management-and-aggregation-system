"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScannerFileStateRepository = void 0;
const node_path_1 = __importDefault(require("node:path"));
function fileKey(filePath) {
    const absolute = node_path_1.default.resolve(filePath);
    return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}
class ScannerFileStateRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findSuccessfulPath(source, filePath, size, parserVersion) {
        const pathCondition = process.platform === 'win32' ? 'file_path=? COLLATE NOCASE' : 'file_path=?';
        const result = await this.db.execute({
            sql: `SELECT id,sha256 FROM source_files WHERE source_system=? AND ${pathCondition}
        AND file_size=? AND parser_version>=? AND status='SUCCESS' ORDER BY processed_at DESC LIMIT 1`,
            args: [source, node_path_1.default.resolve(filePath), size, parserVersion]
        });
        const row = result.rows[0];
        return row ? { id: String(row.id), sha256: String(row.sha256) } : undefined;
    }
    async find(source, filePath) {
        const result = await this.db.execute({
            sql: `SELECT c.*,f.status AS source_status,f.parser_version AS source_parser_version
        FROM scanner_file_state c LEFT JOIN source_files f ON f.id=c.source_file_id AND f.source_system=c.source_system
        WHERE c.source_system=? AND c.file_path=?`, args: [source, fileKey(filePath)]
        });
        const row = result.rows[0];
        return row ? { size: Number(row.file_size), mtimeMs: Number(row.mtime_ms), ctimeMs: Number(row.ctime_ms),
            sha256: String(row.sha256), sourceFileId: String(row.source_file_id), status: String(row.status),
            parserVersion: Number(row.parser_version), sourceStatus: row.source_status,
            sourceParserVersion: Number(row.source_parser_version) } : undefined;
    }
    async save(source, filePath, id, sha256, fingerprint, parserVersion, status) {
        await this.db.execute({
            sql: `INSERT INTO scanner_file_state
        (source_system,file_path,source_file_id,sha256,file_size,mtime_ms,ctime_ms,parser_version,status,checked_at)
        VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_system,file_path) DO UPDATE SET
        source_file_id=excluded.source_file_id,sha256=excluded.sha256,file_size=excluded.file_size,
        mtime_ms=excluded.mtime_ms,ctime_ms=excluded.ctime_ms,parser_version=excluded.parser_version,
        status=excluded.status,checked_at=excluded.checked_at`,
            args: [source, fileKey(filePath), id, sha256, fingerprint.size, fingerprint.mtimeMs, fingerprint.ctimeMs,
                parserVersion, status, new Date().toISOString()]
        });
    }
    async supersedeFailures(source, filePath, currentId) {
        const pathCondition = process.platform === 'win32' ? 'file_path=? COLLATE NOCASE' : 'file_path=?';
        await this.db.execute({
            sql: `UPDATE source_files SET status='SUPERSEDED',processed_at=?
        WHERE source_system=? AND ${pathCondition} AND id<>? AND status='FAILED'`,
            args: [new Date().toISOString(), source, node_path_1.default.resolve(filePath), currentId]
        });
    }
}
exports.ScannerFileStateRepository = ScannerFileStateRepository;
