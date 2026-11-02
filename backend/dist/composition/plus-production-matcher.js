"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlusProductionMatcher = createPlusProductionMatcher;
const plus_production_matcher_js_1 = require("../application/plus-production-matcher.js");
const plus_production_repository_js_1 = require("../infrastructure/repositories/plus-production-repository.js");
const wcs_lot_repository_js_1 = require("../infrastructure/repositories/wcs-lot-repository.js");
function createPlusProductionMatcher(db, incoming = []) {
    return new plus_production_matcher_js_1.PlusProductionMatcher(new plus_production_repository_js_1.SqlPlusProductionRepository(db), new wcs_lot_repository_js_1.SqlWcsLotRepository(db, incoming));
}
