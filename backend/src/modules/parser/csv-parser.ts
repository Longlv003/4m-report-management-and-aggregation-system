import fs from 'fs';
import { FileProcessingError } from '../../errors/app-error.js';
import { configurationProvider } from '../../config/configuration-provider.js';

export interface ParsedCsvResult {
  headers: string[];
  rows: Array<Record<string, string>>;
}

// A quoted CSV field may contain newlines. Split records only outside quotes.
export function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let record = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      record += char;
      if (inQuotes && content[i + 1] === '"') record += content[++i];
      else inQuotes = !inQuotes;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (record.trim()) rows.push(parseCsvLine(record));
      record = '';
      if (char === '\r' && content[i + 1] === '\n') i++;
    } else record += char;
  }
  if (inQuotes) throw new FileProcessingError('CSV có ô được đặt trong dấu ngoặc kép chưa đóng');
  if (record.trim()) rows.push(parseCsvLine(record));
  return rows;
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

export function parseWcsCsv(filePath: string): ParsedCsvResult {
  if (!fs.existsSync(filePath)) {
    throw new FileProcessingError(`CSV file does not exist: ${filePath}`);
  }

  const rawContent = fs.readFileSync(filePath, 'utf8');
  // Strip BOM if present
  const content = rawContent.charCodeAt(0) === 0xFEFF ? rawContent.slice(1) : rawContent;
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    throw new FileProcessingError(`CSV file is completely empty: ${filePath}`);
  }

  const headers = parseCsvLine(lines[0]).map(h => h.trim());

  // Check required columns from configuration
  const requiredColumns = configurationProvider.getDataMapping().wcsRequiredColumns;
  const missingColumns = requiredColumns.filter(col => !headers.includes(col));

  if (missingColumns.length > 0) {
    throw new FileProcessingError(
      `File CSV thiếu các cột bắt buộc: [${missingColumns.join(', ')}]`,
      { missingColumns, foundColumnsCount: headers.length }
    );
  }

  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] !== undefined ? values[idx].trim() : '';
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}
