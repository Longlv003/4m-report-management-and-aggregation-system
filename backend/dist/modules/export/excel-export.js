"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportScan4mToResponse = exportScan4mToResponse;
const exceljs_1 = __importDefault(require("exceljs"));
const configuration_provider_js_1 = require("../../config/configuration-provider.js");
const connection_js_1 = require("../../database/connection.js");
const crypto_1 = __importDefault(require("crypto"));
async function exportScan4mToResponse(records, res, userId, userIp) {
    const schema = configuration_provider_js_1.configurationProvider.getOutputSchema();
    const workbook = new exceljs_1.default.Workbook();
    workbook.creator = 'Scan 4M System';
    workbook.lastModifiedBy = 'Scan 4M System';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet(schema.sheetName || 'Form Scan', {
        views: [{ state: 'frozen', ySplit: 1 }]
    });
    // Setup columns
    worksheet.columns = schema.columns.map(c => ({
        header: c.header,
        key: c.key,
        width: c.width || 15
    }));
    // Style Header Row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell(cell => {
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1E40AF' } // Deep Blue
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'medium' },
            right: { style: 'thin' }
        };
    });
    // Populate data rows
    records.forEach((row, idx) => {
        const rowValues = {};
        schema.columns.forEach(c => {
            let val = row[c.key];
            // Map database column names if needed
            if (val === undefined) {
                // camelCase to snake_case fallback
                const snakeKey = c.key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                val = row[snakeKey];
            }
            rowValues[c.key] = val !== null && val !== undefined ? val : '';
        });
        const addedRow = worksheet.addRow(rowValues);
        addedRow.height = 24;
        // Apply formatting to cells
        addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.font = { name: 'Segoe UI', size: 9 };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
            const colDef = schema.columns[colNumber - 1];
            if (colDef) {
                // Enforce Text format for Item code, Lot no, Seq no to preserve leading zeroes
                if (colDef.format === '@' || ['itemCode', 'lotNo', 'seqNo'].includes(colDef.key)) {
                    cell.numFmt = '@';
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                }
                else if (colDef.key === 'op') {
                    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
                }
                else if (typeof cell.value === 'number') {
                    cell.alignment = { vertical: 'middle', horizontal: 'right' };
                }
                else {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                }
            }
            // Alternate row banding
            if (idx % 2 === 1) {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF8FAFC' }
                };
            }
        });
    });
    // Set HTTP headers for direct download
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const fileName = `Scan_4M_Export_${timestamp}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
    // Audit log
    try {
        const db = (0, connection_js_1.getDb)();
        await db.execute({
            sql: `INSERT INTO audit_logs (id, account_id, action, resource, details, ip_address, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?);`,
            args: [
                `audit-${crypto_1.default.randomUUID()}`,
                userId,
                'EXPORT_EXCEL',
                'scan4m_records',
                JSON.stringify({ rowCount: records.length, fileName }),
                userIp || null,
                new Date().toISOString()
            ]
        });
    }
    catch (err) {
        console.error('[AUDIT_LOG_FAIL]', err);
    }
}
