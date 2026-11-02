import { Client } from '@libsql/client';
import { WcsLotKey, WcsLotSource, isChildLot } from '../../domain/plus-production-match.js';
import { normalizeSeqNo } from '../../domain/item-mapping.js';

/** WCS presence is global across both reports, regardless of machine or row visibility. */
export class SqlWcsLotRepository implements WcsLotSource {
  constructor(private readonly db: Pick<Client,'execute'>, private readonly incoming: readonly WcsLotKey[] = []) {}
  async findChildLots(itemCode: string, lotNo: string, seqNo: string): Promise<string[]> {
    const prefix = lotNo + '-';
    const result = await this.db.execute({
      sql: `SELECT batch_no AS lot_no FROM wcs_records WHERE item_code=? AND seq_no=? AND substr(batch_no,1,?)=?
        UNION SELECT lot_no FROM cvr4m_records WHERE item_code=? AND seq_no=? AND substr(lot_no,1,?)=?`,
      args: [itemCode,seqNo,prefix.length,prefix,itemCode,seqNo,prefix.length,prefix]
    });
    const pending = this.incoming.filter(row => row.itemCode.trim() === itemCode &&
      normalizeSeqNo(row.seqNo) === seqNo).map(row => row.lotNo.trim());
    return [...new Set([...result.rows.map(row => String(row.lot_no)),...pending])].filter(lot => isChildLot(lot,lotNo));
  }

  async findAffectedSplitParents(incoming: readonly WcsLotKey[]): Promise<{ scanIds: string[]; cvrIds: string[] }> {
    const result = await this.db.execute(`
      SELECT 'scan' AS report,id,item_code,lot_no,seq_no FROM scan4m_records WHERE plus_match_method IN ('SPLIT','INCOMPLETE_SPLIT')
      UNION ALL SELECT 'cvr',id,item_code,lot_no,seq_no FROM cvr4m_records WHERE plus_match_method IN ('SPLIT','INCOMPLETE_SPLIT')`);
    const scanIds: string[] = [], cvrIds: string[] = [];
    for (const row of result.rows) {
      if (incoming.some(child => child.itemCode.trim() === row.item_code && normalizeSeqNo(child.seqNo) === row.seq_no &&
        isChildLot(child.lotNo.trim(),String(row.lot_no)))) {
        (row.report === 'scan' ? scanIds : cvrIds).push(String(row.id));
      }
    }
    return { scanIds, cvrIds };
  }
}
