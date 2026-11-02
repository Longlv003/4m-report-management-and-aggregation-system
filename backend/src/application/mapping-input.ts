import { ItemMappingInput, normalizeSeqNo } from '../domain/item-mapping.js';
import { ValidationError } from '../errors/app-error.js';

export function mappingInput(body: Record<string, unknown>): ItemMappingInput {
  const { itemName, seqNo, pcsPerSheet, process = '', build = '', model = '' } = body;
  const count = Number(pcsPerSheet);
  if (typeof itemName !== 'string' || !itemName.trim() || typeof seqNo !== 'string' || !normalizeSeqNo(seqNo) ||
      typeof process !== 'string' || typeof build !== 'string' || typeof model !== 'string' ||
      (pcsPerSheet !== null && (!['string', 'number'].includes(typeof pcsPerSheet) || String(pcsPerSheet).trim() === '' ||
      !Number.isSafeInteger(count) || count < 0))) {
    throw new ValidationError('Item name, Seq no và số pcs/sheet nguyên không âm là bắt buộc');
  }
  return { itemName: itemName.trim(), seqNo: normalizeSeqNo(seqNo), pcsPerSheet: pcsPerSheet === null ? null : count,
    process: process.trim(), build: build.trim(), model: model.trim() };
}
