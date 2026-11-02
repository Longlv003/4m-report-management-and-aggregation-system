"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseItemMappingText = parseItemMappingText;
const xlsx_1 = __importDefault(require("xlsx"));
const mapping_input_js_1 = require("../../application/mapping-input.js");
const app_error_js_1 = require("../../errors/app-error.js");
/** Read Excel-pasted TSV, including tabs/newlines inside quoted cells. */
function parseItemMappingText(text) {
    const workbook = xlsx_1.default.read(text, { type: 'string', raw: true, FS: '\t' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const headers = xlsx_1.default.utils.sheet_to_json(sheet, { header: 1 })[0];
    if (!headers || !['Item name', 'Seq no', 'PT/1SH'].every(header => headers.includes(header))) {
        throw new app_error_js_1.ValidationError('Dữ liệu mapping phải có Item name, Seq no, PT/1SH');
    }
    return xlsx_1.default.utils.sheet_to_json(sheet, { defval: '' }).map((row, index) => {
        try {
            return (0, mapping_input_js_1.mappingInput)({ itemName: row['Item name'], seqNo: String(row['Seq no']),
                pcsPerSheet: String(row['PT/1SH']).trim() ? row['PT/1SH'] : null,
                process: String(row['CÔNG ĐOẠN'] ?? ''), build: String(row.BUILD ?? ''), model: String(row.MODEL ?? '') });
        }
        catch (error) {
            throw new app_error_js_1.ValidationError(`Mapping dòng ${index + 2}: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
}
