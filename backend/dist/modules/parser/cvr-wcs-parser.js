"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CVR_WCS_REQUIRED_COLUMNS = void 0;
exports.parseCvrWcsCsv = parseCvrWcsCsv;
exports.parseCvrWcsRow = parseCvrWcsRow;
const fs_1 = __importDefault(require("fs"));
const configuration_provider_js_1 = require("../../config/configuration-provider.js");
const app_error_js_1 = require("../../errors/app-error.js");
const csv_parser_js_1 = require("./csv-parser.js");
exports.CVR_WCS_REQUIRED_COLUMNS = configuration_provider_js_1.configurationProvider.getCvrDataMapping().wcsRequiredColumns;
function parseCvrWcsCsv(filePath) {
    if (!fs_1.default.existsSync(filePath)) {
        throw new app_error_js_1.FileProcessingError(`File CSV WCS CVR không tồn tại: ${filePath}`);
    }
    const rawContent = fs_1.default.readFileSync(filePath, 'utf8');
    const content = rawContent.charCodeAt(0) === 0xFEFF ? rawContent.slice(1) : rawContent;
    const rows = (0, csv_parser_js_1.parseCsvRows)(content);
    if (rows.length === 0) {
        throw new app_error_js_1.FileProcessingError(`File CSV rỗng: ${filePath}`);
    }
    const headers = rows[0].map(h => h.trim());
    // Check required columns
    const missing = configuration_provider_js_1.configurationProvider.getCvrDataMapping().wcsRequiredColumns.filter(col => !headers.includes(col));
    if (missing.length > 0) {
        throw new app_error_js_1.FileProcessingError(`File CSV thiếu các cột bắt buộc: [${missing.join(', ')}]`, {
            missingColumns: missing,
            foundColumnsCount: headers.length
        });
    }
    const records = [];
    for (const vals of rows.slice(1)) {
        const rowObj = {};
        headers.forEach((header, index) => { rowObj[header] = vals[index]?.trim() || ''; });
        const record = parseCvrWcsRow(rowObj);
        if (record.itemCode && record.lotNo)
            records.push(record);
    }
    return records;
}
function parseCvrWcsRow(rowObj) {
    const mappings = configuration_provider_js_1.configurationProvider.getCvrDataMapping().mappings;
    const value = (key) => (rowObj[mappings[key].sourceColumn] || '').trim();
    const parseNum = (value) => {
        if (!value)
            return 0;
        const number = Number(value.replace(/,/g, ''));
        if (!Number.isFinite(number))
            throw new app_error_js_1.FileProcessingError('Giá trị số CVR không hợp lệ: ' + value);
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
