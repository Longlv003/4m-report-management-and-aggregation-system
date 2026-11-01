import fs from 'fs';
import { configurationProvider } from '../../config/configuration-provider.js';
import { FileProcessingError } from '../../errors/app-error.js';
import { parseCsvRows } from './csv-parser.js';

export interface CvrWcsRecord {
  processName: string;
  machineCode: string;
  machine: string;
  date: string;
  shift: string;
  operationTime: string;
  opCode: string;
  opName: string;
  opCode2: string;
  opName2: string;
  itemName: string;
  itemCode: string;
  totalSheetVrf: number;
  lotNo: string;
  okQty: number;
  seqNo: string;
  wcsNgQty: number;
  programName: string;
  startTime: string;
  finishTime: string;
  verifyZoom: string;
  verifyZoomA: string;
  verifyZoomB: string;
  airPressure: string;
  rawJson: string;
}

export const CVR_WCS_REQUIRED_COLUMNS = configurationProvider.getCvrDataMapping().wcsRequiredColumns;

export function parseCvrWcsCsv(filePath: string): CvrWcsRecord[] {
  if (!fs.existsSync(filePath)) {
    throw new FileProcessingError(`File CSV WCS CVR không tồn tại: ${filePath}`);
  }

  const rawContent = fs.readFileSync(filePath, 'utf8');
  const content = rawContent.charCodeAt(0) === 0xFEFF ? rawContent.slice(1) : rawContent;
  const rows = parseCsvRows(content);

  if (rows.length === 0) {
    throw new FileProcessingError(`File CSV rỗng: ${filePath}`);
  }

  const headers = rows[0].map(h => h.trim());

  // Check required columns
  const missing = configurationProvider.getCvrDataMapping().wcsRequiredColumns.filter(col => !headers.includes(col));
  if (missing.length > 0) {
    throw new FileProcessingError(`File CSV thiếu các cột bắt buộc: [${missing.join(', ')}]`, {
      missingColumns: missing,
      foundColumnsCount: headers.length
    });
  }

  const records: CvrWcsRecord[] = [];
  for (const vals of rows.slice(1)) {
    const rowObj: Record<string, string> = {};
    headers.forEach((header, index) => { rowObj[header] = vals[index]?.trim() || ''; });
    const record = parseCvrWcsRow(rowObj);
    if (record.itemCode && record.lotNo) records.push(record);
  }
  return records;
}

export function parseCvrWcsRow(rowObj: Record<string, string>): CvrWcsRecord {
  const mappings = configurationProvider.getCvrDataMapping().mappings;
  const value = (key: string) => (rowObj[mappings[key].sourceColumn!] || '').trim();
  const parseNum = (value: string): number => {
    if (!value) return 0;
    const number = Number(value.replace(/,/g, ''));
    if (!Number.isFinite(number)) throw new FileProcessingError('Giá trị số CVR không hợp lệ: ' + value);
    return number;
  };
  return {
    processName: value('processName'), machineCode: value('machineCode'),
    machine: value('machine'), date: value('date'), shift: value('shift'),
    operationTime: value('operationTime'), opCode: value('opCode'), opName: value('opName'),
    opCode2: value('opCode2'), opName2: value('opName2'),
    itemName: value('itemName'), itemCode: value('itemCode'),
    totalSheetVrf: parseNum(value('totalSheetVrf')), lotNo: value('lotNo'),
    okQty: parseNum(value('okQty')), seqNo: value('seqNo'),
    wcsNgQty: parseNum(value('wcsNgQty')), programName: value('programName'),
    startTime: value('startTime') || value('operationTime'), finishTime: value('finishTime'),
    verifyZoom: value('verifyZoom'), verifyZoomA: value('verifyZoomA'), verifyZoomB: value('verifyZoomB'),
    airPressure: value('airPressure'), rawJson: JSON.stringify(rowObj)
  };
}
