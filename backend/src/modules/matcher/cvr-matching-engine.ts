import { calculateTotalPcs } from '../../domain/cvr-quantities.js';
import { ItemMappingRepository } from '../../infrastructure/repositories/item-mapping-repository.js';
import crypto from 'crypto';
import { configurationProvider } from '../../config/configuration-provider.js';
import { getDb } from '../../database/connection.js';
import { CvrWcsRecord, parseCvrWcsRow } from '../parser/cvr-wcs-parser.js';
import { logger } from '../../logging/logger.js';

export function calculateTotalTimeMinutes(start: string, finish: string): string {
  if (!start || !finish) return '-';
  try {
    const s = new Date(start.replace(' ', 'T')).getTime();
    const f = new Date(finish.replace(' ', 'T')).getTime();
    if (isNaN(s) || isNaN(f)) return '-';
    const diffMs = f - s;
    const diffMins = Math.round(diffMs / 60000);
    return diffMins >= 0 ? `${diffMins} min` : `${diffMins} min (Lệch)`;
  } catch {
    return '-';
  }
}

export class CvrMatchingEngine {
  private static instance: CvrMatchingEngine | null = null;

  constructor(private readonly database: () => Pick<ReturnType<typeof getDb>, 'execute'> = getDb) {}

  public static getInstance(): CvrMatchingEngine {
    if (!CvrMatchingEngine.instance) {
      CvrMatchingEngine.instance = new CvrMatchingEngine();
    }
    return CvrMatchingEngine.instance;
  }

  /**
   * Process a list of WCS CVR records and match them against PLUS production and Error Log records.
   */
  public async processAndMatchCvrRecords(
    wcsRecords: CvrWcsRecord[],
    wcsFileId: string
  ): Promise<{ inserted: number; updated: number }> {
    const db = this.database();
    let inserted = 0;
    let updated = 0;
    const now = new Date().toISOString();

    for (const wcs of wcsRecords) {
      // Both item and process sequence must match; never use an item-only fallback.
      const itemMapping = await new ItemMappingRepository(db).findActive(wcs.itemName, wcs.seqNo);
      const pcsPerSheet = Number(itemMapping?.pcs_per_sheet || 0);
      const processName = String(itemMapping?.process || '');

      const totalTime = calculateTotalTimeMinutes(wcs.startTime, wcs.finishTime);
      const opDisplay = wcs.opName ? `${wcs.opCode} - ${wcs.opName}` : wcs.opCode;

      // 2. Lookup PLUS production data (ayda) for Total sheet (Indi)
      const plusProdRes = await db.execute({
        sql: `SELECT prod_qty as production_qty FROM plus_records
              WHERE item_code = ? AND batch_no = ?
              ORDER BY created_at DESC LIMIT 1;`,
        args: [wcs.itemCode.trim(), wcs.lotNo.trim()]
      });

      const totalSheetIndi = plusProdRes.rows.length > 0 
        ? Number(plusProdRes.rows[0].production_qty || 0) 
        : null;

      // Match exact item + lot across every configured group for each side.
      const mapping = configurationProvider.getCvrDataMapping();
      const [ea, eb] = await Promise.all([
        this.lookupDefects(wcs.itemCode, wcs.lotNo, mapping.errorProcessTypes.sideA),
        this.lookupDefects(wcs.itemCode, wcs.lotNo, mapping.errorProcessTypes.sideB)
      ]);

      const dA = {
        d1: Number(ea?.[mapping.mappings.discolorationA.storageColumn!] || 0),
        d2: Number(ea?.[mapping.mappings.fmA.storageColumn!] || 0),
        d3: Number(ea?.[mapping.mappings.copperResidueA.storageColumn!] || 0),
        d4: Number(ea?.[mapping.mappings.brokenHoleA.storageColumn!] || 0),
        d5: Number(ea?.[mapping.mappings.bvhShiftA.storageColumn!] || 0),
        d6: Number(ea?.[mapping.mappings.missingHoleA.storageColumn!] || 0),
        d7: Number(ea?.[mapping.mappings.extraHoleA.storageColumn!] || 0),
        d8: Number(ea?.[mapping.mappings.dfrSeepageA.storageColumn!] || 0),
        d9: Number(ea?.[mapping.mappings.otherA.storageColumn!] || 0),
        d10: Number(ea?.[mapping.mappings.dfrRemainA.storageColumn!] || 0),
      };
      const accumA = dA.d1 + dA.d2 + dA.d3 + dA.d4 + dA.d5 + dA.d6 + dA.d7 + dA.d8 + dA.d9 + dA.d10;

      const dB = {
        d1: Number(eb?.[mapping.mappings.discolorationB.storageColumn!] || 0),
        d2: Number(eb?.[mapping.mappings.fmB.storageColumn!] || 0),
        d3: Number(eb?.[mapping.mappings.copperResidueB.storageColumn!] || 0),
        d4: Number(eb?.[mapping.mappings.brokenHoleB.storageColumn!] || 0),
        d5: Number(eb?.[mapping.mappings.bvhShiftB.storageColumn!] || 0),
        d6: Number(eb?.[mapping.mappings.missingHoleB.storageColumn!] || 0),
        d7: Number(eb?.[mapping.mappings.extraHoleB.storageColumn!] || 0),
        d8: Number(eb?.[mapping.mappings.dfrSeepageB.storageColumn!] || 0),
        d9: Number(eb?.[mapping.mappings.otherB.storageColumn!] || 0),
        d10: Number(eb?.[mapping.mappings.dfrRemainB.storageColumn!] || 0),
      };
      const accumB = dB.d1 + dB.d2 + dB.d3 + dB.d4 + dB.d5 + dB.d6 + dB.d7 + dB.d8 + dB.d9 + dB.d10;
      const totalPatternNg = accumA + accumB;
      const totalPcs = calculateTotalPcs(totalSheetIndi, pcsPerSheet);
      const totalPcsCvr = calculateTotalPcs(wcs.totalSheetVrf, pcsPerSheet);
      const percentage = (defects: number) => totalPcs !== null && totalPcs > 0
        ? Number((defects / totalPcs * 100).toFixed(6)) : null;
      const ngRate = percentage(totalPatternNg);
      const ngRateA = percentage(accumA);
      const ngRateB = percentage(accumB);


      // Determine match status
      let matchStatus = 'MATCHED';
      if (totalSheetIndi === null && !ea && !eb) {
        matchStatus = 'UNMATCHED_PLUS';
      } else if (totalSheetIndi === null) {
        matchStatus = 'MATCHED_ERROR_ONLY';
      }

      // Separate Verify machines may report the same item/lot and start time.
      const existing = await db.execute({
        sql: `SELECT id FROM cvr4m_records 
              WHERE item_code = ? AND lot_no = ? AND seq_no = ? AND start_time = ? AND machine = ? LIMIT 1;`,
        args: [wcs.itemCode.trim(), wcs.lotNo.trim(), wcs.seqNo.trim(), wcs.startTime, wcs.machine]
      });

      if (existing.rows.length === 0) {
        const id = `cvr-${crypto.randomUUID()}`;
        await db.execute({
          sql: `INSERT INTO cvr4m_records (
            id, wcs_file_id, date, machine, shift, start_time, finish_time, total_time,
            item_name, item_code, lot_no, seq_no, process, program_name,
            total_sheet_indi, total_sheet_vrf, op, total_pcs, total_pcs_cvr, total_pattern_ng, ng_rate,
            accumulative_defect_a, ng_rate_a, discoloration_a, fm_a, copper_residue_a, broken_hole_a,
            bvh_shift_a, missing_hole_a, extra_hole_a, dfr_seepage_a, other_a, dfr_remain_a, verify_zoom_a,
            accumulative_defect_b, ng_rate_b, discoloration_b, fm_b, copper_residue_b, broken_hole_b,
            bvh_shift_b, missing_hole_b, extra_hole_b, dfr_seepage_b, other_b, dfr_remain_b, verify_zoom_b,
            match_status, raw_wcs_json, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?
          );`,
          args: [
            id, wcsFileId, wcs.date, wcs.machine, wcs.shift, wcs.startTime, wcs.finishTime, totalTime,
            wcs.itemName, wcs.itemCode, wcs.lotNo, wcs.seqNo, processName, wcs.programName,
            totalSheetIndi, wcs.totalSheetVrf, opDisplay, totalPcs, totalPcsCvr, totalPatternNg, ngRate,
            accumA, ngRateA, dA.d1, dA.d2, dA.d3, dA.d4, dA.d5, dA.d6, dA.d7, dA.d8, dA.d9, dA.d10, wcs.verifyZoomA,
            accumB, ngRateB, dB.d1, dB.d2, dB.d3, dB.d4, dB.d5, dB.d6, dB.d7, dB.d8, dB.d9, dB.d10, wcs.verifyZoomB,
            matchStatus, wcs.rawJson, now, now
          ]
        });
        inserted++;
      } else {
        const id = existing.rows[0].id as string;
        await db.execute({
          sql: `UPDATE cvr4m_records SET
            wcs_file_id = ?, date = ?, machine = ?, shift = ?, start_time = ?, finish_time = ?, total_time = ?,
            item_name = ?, item_code = ?, lot_no = ?, seq_no = ?, process = ?, program_name = ?,
            total_sheet_indi = ?, total_sheet_vrf = ?, op = ?, total_pcs = ?, total_pcs_cvr = ?, total_pattern_ng = ?, ng_rate = ?,
            accumulative_defect_a = ?, ng_rate_a = ?, discoloration_a = ?, fm_a = ?, copper_residue_a = ?, broken_hole_a = ?,
            bvh_shift_a = ?, missing_hole_a = ?, extra_hole_a = ?, dfr_seepage_a = ?, other_a = ?, dfr_remain_a = ?, verify_zoom_a = ?,
            accumulative_defect_b = ?, ng_rate_b = ?, discoloration_b = ?, fm_b = ?, copper_residue_b = ?, broken_hole_b = ?,
            bvh_shift_b = ?, missing_hole_b = ?, extra_hole_b = ?, dfr_seepage_b = ?, other_b = ?, dfr_remain_b = ?, verify_zoom_b = ?,
            match_status = ?, raw_wcs_json = ?, updated_at = ?
            WHERE id = ?;`,
          args: [
            wcsFileId, wcs.date, wcs.machine, wcs.shift, wcs.startTime, wcs.finishTime, totalTime,
            wcs.itemName, wcs.itemCode, wcs.lotNo, wcs.seqNo, processName, wcs.programName,
            totalSheetIndi, wcs.totalSheetVrf, opDisplay, totalPcs, totalPcsCvr, totalPatternNg, ngRate,
            accumA, ngRateA, dA.d1, dA.d2, dA.d3, dA.d4, dA.d5, dA.d6, dA.d7, dA.d8, dA.d9, dA.d10, wcs.verifyZoomA,
            accumB, ngRateB, dB.d1, dB.d2, dB.d3, dB.d4, dB.d5, dB.d6, dB.d7, dB.d8, dB.d9, dB.d10, wcs.verifyZoomB,
            matchStatus, wcs.rawJson, now, id
          ]
        });
        updated++;
      }
    }

    logger.info(`CVR Matching complete: ${inserted} inserted, ${updated} updated`, { module: 'CvrMatchingEngine' });
    return { inserted, updated };
  }

  private async lookupDefects(itemCode: string, lotNo: string, groups: string[]) {
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
  public async rematchCvrRecords(): Promise<{ rematchedCount: number }> {
    const rows = await this.database().execute('SELECT wcs_file_id, raw_wcs_json FROM cvr4m_records WHERE raw_wcs_json IS NOT NULL');
    let rematchedCount = 0;
    for (const row of rows.rows) {
      const wcs = parseCvrWcsRow(JSON.parse(row.raw_wcs_json as string));
      const result = await this.processAndMatchCvrRecords([wcs], row.wcs_file_id as string);
      rematchedCount += result.updated;
    }
    return { rematchedCount };
  }
}

export const cvrMatchingEngine = CvrMatchingEngine.getInstance();
