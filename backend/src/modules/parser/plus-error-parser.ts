import xlsx from 'xlsx';
import fs from 'fs';
import { FileProcessingError } from '../../errors/app-error.js';
import { configurationProvider } from '../../config/configuration-provider.js';

export interface PlusErrorEntry {
  itemCode: string;
  batchNo: string;
  productName: string;
  processType: string;
  inspectionDate: string;
  totalNgQty: number;
  inspectionQty: number;
  ngRate: number;
  d1: number;
  d2: number;
  d3: number;
  d4: number;
  d5: number;
  d6: number;
  d7: number;
  d8: number;
  d9: number;
  d10: number;
}

export function parsePlusErrorExcel(filePath: string): PlusErrorEntry[] {
  if (!fs.existsSync(filePath)) {
    throw new FileProcessingError(`File Excel lỗi không tồn tại: ${filePath}`);
  }
  const config = configurationProvider.getCvrDataMapping();
  const importConfig = config.plusErrorImport;
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new FileProcessingError(`Sheet không hợp lệ trong file: ${filePath}`);
  const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  const codeHeaders = (rows[importConfig.codeHeaderRow - 1] || []).map(value => String(value).trim());
  const fields = ['discoloration', 'fm', 'copperResidue', 'brokenHole', 'bvhShift',
    'missingHole', 'extraHole', 'dfrSeepage', 'other', 'dfrRemain'];
  const groups = importConfig.processTypes.flatMap(processType => {
    // Shadow codes can appear at DI:DR / EE:EN, after unrelated PF/PS codes.
    if (!codeHeaders.some(code => new RegExp(`^${processType}\\d+$`).test(code))) return [];
    const side = processType === 'BSS' || processType.endsWith('B') ? 'B' : 'A';
    const columns = fields.map(field => {
      const entry = config.mappings[field + side];
      const code = entry.sourceColumn!.replace('{processType}', processType);
      const index = codeHeaders.indexOf(code);
      if (index < 0) throw new FileProcessingError(`Thiếu mã lỗi ${code} trong file: ${filePath}`);
      return { index, key: entry.storageColumn! };
    });
    return [{ processType, columns }];
  });
  if (groups.length === 0) throw new FileProcessingError(`Không tìm thấy nhóm mã lỗi CVR trong file: ${filePath}`);
  const cell = (row: unknown[], field: keyof typeof importConfig.columns) => row[xlsx.utils.decode_col(importConfig.columns[field])];
  const parseNum = (value: unknown): number => {
    if (value === undefined || value === null || String(value).trim() === '') return 0;
    const number = Number(String(value).replace(/,/g, ''));
    if (!Number.isFinite(number)) throw new FileProcessingError(`Giá trị số không hợp lệ: ${value} trong ${filePath}`);
    return number;
  };
  const entries: PlusErrorEntry[] = [];
  for (const row of rows.slice(importConfig.dataStartRow - 1)) {
    const itemCode = String(cell(row, 'itemCode') || '').trim();
    const batchNo = String(cell(row, 'batchNo') || '').trim();
    if (!itemCode || !batchNo) continue;
    for (const group of groups) {
      const defects: Record<string, number> = {};
      group.columns.forEach(({ index, key }) => { defects[key] = parseNum(row[index]); });
      entries.push({
        itemCode, batchNo, productName: String(cell(row, 'productName') || '').trim(),
        processType: group.processType, inspectionDate: String(cell(row, 'inspectionDate') || ''),
        totalNgQty: parseNum(cell(row, 'totalNgQty')),
        inspectionQty: parseNum(cell(row, 'inspectionQty')),
        ngRate: parseNum(cell(row, 'ngRate')),
        d1: defects.d1, d2: defects.d2, d3: defects.d3, d4: defects.d4, d5: defects.d5,
        d6: defects.d6, d7: defects.d7, d8: defects.d8, d9: defects.d9, d10: defects.d10
      });
    }
  }
  return entries;
}
