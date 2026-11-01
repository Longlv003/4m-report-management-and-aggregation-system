"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.excelSerialToIsoDate = excelSerialToIsoDate;
exports.parsePlusExcel = parsePlusExcel;
const fs_1 = __importDefault(require("fs"));
const xlsx_1 = __importDefault(require("xlsx"));
const app_error_js_1 = require("../../errors/app-error.js");
function excelSerialToIsoDate(serial) {
    if (typeof serial === 'string') {
        // If it's already a date string (YYYY-MM-DD HH:mm:ss)
        if (/^\d{4}-\d{2}-\d{2}/.test(serial)) {
            return serial;
        }
        const num = parseFloat(serial);
        if (!isNaN(num))
            serial = num;
    }
    if (typeof serial === 'number') {
        const parsed = xlsx_1.default.SSF.parse_date_code(serial);
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
function parsePlusExcel(filePath, sheetName = 'Sheet0', headerRow = 0) {
    if (!fs_1.default.existsSync(filePath)) {
        throw new app_error_js_1.FileProcessingError(`Excel file does not exist: ${filePath}`);
    }
    const workbook = xlsx_1.default.readFile(filePath, { cellDates: false });
    const sheet = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
        throw new app_error_js_1.FileProcessingError(`Sheet "${sheetName}" not found in Excel file: ${filePath}`);
    }
    const rawRows = xlsx_1.default.utils.sheet_to_json(sheet, { range: headerRow });
    // Use a Map so duplicate keys within the same file are silently overridden by the latest row
    const recordMap = new Map();
    for (const row of rawRows) {
        const itemCode = String(row['Item Code Of Product'] || '').trim();
        const batchNo = String(row['Batch No'] || '').trim();
        const seqNo = String(row['Seq No.'] || '').trim();
        // Skip empty or invalid lines
        if (!itemCode || !batchNo || !seqNo)
            continue;
        const matchKey = `${itemCode}_${batchNo}_${seqNo}`;
        const workStart = excelSerialToIsoDate(row['Work Start']);
        const workResult = excelSerialToIsoDate(row['Work Result']);
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
