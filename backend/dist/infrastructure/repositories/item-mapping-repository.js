"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItemMappingRepository = void 0;
const item_mapping_js_1 = require("../../domain/item-mapping.js");
class ItemMappingRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findActive(itemName, seqNo) {
        const result = await this.db.execute({
            sql: 'SELECT pcs_per_sheet,process FROM item_mapping WHERE item_name=? AND seq_no=? AND is_deleted=0',
            args: [itemName.trim(), (0, item_mapping_js_1.normalizeSeqNo)(seqNo)]
        });
        return result.rows[0];
    }
    async findKey(itemName, seqNo) {
        const result = await this.db.execute({ sql: 'SELECT id,is_deleted FROM item_mapping WHERE item_name=? AND seq_no=?',
            args: [itemName, seqNo] });
        const row = result.rows[0];
        return row ? { id: String(row.id), is_deleted: Number(row.is_deleted) } : undefined;
    }
    async save(id, input, actorId, exists) {
        const now = new Date().toISOString();
        if (exists) {
            await this.db.execute({
                sql: `UPDATE item_mapping SET item_name=?,seq_no=?,pcs_per_sheet=?,process=?,build=?,model=?,
              is_deleted=0,updated_by=?,updated_at=? WHERE id=?`,
                args: [input.itemName, input.seqNo, input.pcsPerSheet, input.process, input.build, input.model, actorId, now, id]
            });
        }
        else {
            await this.db.execute({
                sql: `INSERT INTO item_mapping (id,item_name,seq_no,pcs_per_sheet,process,build,model,is_deleted,created_by,updated_by,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,0,?,?,?,?)`,
                args: [id, input.itemName, input.seqNo, input.pcsPerSheet, input.process, input.build, input.model, actorId, actorId, now, now]
            });
        }
    }
}
exports.ItemMappingRepository = ItemMappingRepository;
