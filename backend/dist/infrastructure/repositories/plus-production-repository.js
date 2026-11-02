"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlPlusProductionRepository = void 0;
class SqlPlusProductionRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findLotFamily(itemCode, lotNo) {
        const prefix = lotNo + '-';
        const result = await this.db.execute({
            sql: `SELECT id,item_code,batch_no,seq_no,prod_qty FROM plus_records
        WHERE item_code=? AND (batch_no=? OR substr(batch_no,1,?)=?)`,
            args: [itemCode, lotNo, prefix.length, prefix]
        });
        return result.rows.map(row => ({ id: String(row.id), itemCode: String(row.item_code), lotNo: String(row.batch_no),
            seqNo: String(row.seq_no), quantity: row.prod_qty === null ? null : Number(row.prod_qty) }));
    }
}
exports.SqlPlusProductionRepository = SqlPlusProductionRepository;
