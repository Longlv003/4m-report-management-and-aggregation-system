export interface PlusProductionRow {
  id: string; itemCode: string; lotNo: string; seqNo: string; quantity: number | null;
}
export interface PlusProductionSource {
  findLotFamily(itemCode: string, lotNo: string): Promise<PlusProductionRow[]>;
}
export interface WcsLotKey { itemCode: string; lotNo: string; seqNo: string; }
export interface WcsLotSource {
  findChildLots(itemCode: string, lotNo: string, seqNo: string): Promise<string[]>;
}
export interface PlusProductionMatch {
  method: 'EXACT' | 'SPLIT' | 'INCOMPLETE_SPLIT' | 'WCS_CHILD_PRESENT' | 'UNMATCHED';
  itemCode: string; lotNo: string; seqNo: string; quantity: number | null;
  records: PlusProductionRow[]; missingLots: string[]; reason: string | null;
  blockedWcsLots?: string[];
}
export function isChildLot(candidate: string, parent: string): boolean {
  return candidate.startsWith(parent + '-') && /^\d+(?:-\d+)*$/.test(candidate.slice(parent.length + 1));
}
function validQuantity(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

/** Exact item/lot/sequence first; aggregate only a complete, unambiguous child family at that sequence. */
export function selectPlusProduction(rows: PlusProductionRow[], itemCode: string, lotNo: string, seqNo: string,
  wcsChildLots: readonly string[] = []): PlusProductionMatch {
  const result: PlusProductionMatch = { method: 'UNMATCHED', itemCode, lotNo, seqNo, quantity: null,
    records: [], missingLots: [], reason: 'Chưa có Plus cùng Item code, Lot no và Seq no' };
  const itemRows = rows.filter(row => row.itemCode === itemCode);
  const exact = itemRows.filter(row => row.lotNo === lotNo && row.seqNo === seqNo);
  if (exact.length) {
    result.records = exact;
    if (exact.length === 1 && validQuantity(exact[0].quantity)) {
      return { ...result, method: 'EXACT', quantity: exact[0].quantity, reason: null };
    }
    return { ...result, reason: 'Plus trùng khóa hoặc thiếu Production Qty hợp lệ' };
  }
  const children = itemRows.filter(row => isChildLot(row.lotNo, lotNo));
  const sameSeq = children.filter(row => row.seqNo === seqNo).sort((a,b) => a.lotNo.localeCompare(b.lotNo));
  if (!sameSeq.length) return result;
  const blockedWcsLots = [...new Set(wcsChildLots.filter(lot => isChildLot(lot,lotNo)))].sort();
  if (blockedWcsLots.length) {
    return { ...result, method: 'WCS_CHILD_PRESENT', blockedWcsLots,
      reason: `Không ghép lot con cho lot mẹ: WCS đã có lot con cùng Item và Seq ${seqNo}: ${blockedWcsLots.join(', ')}` };
  }
  const knownLots = [...new Set(children.map(row => row.lotNo))];
  result.records = sameSeq;
  result.missingLots = knownLots.filter(lot => !sameSeq.some(row => row.lotNo === lot)).sort();
  if (knownLots.some(parent => knownLots.some(child => isChildLot(child,parent)))) {
    return { ...result, method: 'INCOMPLETE_SPLIT', reason: 'Lot con có nhiều cấp chồng nhau; chưa thể cộng số lượng an toàn' };
  }
  if (new Set(sameSeq.map(row => row.lotNo)).size !== sameSeq.length || sameSeq.some(row => !validQuantity(row.quantity))) {
    return { ...result, method: 'INCOMPLETE_SPLIT', reason: 'Lot con trùng khóa hoặc thiếu Production Qty hợp lệ' };
  }
  if (result.missingLots.length) {
    return { ...result, method: 'INCOMPLETE_SPLIT', reason: `Thiếu Plus Seq ${seqNo} của lot con: ${result.missingLots.join(', ')}` };
  }
  return { ...result, method: 'SPLIT', quantity: sameSeq.reduce((sum,row) => sum + row.quantity!,0), reason: null };
}
