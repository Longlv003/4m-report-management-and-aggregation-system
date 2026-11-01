import { fixturePath } from './fixture-path.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configurationProvider } from '../src/config/configuration-provider.js';
import { parseCvrWcsCsv } from '../src/modules/parser/cvr-wcs-parser.js';
import { parsePlusErrorExcel } from '../src/modules/parser/plus-error-parser.js';
import xlsx from 'xlsx';

const config = configurationProvider.getCvrDataMapping();
for (const filename of ['S_S+Verify+#5420261031.csv', 'S_S+Verify+#5620261031.csv']) {
  const records = parseCvrWcsCsv(fixturePath('wcsCvr',filename));
  assert.ok(records.length > 0, `${filename} should contain CVR records`);
  const workbook = xlsx.readFile(fixturePath('wcsCvr',filename), { raw: true });
  const expected = xlsx.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
  assert.equal(records.length, expected.length);
  for (const [index, record] of records.entries()) {
    const raw = JSON.parse(record.rawJson);
    assert.equal(record.itemCode, raw['Mã item']);
    assert.equal(record.lotNo, raw['Số lot']);
    assert.equal(record.seqNo, raw['Công đoạn số']);
    assert.equal(record.machine, raw['Tên thiết bị']);
    assert.equal(record.totalSheetVrf, Number(raw['Số tấm input'].replace(/,/g, '')) || 0);
    assert.equal(record.wcsNgQty, Number(raw['Số hàng NG'].replace(/,/g, '')) || 0);
    assert.equal(record.startTime, expected[index]['Thời gian bắt đầu']);
    assert.equal(record.finishTime, expected[index]['Thời gian kết thúc']);
    assert.equal(record.verifyZoom, expected[index]['Độ phóng đại verify']);
    assert.equal(raw['Độ phóng đại verify(Spec)'].replace(/\r\n/g, '\n'), expected[index]['Độ phóng đại verify(Spec)']);
  }
  console.log(`${filename}: ${records.length} records verified`);
}

// Independent workbook coordinates: after-Shadow defects are not at T:AC.
for (const [filename, type, firstColumn] of [
  ['ayqa4080_20261031114831.xlsx', 'AEA', 'T'],
  ['ayqa4080_20261031114858.xlsx', 'AEB', 'T'],
  ['ayqa4080_20261031114930.xlsx', 'ASA', 'T'],
  ['ayqa4080_20261031114947.xlsx', 'ASB', 'T'],
  ['ayqa4080_20261031115002.xlsx', 'ASS', 'DI'],
  ['ayqa4080_20261031115020.xlsx', 'BSS', 'EE']
]) {
  const file = fixturePath('plusError',filename);
  const entries = parsePlusErrorExcel(file);
  const book = xlsx.readFile(file);
  const sheet = book.Sheets[book.SheetNames[0]];
  assert.ok(entries.length > 0);
  assert.equal(entries[0].processType, type);
  assert.equal(entries[0].totalNgQty, sheet.R5.v);
  assert.equal(entries[0].ngRate, sheet.S5.v);
  for (let index = 0; index < 10; index++) {
    const address = xlsx.utils.encode_col(xlsx.utils.decode_col(firstColumn) + index) + '5';
    assert.equal(entries[0][`d${index + 1}` as 'd1'], sheet[address]?.v || 0);
  }
  console.log(`${filename}: ${type} ${entries.length} rows verified`);
}

// A different upstream header must work through config alone, preserving identifiers.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cvr-mapping-'));
const tempFile = path.join(tempDir, 'verify.csv');
const originalColumn = config.mappings.totalSheetVrf.sourceColumn!;
const originalRequired = [...config.wcsRequiredColumns];
try {
  config.mappings.totalSheetVrf.sourceColumn = 'Input sheets';
  config.wcsRequiredColumns = originalRequired.map(column => column === originalColumn ? 'Input sheets' : column);
  const values: Record<string, string> = {
    'Mã item': '000123', 'Số lot': '00001', 'Công đoạn số': '0070',
    'Input sheets': '1,234', 'Số hàng NG': '12',
    'Ngày tháng': '2026-10-31', 'Ca': 'Day'
  };
  const headers = config.wcsRequiredColumns;
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  fs.writeFileSync(tempFile, '\uFEFF' + headers.map(quote).join(',') + '\n' +
    headers.map(column => quote(values[column] || '')).join(','));
  const [record] = parseCvrWcsCsv(tempFile);
  assert.equal(record.totalSheetVrf, 1234);
  assert.equal(record.wcsNgQty, 12);
  assert.equal(record.itemCode, '000123');
  assert.equal(record.lotNo, '00001');
  assert.equal(record.seqNo, '0070');
  fs.writeFileSync(tempFile, 'Mã item,Số lot\n000123,00001');
  assert.throws(() => parseCvrWcsCsv(tempFile), /thiếu các cột bắt buộc/);
} finally {
  config.mappings.totalSheetVrf.sourceColumn = originalColumn;
  config.wcsRequiredColumns = originalRequired;
  fs.unlinkSync(tempFile);
  fs.rmdirSync(tempDir);
}
console.log('CVR mapping tests passed: samples, configurable header, BOM, numbers, identifiers, required columns');
