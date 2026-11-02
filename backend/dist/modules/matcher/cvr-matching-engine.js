"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cvrMatchingEngine = exports.CvrMatchingEngine = void 0;
exports.calculateTotalTimeMinutes = calculateTotalTimeMinutes;
const plus_production_matcher_js_1 = require("../../composition/plus-production-matcher.js");
const cvr_quantities_js_1 = require("../../domain/cvr-quantities.js");
const item_mapping_repository_js_1 = require("../../infrastructure/repositories/item-mapping-repository.js");
const crypto_1 = __importDefault(require("crypto"));
const configuration_provider_js_1 = require("../../config/configuration-provider.js");
const connection_js_1 = require("../../database/connection.js");
const cvr_wcs_parser_js_1 = require("../parser/cvr-wcs-parser.js");
const logger_js_1 = require("../../logging/logger.js");
function calculateTotalTimeMinutes(start, finish) {
    if (!start || !finish)
        return '-';
    try {
        const s = new Date(start.replace(' ', 'T')).getTime();
        const f = new Date(finish.replace(' ', 'T')).getTime();
        if (isNaN(s) || isNaN(f))
            return '-';
        const diffMs = f - s;
        const diffMins = Math.round(diffMs / 60000);
        return diffMins >= 0 ? `${diffMins} min` : `${diffMins} min (Lệch)`;
    }
    catch {
        return '-';
    }
}
class CvrMatchingEngine {
    database;
    static instance = null;
    constructor(database = connection_js_1.getDb) {
        this.database = database;
    }
    static getInstance() {
        if (!CvrMatchingEngine.instance) {
            CvrMatchingEngine.instance = new CvrMatchingEngine();
        }
        return CvrMatchingEngine.instance;
    }
    /**
     * Process a list of WCS CVR records and match them against PLUS production and Error Log records.
     */
    async processAndMatchCvrRecords(wcsRecords, wcsFileId) {
        const db = this.database();
        let inserted = 0;
        let updated = 0;
        const now = new Date().toISOString();
        const plusMatcher = (0, plus_production_matcher_js_1.createPlusProductionMatcher)(db, wcsRecords.map(row => ({ itemCode: row.itemCode, lotNo: row.lotNo, seqNo: row.seqNo })));
        for (const wcs of wcsRecords) {
            // Both item and process sequence must match; never use an item-only fallback.
            const itemMapping = await new item_mapping_repository_js_1.ItemMappingRepository(db).findActive(wcs.itemName, wcs.seqNo);
            const pcsPerSheet = Number(itemMapping?.pcs_per_sheet || 0);
            const processName = String(itemMapping?.process || '');
            const totalTime = calculateTotalTimeMinutes(wcs.startTime, wcs.finishTime);
            const opDisplay = wcs.opName ? `${wcs.opCode} - ${wcs.opName}` : wcs.opCode;
            const plusMatch = await plusMatcher.match(wcs.itemCode, wcs.lotNo, wcs.seqNo);
            const totalSheetIndi = plusMatch.quantity;
            // Match exact item + lot across every configured group for each side.
            const mapping = configuration_provider_js_1.configurationProvider.getCvrDataMapping();
            const [ea, eb] = await Promise.all([
                this.lookupDefects(wcs.itemCode, wcs.lotNo, mapping.errorProcessTypes.sideA),
                this.lookupDefects(wcs.itemCode, wcs.lotNo, mapping.errorProcessTypes.sideB)
            ]);
            const dA = {
                d1: Number(ea?.[mapping.mappings.discolorationA.storageColumn] || 0),
                d2: Number(ea?.[mapping.mappings.fmA.storageColumn] || 0),
                d3: Number(ea?.[mapping.mappings.copperResidueA.storageColumn] || 0),
                d4: Number(ea?.[mapping.mappings.brokenHoleA.storageColumn] || 0),
                d5: Number(ea?.[mapping.mappings.bvhShiftA.storageColumn] || 0),
                d6: Number(ea?.[mapping.mappings.missingHoleA.storageColumn] || 0),
                d7: Number(ea?.[mapping.mappings.extraHoleA.storageColumn] || 0),
                d8: Number(ea?.[mapping.mappings.dfrSeepageA.storageColumn] || 0),
                d9: Number(ea?.[mapping.mappings.otherA.storageColumn] || 0),
                d10: Number(ea?.[mapping.mappings.dfrRemainA.storageColumn] || 0),
            };
            const accumA = dA.d1 + dA.d2 + dA.d3 + dA.d4 + dA.d5 + dA.d6 + dA.d7 + dA.d8 + dA.d9 + dA.d10;
            const dB = {
                d1: Number(eb?.[mapping.mappings.discolorationB.storageColumn] || 0),
                d2: Number(eb?.[mapping.mappings.fmB.storageColumn] || 0),
                d3: Number(eb?.[mapping.mappings.copperResidueB.storageColumn] || 0),
                d4: Number(eb?.[mapping.mappings.brokenHoleB.storageColumn] || 0),
                d5: Number(eb?.[mapping.mappings.bvhShiftB.storageColumn] || 0),
                d6: Number(eb?.[mapping.mappings.missingHoleB.storageColumn] || 0),
                d7: Number(eb?.[mapping.mappings.extraHoleB.storageColumn] || 0),
                d8: Number(eb?.[mapping.mappings.dfrSeepageB.storageColumn] || 0),
                d9: Number(eb?.[mapping.mappings.otherB.storageColumn] || 0),
                d10: Number(eb?.[mapping.mappings.dfrRemainB.storageColumn] || 0),
            };
            const accumB = dB.d1 + dB.d2 + dB.d3 + dB.d4 + dB.d5 + dB.d6 + dB.d7 + dB.d8 + dB.d9 + dB.d10;
            const totalPatternNg = accumA + accumB;
            const totalPcs = (0, cvr_quantities_js_1.calculateTotalPcs)(totalSheetIndi, pcsPerSheet);
            const totalPcsCvr = (0, cvr_quantities_js_1.calculateTotalPcs)(wcs.totalSheetVrf, pcsPerSheet);
            const percentage = (defects) => totalPcs !== null && totalPcs > 0
                ? Number((defects / totalPcs * 100).toFixed(6)) : null;
            const ngRate = percentage(totalPatternNg);
            const ngRateA = percentage(accumA);
            const ngRateB = percentage(accumB);
            // Determine match status
            let matchStatus = 'MATCHED';
            if (totalSheetIndi === null && !ea && !eb) {
                matchStatus = 'UNMATCHED_PLUS';
            }
            else if (totalSheetIndi === null) {
                matchStatus = 'MATCHED_ERROR_ONLY';
            }
            // Separate Verify machines may report the same item/lot and start time.
            const existing = await db.execute({
                sql: `SELECT id FROM cvr4m_records 
              WHERE item_code = ? AND lot_no = ? AND seq_no = ? AND start_time = ? AND machine = ? LIMIT 1;`,
                args: [wcs.itemCode.trim(), wcs.lotNo.trim(), wcs.seqNo.trim(), wcs.startTime, wcs.machine]
            });
            if (existing.rows.length === 0) {
                const id = `cvr-${crypto_1.default.randomUUID()}`;
                await db.execute({
                    sql: `INSERT INTO cvr4m_records (
            id, wcs_file_id, date, machine, shift, start_time, finish_time, total_time,
            item_name, item_code, lot_no, seq_no, process, program_name,
            total_sheet_indi, total_sheet_vrf, op, total_pcs, total_pcs_cvr, total_pattern_ng, ng_rate,
            accumulative_defect_a, ng_rate_a, discoloration_a, fm_a, copper_residue_a, broken_hole_a,
            bvh_shift_a, missing_hole_a, extra_hole_a, dfr_seepage_a, other_a, dfr_remain_a, verify_zoom_a,
            accumulative_defect_b, ng_rate_b, discoloration_b, fm_b, copper_residue_b, broken_hole_b,
            bvh_shift_b, missing_hole_b, extra_hole_b, dfr_seepage_b, other_b, dfr_remain_b, verify_zoom_b,
            match_status, raw_wcs_json, created_at, updated_at, plus_match_method, plus_match_details
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?
          );`,
                    args: [
                        id, wcsFileId, wcs.date, wcs.machine, wcs.shift, wcs.startTime, wcs.finishTime, totalTime,
                        wcs.itemName, wcs.itemCode, wcs.lotNo, wcs.seqNo, processName, wcs.programName,
                        totalSheetIndi, wcs.totalSheetVrf, opDisplay, totalPcs, totalPcsCvr, totalPatternNg, ngRate,
                        accumA, ngRateA, dA.d1, dA.d2, dA.d3, dA.d4, dA.d5, dA.d6, dA.d7, dA.d8, dA.d9, dA.d10, wcs.verifyZoomA,
                        accumB, ngRateB, dB.d1, dB.d2, dB.d3, dB.d4, dB.d5, dB.d6, dB.d7, dB.d8, dB.d9, dB.d10, wcs.verifyZoomB,
                        matchStatus, wcs.rawJson, now, now, plusMatch.method, JSON.stringify(plusMatch)
                    ]
                });
                inserted++;
            }
            else {
                const id = existing.rows[0].id;
                await db.execute({
                    sql: `UPDATE cvr4m_records SET
            wcs_file_id = ?, date = ?, machine = ?, shift = ?, start_time = ?, finish_time = ?, total_time = ?,
            item_name = ?, item_code = ?, lot_no = ?, seq_no = ?, process = ?, program_name = ?,
            total_sheet_indi = ?, total_sheet_vrf = ?, op = ?, total_pcs = ?, total_pcs_cvr = ?, total_pattern_ng = ?, ng_rate = ?,
            accumulative_defect_a = ?, ng_rate_a = ?, discoloration_a = ?, fm_a = ?, copper_residue_a = ?, broken_hole_a = ?,
            bvh_shift_a = ?, missing_hole_a = ?, extra_hole_a = ?, dfr_seepage_a = ?, other_a = ?, dfr_remain_a = ?, verify_zoom_a = ?,
            accumulative_defect_b = ?, ng_rate_b = ?, discoloration_b = ?, fm_b = ?, copper_residue_b = ?, broken_hole_b = ?,
            bvh_shift_b = ?, missing_hole_b = ?, extra_hole_b = ?, dfr_seepage_b = ?, other_b = ?, dfr_remain_b = ?, verify_zoom_b = ?,
            match_status = ?, raw_wcs_json = ?, updated_at = ?, plus_match_method = ?, plus_match_details = ?
            WHERE id = ?;`,
                    args: [
                        wcsFileId, wcs.date, wcs.machine, wcs.shift, wcs.startTime, wcs.finishTime, totalTime,
                        wcs.itemName, wcs.itemCode, wcs.lotNo, wcs.seqNo, processName, wcs.programName,
                        totalSheetIndi, wcs.totalSheetVrf, opDisplay, totalPcs, totalPcsCvr, totalPatternNg, ngRate,
                        accumA, ngRateA, dA.d1, dA.d2, dA.d3, dA.d4, dA.d5, dA.d6, dA.d7, dA.d8, dA.d9, dA.d10, wcs.verifyZoomA,
                        accumB, ngRateB, dB.d1, dB.d2, dB.d3, dB.d4, dB.d5, dB.d6, dB.d7, dB.d8, dB.d9, dB.d10, wcs.verifyZoomB,
                        matchStatus, wcs.rawJson, now, plusMatch.method, JSON.stringify(plusMatch), id
                    ]
                });
                updated++;
            }
        }
        logger_js_1.logger.info(`CVR Matching complete: ${inserted} inserted, ${updated} updated`, { module: 'CvrMatchingEngine' });
        return { inserted, updated };
    }
    async lookupDefects(itemCode, lotNo, groups) {
        const columns = Array.from({ length: 10 }, (_, index) => 'd' + (index + 1));
        const result = await this.database().execute({
            sql: 'SELECT COUNT(*) AS matched_count, ' + columns.map(column => 'COALESCE(SUM(' + column + '), 0) AS ' + column).join(', ') +
                ' FROM plus_error_records WHERE item_code = ? AND batch_no = ? AND process_type IN (' + groups.map(() => '?').join(', ') + ')',
            args: [itemCode.trim(), lotNo.trim(), ...groups]
        });
        const row = result.rows[0];
        return Number(row?.matched_count || 0) > 0 ? row : undefined;
    }
    /** Recalculate all stored CVR rows, including already-matched rows, after source updates. */
    async rematchCvrRecords(ids) {
        if (ids && !ids.length)
            return { rematchedCount: 0 };
        const rows = await this.database().execute({
            sql: `SELECT wcs_file_id,raw_wcs_json FROM cvr4m_records WHERE raw_wcs_json IS NOT NULL ${ids ? `AND id IN (${ids.map(() => '?').join(',')})` : ''}`,
            args: ids ? [...ids] : []
        });
        let rematchedCount = 0;
        for (const row of rows.rows) {
            const wcs = (0, cvr_wcs_parser_js_1.parseCvrWcsRow)(JSON.parse(row.raw_wcs_json));
            const result = await this.processAndMatchCvrRecords([wcs], row.wcs_file_id);
            rematchedCount += result.updated;
        }
        return { rematchedCount };
    }
}
exports.CvrMatchingEngine = CvrMatchingEngine;
exports.cvrMatchingEngine = CvrMatchingEngine.getInstance();
