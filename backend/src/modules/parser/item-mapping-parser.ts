import xlsx from 'xlsx';
import { mappingInput } from '../../application/mapping-input.js';
import { ItemMappingInput } from '../../domain/item-mapping.js';
import { ValidationError } from '../../errors/app-error.js';

/** Read Excel-pasted TSV, including tabs/newlines inside quoted cells. */
export function parseItemMappingText(text: string): ItemMappingInput[] {
  const workbook = xlsx.read(text, { type: 'string', raw: true, FS: '\t' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const headers = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })[0];
  if (!headers || !['Item name', 'Seq no', 'PT/1SH'].every(header => headers.includes(header))) {
    throw new ValidationError('Dữ liệu mapping phải có Item name, Seq no, PT/1SH');
  }
  return xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }).map((row, index) => {
    try {
      return mappingInput({ itemName: row['Item name'], seqNo: String(row['Seq no']),
        pcsPerSheet: String(row['PT/1SH']).trim() ? row['PT/1SH'] : null,
        process: String(row['CÔNG ĐOẠN'] ?? ''), build: String(row.BUILD ?? ''), model: String(row.MODEL ?? '') });
    } catch (error) {
      throw new ValidationError(`Mapping dòng ${index + 2}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}
