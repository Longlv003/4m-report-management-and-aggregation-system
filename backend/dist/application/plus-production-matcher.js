"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlusProductionMatcher = void 0;
const plus_production_match_js_1 = require("../domain/plus-production-match.js");
const item_mapping_js_1 = require("../domain/item-mapping.js");
class PlusProductionMatcher {
    source;
    wcs;
    constructor(source, wcs) {
        this.source = source;
        this.wcs = wcs;
    }
    async match(itemCode, lotNo, seqNo) {
        const item = itemCode.trim(), lot = lotNo.trim(), seq = (0, item_mapping_js_1.normalizeSeqNo)(seqNo);
        if (!item || !lot || !seq)
            return (0, plus_production_match_js_1.selectPlusProduction)([], item, lot, seq);
        const [rows, childLots] = await Promise.all([
            this.source.findLotFamily(item, lot), this.wcs.findChildLots(item, lot, seq)
        ]);
        return (0, plus_production_match_js_1.selectPlusProduction)(rows, item, lot, seq, childLots);
    }
}
exports.PlusProductionMatcher = PlusProductionMatcher;
