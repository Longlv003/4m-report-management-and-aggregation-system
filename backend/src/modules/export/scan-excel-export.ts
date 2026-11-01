import ExcelJS from 'exceljs';
import { Response } from 'express';
import { configurationProvider } from '../../config/configuration-provider.js';

export async function exportScan4mToResponse(
  records: Array<Record<string, unknown>>,
  res: Response,
  userId: string,
  userIp?: string
): Promise<void> {
  const schema = configurationProvider.getOutputSchema();
  const workbook = new ExcelJS.Workbook();
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
    const rowValues: Record<string, unknown> = {};
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
        } else if (colDef.key === 'op') {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        } else if (typeof cell.value === 'number') {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else {
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

}
