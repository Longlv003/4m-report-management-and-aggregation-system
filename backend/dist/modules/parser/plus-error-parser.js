"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePlusErrorExcel = parsePlusErrorExcel;
const xlsx_1 = __importDefault(require("xlsx"));
const fs_1 = __importDefault(require("fs"));
const app_error_js_1 = require("../../errors/app-error.js");
const configuration_provider_js_1 = require("../../config/configuration-provider.js");
function parsePlusErrorExcel(filePath) {
    if (!fs_1.default.existsSync(filePath)) {
        throw new app_error_js_1.FileProcessingError(`File Excel lỗi không tồn tại: ${filePath}`);
    }
    const config = configuration_provider_js_1.configurationProvider.getCvrDataMapping();
    const importConfig = config.plusErrorImport;
    const workbook = xlsx_1.default.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet)
        throw new app_error_js_1.FileProcessingError(`Sheet không hợp lệ trong file: ${filePath}`);
    const rows = xlsx_1.default.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const codeHeaders = (rows[importConfig.codeHeaderRow - 1] || []).map(value => String(value).trim());
    const fields = ['discoloration', 'fm', 'copperResidue', 'brokenHole', 'bvhShift',
        'missingHole', 'extraHole', 'dfrSeepage', 'other', 'dfrRemain'];
    const groups = importConfig.processTypes.flatMap(processType => {
        // Shadow codes can appear at DI:DR / EE:EN, after unrelated PF/PS codes.
        if (!codeHeaders.some(code => new RegExp(`^${processType}\\d+$`).test(code)))
            return [];
        const side = processType === 'BSS' || processType.endsWith('B') ? 'B' : 'A';
        const columns = fields.map(field => {
            const entry = config.mappings[field + side];
            const code = entry.sourceColumn.replace('{processType}', processType);
            const index = codeHeaders.indexOf(code);
            if (index < 0)
                throw new app_error_js_1.FileProcessingError(`Thiếu mã lỗi ${code} trong file: ${filePath}`);
            return { index, key: entry.storageColumn };
        });
        return [{ processType, columns }];
    });
    if (groups.length === 0)
        throw new app_error_js_1.FileProcessingError(`Không tìm thấy nhóm mã lỗi CVR trong file: ${filePath}`);
    const cell = (row, field) => row[xlsx_1.default.utils.decode_col(importConfig.columns[field])];
    const parseNum = (value) => {
        if (value === undefined || value === null || String(value).trim() === '')
            return 0;
        const number = Number(String(value).replace(/,/g, ''));
        if (!Number.isFinite(number))
            throw new app_error_js_1.FileProcessingError(`Giá trị số không hợp lệ: ${value} trong ${filePath}`);
        return number;
    };
    const entries = [];
    for (const row of rows.slice(importConfig.dataStartRow - 1)) {
        const itemCode = String(cell(row, 'itemCode') || '').trim();
        const batchNo = String(cell(row, 'batchNo') || '').trim();
        if (!itemCode || !batchNo)
            continue;
        for (const group of groups) {
            const defects = {};
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
