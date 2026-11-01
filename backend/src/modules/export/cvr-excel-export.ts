import ExcelJS from 'exceljs';
import { Response } from 'express';
import { configurationProvider } from '../../config/configuration-provider.js';



export async function exportCvr4mToResponse(
  records: Array<Record<string, unknown>>,
  res: Response,
  userId: string,
  userIp?: string
): Promise<void> {
  const schema = configurationProvider.getCvrOutputSchema();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '4M Report Management System - CVR';
  workbook.lastModifiedBy = '4M Report Management System - CVR';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(schema.sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  worksheet.columns = schema.columns.map(c => ({
    header: c.header,
    key: c.key,
    width: c.width
  }));

  // Style Header Row
  const headerRow = worksheet.getRow(1);
  headerRow.height = 32;
  headerRow.eachCell(cell => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0D9488' } // Teal-600
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
      if (val === undefined) {
        const camelKey = c.key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        val = row[camelKey];
      }
      rowValues[c.key] = val !== null && val !== undefined ? val : '';
    });

    const excelRow = worksheet.addRow(rowValues);
    for (const column of schema.columns) {
      if (column.format) excelRow.getCell(column.key).numFmt = column.format;
    }
    excelRow.height = 22;

    const isEven = idx % 2 === 0;
    excelRow.eachCell(cell => {
      cell.font = { name: 'Segoe UI', size: 9 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
      };
      if (isEven) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }
        };
      }
    });
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `CVR_4M_Report_${timestamp}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  await workbook.xlsx.write(res);
  res.end();
}
