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
const mapping_input_js_1 = require("../application/mapping-input.js");
const item_mapping_repository_js_1 = require("../infrastructure/repositories/item-mapping-repository.js");
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
            conditions.push('(item_name LIKE ? OR seq_no LIKE ? OR process LIKE ? OR build LIKE ? OR model LIKE ?)');
            const s = `%${search}%`;
            args.push(s, s, s, s, s);
        }
        const rows = await db.execute({
            sql: `SELECT * FROM item_mapping WHERE ${conditions.join(' AND ')} ORDER BY item_name ASC, seq_no ASC;`,
            args
        });
        res.json({ success: true, data: rows.rows });
    }
    catch (err) {
        next(err);
    }
}
async function mutateMapping(req, res, next, work) {
    try {
        const action = req.path.endsWith('/restore') ? 'RESTORE' : req.method === 'DELETE' ? 'DELETE' : req.method === 'POST' ? 'CREATE' : 'UPDATE';
        const result = await (0, audited_mutation_js_1.auditedMutation)({ id: req.user.id, username: req.user.username, ip: req.clientIp }, 'item_mapping', action, req.params.id, async (tx) => {
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
        const input = (0, mapping_input_js_1.mappingInput)(req.body);
        const repository = new item_mapping_repository_js_1.ItemMappingRepository(tx);
        const old = await repository.findKey(input.itemName, input.seqNo);
        if (old && !old.is_deleted)
            throw new app_error_js_1.ConflictError('Item name + Seq no đã tồn tại trong bảng mapping');
        const id = old ? String(old.id) : 'map-' + crypto_1.default.randomUUID();
        await repository.save(id, input, req.user?.id || null, Boolean(old));
        return { id, message: old ? 'Đã khôi phục và cập nhật item mapping' : 'Đã thêm item mapping', status: old ? 200 : 201 };
    });
}
async function updateMappingController(req, res, next) {
    await mutateMapping(req, res, next, async (tx) => {
        const input = (0, mapping_input_js_1.mappingInput)(req.body);
        const id = req.params.id;
        const existing = await tx.execute({ sql: 'SELECT id FROM item_mapping WHERE id=? AND is_deleted=0', args: [id] });
        if (!existing.rows.length)
            throw new app_error_js_1.NotFoundError('Không tìm thấy item mapping');
        const repository = new item_mapping_repository_js_1.ItemMappingRepository(tx);
        const conflict = await repository.findKey(input.itemName, input.seqNo);
        if (conflict && conflict.id !== id)
            throw new app_error_js_1.ConflictError('Item name + Seq no đã tồn tại');
        await repository.save(id, input, req.user?.id || null, true);
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
