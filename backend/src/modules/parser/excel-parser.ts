import fs from 'fs';
import xlsx from 'xlsx';
import { FileProcessingError } from '../../errors/app-error.js';

export interface ParsedPlusRecord {
  itemCode: string;
  batchNo: string;
  seqNo: string;
  matchKey: string;
  workStart: string;
  workResult: string;
  prodQty: number | null;
  acceptedQty: number | null;
  badQty: number | null;
  picCode: string;
  picName: string;
}

export interface ParsedPlusResult {
  records: ParsedPlusRecord[];
}

export function excelSerialToIsoDate(serial: number | string): string {
  if (typeof serial === 'string') {
    // If it's already a date string (YYYY-MM-DD HH:mm:ss)
    if (/^\d{4}-\d{2}-\d{2}/.test(serial)) {
      return serial;
    }
    const num = parseFloat(serial);
    if (!isNaN(num)) serial = num;
  }

  if (typeof serial === 'number') {
    const parsed = xlsx.SSF.parse_date_code(serial);
    if (parsed) {
      const y = parsed.y;
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      const H = String(parsed.H).padStart(2, '0');
      const M = String(parsed.M).padStart(2, '0');
      const S = String(parsed.S).padStart(2, '0');
      return `${y}-${m}-${d} ${H}:${M}:${S}`;
    }
  }

  return '';
}

export function parsePlusExcel(filePath: string, sheetName = 'Sheet0', headerRow = 0): ParsedPlusResult {
  if (!fs.existsSync(filePath)) {
    throw new FileProcessingError(`Excel file does not exist: ${filePath}`);
  }

  const workbook = xlsx.readFile(filePath, { cellDates: false });
  const sheet = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw new FileProcessingError(`Sheet "${sheetName}" not found in Excel file: ${filePath}`);
  }

  const rawRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: headerRow });
  // Use a Map so duplicate keys within the same file are silently overridden by the latest row
  const recordMap = new Map<string, ParsedPlusRecord>();

  for (const row of rawRows) {
    const itemCode = String(row['Item Code Of Product'] || '').trim();
    const batchNo = String(row['Batch No'] || '').trim();
    const seqNo = String(row['Seq No.'] || '').trim();

    // Skip empty or invalid lines
    if (!itemCode || !batchNo || !seqNo) continue;

    const matchKey = `${itemCode}_${batchNo}_${seqNo}`;

    const workStart = excelSerialToIsoDate(row['Work Start'] as number | string);
    const workResult = excelSerialToIsoDate(row['Work Result'] as number | string);
    const prodQty = row['Production Qty'] !== undefined && row['Production Qty'] !== null ? Number(row['Production Qty']) : null;
    const acceptedQty = row['Accepted Qty'] !== undefined && row['Accepted Qty'] !== null ? Number(row['Accepted Qty']) : null;
    const badQty = row['Bad Item Qty'] !== undefined && row['Bad Item Qty'] !== null ? Number(row['Bad Item Qty']) : null;
    const picCode = String(row['PIC Code'] || '').trim();
    const picName = String(row['PIC Name'] || '').trim();

    // Always override: if the same key appears multiple times in one file, keep the last occurrence
    recordMap.set(matchKey, {
      itemCode,
      batchNo,
      seqNo,
      matchKey,
      workStart,
      workResult,
      prodQty,
      acceptedQty,
      badQty,
      picCode,
      picName
    });
  }

  return { records: Array.from(recordMap.values()) };
}
