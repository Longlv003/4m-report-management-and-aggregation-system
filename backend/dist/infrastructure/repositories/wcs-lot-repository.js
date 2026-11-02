"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlWcsLotRepository = void 0;
const plus_production_match_js_1 = require("../../domain/plus-production-match.js");
const item_mapping_js_1 = require("../../domain/item-mapping.js");
/** WCS presence is global across both reports, regardless of machine or row visibility. */
class SqlWcsLotRepository {
    db;
    incoming;
    constructor(db, incoming = []) {
        this.db = db;
        this.incoming = incoming;
    }
    async findChildLots(itemCode, lotNo, seqNo) {
        const prefix = lotNo + '-';
        const result = await this.db.execute({
            sql: `SELECT batch_no AS lot_no FROM wcs_records WHERE item_code=? AND seq_no=? AND substr(batch_no,1,?)=?
        UNION SELECT lot_no FROM cvr4m_records WHERE item_code=? AND seq_no=? AND substr(lot_no,1,?)=?`,
            args: [itemCode, seqNo, prefix.length, prefix, itemCode, seqNo, prefix.length, prefix]
        });
        const pending = this.incoming.filter(row => row.itemCode.trim() === itemCode &&
            (0, item_mapping_js_1.normalizeSeqNo)(row.seqNo) === seqNo).map(row => row.lotNo.trim());
        return [...new Set([...result.rows.map(row => String(row.lot_no)), ...pending])].filter(lot => (0, plus_production_match_js_1.isChildLot)(lot, lotNo));
    }
    async findAffectedSplitParents(incoming) {
        const result = await this.db.execute(`
      SELECT 'scan' AS report,id,item_code,lot_no,seq_no FROM scan4m_records WHERE plus_match_method IN ('SPLIT','INCOMPLETE_SPLIT')
      UNION ALL SELECT 'cvr',id,item_code,lot_no,seq_no FROM cvr4m_records WHERE plus_match_method IN ('SPLIT','INCOMPLETE_SPLIT')`);
        const scanIds = [], cvrIds = [];
        for (const row of result.rows) {
            if (incoming.some(child => child.itemCode.trim() === row.item_code && (0, item_mapping_js_1.normalizeSeqNo)(child.seqNo) === row.seq_no &&
                (0, plus_production_match_js_1.isChildLot)(child.lotNo.trim(), String(row.lot_no)))) {
                (row.report === 'scan' ? scanIds : cvrIds).push(String(row.id));
            }
        }
        return { scanIds, cvrIds };
    }
}
exports.SqlWcsLotRepository = SqlWcsLotRepository;
