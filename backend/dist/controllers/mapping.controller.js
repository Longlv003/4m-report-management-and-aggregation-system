"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMappingsController = getMappingsController;
exports.createMappingController = createMappingController;
exports.updateMappingController = updateMappingController;
exports.softDeleteMappingController = softDeleteMappingController;
exports.restoreMappingController = restoreMappingController;
const crypto_1 = __importDefault(require("crypto"));
const connection_js_1 = require("../database/connection.js");
const audited_mutation_js_1 = require("../composition/audited-mutation.js");
const cvr_matching_engine_js_1 = require("../modules/matcher/cvr-matching-engine.js");
const sse_manager_js_1 = require("../modules/realtime/sse-manager.js");
const app_error_js_1 = require("../errors/app-error.js");
async function getMappingsController(req, res, next) {
    try {
        const db = (0, connection_js_1.getDb)();
        const { search, status } = req.query;
        const isDeletedFilter = status === 'deleted' ? 1 : 0;
        const conditions = ['is_deleted = ?'];
        const args = [isDeletedFilter];
        if (search) {
            conditions.push('(item_name LIKE ? OR process LIKE ?)');
            const s = `%${search}%`;
            args.push(s, s);
        }
        const rows = await db.execute({
            sql: `SELECT * FROM item_mapping WHERE ${conditions.join(' AND ')} ORDER BY item_name ASC;`,
            args
        });
        res.json({ success: true, data: rows.rows });
    }
    catch (err) {
        next(err);
    }
}
function mappingInput(body) {
    const { itemName, pcsPerSheet, process } = body;
    const count = Number(pcsPerSheet);
    if (typeof itemName !== 'string' || !itemName.trim() || typeof process !== 'string' || !process.trim() ||
        !['string', 'number'].includes(typeof pcsPerSheet) || String(pcsPerSheet).trim() === '' ||
        !Number.isSafeInteger(count) || count < 0) {
        throw new app_error_js_1.ValidationError('Tên item, process và số pcs/sheet nguyên không âm là bắt buộc');
    }
    return { name: itemName.trim(), count, process: process.trim() };
}
async function mutateMapping(req, res, next, work) {
    try {
        const action = req.path.endsWith('/restore') ? 'RESTORE' : req.method === 'DELETE' ? 'DELETE' : req.method === 'POST' ? 'CREATE' : 'UPDATE';
        const result = await (0, audited_mutation_js_1.auditedMutation)({ id: req.user.id, username: req.user.username, ip: req.ip }, 'item_mapping', action, req.params.id, async (tx) => {
            const result = await work(tx);
            await new cvr_matching_engine_js_1.CvrMatchingEngine(() => tx).rematchCvrRecords();
            return result;
        });
        req.auditRecorded = true;
        sse_manager_js_1.sseManager.broadcast({ event: 'record_updated', data: { resource: 'item_mapping', id: result.id } });
        res.status(result.status || 200).json({ success: true, message: result.message, data: { id: result.id } });
    }
    catch (error) {
        next(error);
    }
}
async function createMappingController(req, res, next) {
    await mutateMapping(req, res, next, async (tx) => {
        const input = mappingInput(req.body);
        const existing = await tx.execute({ sql: 'SELECT id,is_deleted FROM item_mapping WHERE item_name=?', args: [input.name] });
        const old = existing.rows[0];
        if (old && !old.is_deleted)
            throw new app_error_js_1.ConflictError('Item đã tồn tại trong bảng mapping');
        const now = new Date().toISOString();
        const id = old ? String(old.id) : 'map-' + crypto_1.default.randomUUID();
        if (old) {
            await tx.execute({ sql: 'UPDATE item_mapping SET is_deleted=0,pcs_per_sheet=?,process=?,updated_by=?,updated_at=? WHERE id=?',
                args: [input.count, input.process, req.user?.id || null, now, id] });
        }
        else {
            await tx.execute({ sql: 'INSERT INTO item_mapping (id,item_name,pcs_per_sheet,process,is_deleted,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,0,?,?,?,?)',
                args: [id, input.name, input.count, input.process, req.user?.id || null, req.user?.id || null, now, now] });
        }
        return { id, message: old ? 'Đã khôi phục và cập nhật item mapping' : 'Đã thêm item mapping', status: old ? 200 : 201 };
    });
}
async function updateMappingController(req, res, next) {
    await mutateMapping(req, res, next, async (tx) => {
        const input = mappingInput(req.body);
        const id = req.params.id;
        const existing = await tx.execute({ sql: 'SELECT id FROM item_mapping WHERE id=? AND is_deleted=0', args: [id] });
        if (!existing.rows.length)
            throw new app_error_js_1.NotFoundError('Không tìm thấy item mapping');
        const conflict = await tx.execute({ sql: 'SELECT id FROM item_mapping WHERE item_name=? AND id!=?', args: [input.name, id] });
        if (conflict.rows.length)
            throw new app_error_js_1.ConflictError('Item name đã tồn tại');
        await tx.execute({ sql: 'UPDATE item_mapping SET item_name=?,pcs_per_sheet=?,process=?,updated_by=?,updated_at=? WHERE id=?',
            args: [input.name, input.count, input.process, req.user?.id || null, new Date().toISOString(), id] });
        return { id, message: 'Đã cập nhật item mapping' };
    });
}
async function setDeleted(req, res, next, deleted) {
    await mutateMapping(req, res, next, async (tx) => {
        const id = req.params.id;
        const existing = await tx.execute({ sql: 'SELECT id FROM item_mapping WHERE id=? AND is_deleted=?', args: [id, 1 - deleted] });
        if (!existing.rows.length)
            throw new app_error_js_1.NotFoundError('Không tìm thấy item mapping');
        await tx.execute({ sql: 'UPDATE item_mapping SET is_deleted=?,updated_by=?,updated_at=? WHERE id=?',
            args: [deleted, req.user?.id || null, new Date().toISOString(), id] });
        return { id, message: deleted ? 'Đã xóa mềm item mapping' : 'Đã khôi phục item mapping' };
    });
}
async function softDeleteMappingController(req, res, next) {
    await setDeleted(req, res, next, 1);
}
async function restoreMappingController(req, res, next) {
    await setDeleted(req, res, next, 0);
}
