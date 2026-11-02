import { PlusProductionSource, WcsLotSource, selectPlusProduction } from '../domain/plus-production-match.js';
import { normalizeSeqNo } from '../domain/item-mapping.js';

export class PlusProductionMatcher {
  constructor(private readonly source: PlusProductionSource, private readonly wcs: WcsLotSource) {}
  async match(itemCode: string, lotNo: string, seqNo: string) {
    const item = itemCode.trim(), lot = lotNo.trim(), seq = normalizeSeqNo(seqNo);
    if (!item || !lot || !seq) return selectPlusProduction([],item,lot,seq);
    const [rows,childLots] = await Promise.all([
      this.source.findLotFamily(item,lot), this.wcs.findChildLots(item,lot,seq)
    ]);
    return selectPlusProduction(rows,item,lot,seq,childLots);
  }
}
