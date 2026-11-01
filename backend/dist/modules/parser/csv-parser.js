"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCsvRows = parseCsvRows;
exports.parseCsvLine = parseCsvLine;
exports.parseWcsCsv = parseWcsCsv;
const fs_1 = __importDefault(require("fs"));
const app_error_js_1 = require("../../errors/app-error.js");
const configuration_provider_js_1 = require("../../config/configuration-provider.js");
// A quoted CSV field may contain newlines. Split records only outside quotes.
function parseCsvRows(content) {
    const rows = [];
    let record = '';
    let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '"') {
            record += char;
            if (inQuotes && content[i + 1] === '"')
                record += content[++i];
            else
                inQuotes = !inQuotes;
        }
        else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (record.trim())
                rows.push(parseCsvLine(record));
            record = '';
            if (char === '\r' && content[i + 1] === '\n')
                i++;
        }
        else
            record += char;
    }
    if (inQuotes)
        throw new app_error_js_1.FileProcessingError('CSV có ô được đặt trong dấu ngoặc kép chưa đóng');
    if (record.trim())
        rows.push(parseCsvLine(record));
    return rows;
}
function parseCsvLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
            }
            else {
                inQuotes = !inQuotes;
            }
        }
        else if (c === ',' && !inQuotes) {
            result.push(cur);
            cur = '';
        }
        else {
            cur += c;
        }
    }
    result.push(cur);
    return result;
}
function parseWcsCsv(filePath) {
    if (!fs_1.default.existsSync(filePath)) {
        throw new app_error_js_1.FileProcessingError(`CSV file does not exist: ${filePath}`);
    }
    const rawContent = fs_1.default.readFileSync(filePath, 'utf8');
    // Strip BOM if present
    const content = rawContent.charCodeAt(0) === 0xFEFF ? rawContent.slice(1) : rawContent;
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) {
        throw new app_error_js_1.FileProcessingError(`CSV file is completely empty: ${filePath}`);
    }
    const headers = parseCsvLine(lines[0]).map(h => h.trim());
    // Check required columns from configuration
    const requiredColumns = configuration_provider_js_1.configurationProvider.getDataMapping().wcsRequiredColumns;
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    if (missingColumns.length > 0) {
        throw new app_error_js_1.FileProcessingError(`File CSV thiếu các cột bắt buộc: [${missingColumns.join(', ')}]`, { missingColumns, foundColumnsCount: headers.length });
    }
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const rowObj = {};
        headers.forEach((h, idx) => {
            rowObj[h] = values[idx] !== undefined ? values[idx].trim() : '';
        });
        rows.push(rowObj);
    }
    return { headers, rows };
}
