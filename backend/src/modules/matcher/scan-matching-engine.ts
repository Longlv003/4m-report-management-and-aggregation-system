import { latestWcsFinishTime } from '../../domain/scan-time.js';
import { configurationProvider } from '../../config/configuration-provider.js';
import { ParsedPlusRecord } from '../parser/excel-parser.js';
import { Client } from '@libsql/client';
import { logger } from '../../logging/logger.js';
import { FileProcessingError } from '../../errors/app-error.js';

export interface Scan4MAggregatedRecord {
  id: string;
  matchKey: string;
  wcsRecordId: string;
  plusRecordId: string | null;
  matchStatus: 'MATCHED' | 'UNMATCHED_PLUS' | 'CONFLICT_DUPLICATE';
  date: string;
  machine: string;
  shift: string;
  startTime: string;
  finishTime: string | null;
  totalTime: string | null;
  itemName: string;
  itemCode: string;
  lotNo: string;
  seqNo: string;
  process: string;
  layer: string;
  programName: string;
  totalSheetIndi: number | null;
  totalSheetScan: number | null;
  op: string;
  outerTopAvgA: number | null;
  cpkOuterTopA: number | null;
  innerBottomAvgA: number | null;
  cpkInnerBottomA: number | null;
  outerTopAvgB: number | null;
  cpkOuterTopB: number | null;
  innerBottomAvgB: number | null;
  cpkInnerBottomB: number | null;
  checkLight: string;
  checkMasterMachine: string;
  checkMasterSample: string;
  expMasterSample: string;
  rollCleaning: string;
  airPressure: number | null;
  anomalyFlag: string | null;
}

export function resolveLayer(programName: string): string {
  const layerConfig = configurationProvider.getLayerRules();
  const upper = programName.toUpperCase();
  for (const r of layerConfig.rules) {
    if (upper.includes(r.pattern.toUpperCase())) {
      return r.targetLayer;
    }
  }
  return layerConfig.defaultLayer;
}

export function formatOp(c1?: string, name1?: string, c2?: string, name2?: string): string {
  const parts: string[] = [];
  const config = configurationProvider.getCalculationRules().calculations.op;
  const p1 = [c1, name1].filter(Boolean).map(s => s?.trim()).filter(Boolean).join(config.innerSeparator);
  if (p1) parts.push(p1);

  const p2 = [c2, name2].filter(Boolean).map(s => s?.trim()).filter(Boolean).join(config.innerSeparator);
  if (p2) parts.push(p2);

  // Join with newline as requested by user
  return parts.join(config.separator);
}

export function calculateTotalTime(startTimeStr?: string, finishTimeStr?: string): { totalTime: string | null; anomalyFlag: string | null } {
  if (!startTimeStr || !finishTimeStr) {
    return { totalTime: null, anomalyFlag: null };
  }

  const startMs = new Date(startTimeStr.replace(' ', 'T')).getTime();
  const finishMs = new Date(finishTimeStr.replace(' ', 'T')).getTime();

  if (isNaN(startMs) || isNaN(finishMs)) {
    return { totalTime: null, anomalyFlag: 'Thời gian không hợp lệ' };
  }

  if (finishMs < startMs) {
    // Finish time (WCS) < Start time (WCS): display N/A with label 'Lệch giờ'
    const handling = configurationProvider.getCalculationRules().calculations.totalTime.anomalyHandling;
    return { totalTime: handling.fallbackValue, anomalyFlag: handling.anomalyFlag };
  }

  // Calculated in integer minutes as requested by user
  const diffMinutes = Math.round((finishMs - startMs) / (1000 * 60));
  return { totalTime: String(diffMinutes), anomalyFlag: null };
}

export function parseNullableFloat(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null;
  const num = parseFloat(String(val).trim());
  return isNaN(num) ? null : num;
}

export function parseNullableInt(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null;
  const num = parseInt(String(val).trim(), 10);
  return isNaN(num) ? null : num;
}

export function aggregateWcsAndPlus(
  id: string,
  wcsRecordId: string,
  wcsRow: Record<string, string>,
  plusRecord?: ParsedPlusRecord | null
): Scan4MAggregatedRecord {
  const itemCode = (wcsRow['Mã item'] || '').trim();
  const lotNo = (wcsRow['Số lot'] || '').trim();
  const seqNo = (wcsRow['Công đoạn số'] || '').trim();
  const matchKey = `${itemCode}_${lotNo}_${seqNo}`;
  const keys: Record<string, string> = { itemCode, lotNo, seqNo };
  const validation = configurationProvider.getValidationRules();
  if (validation.requiredMatchingKeys.some(key => !keys[key])) throw new FileProcessingError('Thiếu khóa ghép dữ liệu Scan');

  const startTime = (wcsRow['Thời gian thao tác'] || '').trim();
  const finishTime = latestWcsFinishTime(wcsRow);

  const { totalTime, anomalyFlag } = calculateTotalTime(startTime, finishTime || undefined);
  const warnings = anomalyFlag ? [anomalyFlag] : [];
  const shift = (wcsRow['Ca'] || '').trim();
  if (shift && !validation.rules.shift.allowedValues.includes(shift)) warnings.push('Ca không hợp lệ');
  const pressure = parseNullableFloat(wcsRow['Áp suất khí đầu vào']);
  if (pressure !== null && (pressure < validation.rules.airPressure.min || pressure > validation.rules.airPressure.max)) warnings.push('Áp suất ngoài giới hạn');
  if (Object.entries(wcsRow).some(([key, value]) => key.includes('Cpk') && value !== '' &&
      parseNullableFloat(value) !== null && Number(value) < validation.rules.cpk.minRecommended)) warnings.push('Cpk dưới mức khuyến nghị');

  const programName = (wcsRow['Tên chương trình'] || '').trim();
  const layer = resolveLayer(programName);

  const opConfig = configurationProvider.getCalculationRules().calculations.op;
  const op = opConfig.fields.map(field => [wcsRow[field.code], wcsRow[field.name]]
    .map(value => (value || '').trim()).filter(Boolean).join(opConfig.innerSeparator))
    .filter(Boolean).join(opConfig.separator);

  return {
    id,
    matchKey,
    wcsRecordId,
    plusRecordId: null, // linked during DB insert
    matchStatus: plusRecord ? 'MATCHED' : 'UNMATCHED_PLUS',
    date: (wcsRow['Ngày tháng'] || '').trim(),
    machine: (wcsRow['Tên thiết bị'] || '').trim(),
    shift: (wcsRow['Ca'] || '').trim(),
    startTime,
    finishTime,
    totalTime,
    itemName: (wcsRow['Tên sản phẩm'] || '').trim(),
    itemCode,
    lotNo,
    seqNo,
    process: (wcsRow['Công đoạn'] || '').trim(),
    layer,
    programName,
    totalSheetIndi: plusRecord?.prodQty ?? null,
    totalSheetScan: parseNullableInt(wcsRow['Số tấm input (Block)']),
    op,
    outerTopAvgA: parseNullableFloat(wcsRow['Lỗ #1_Đường kính Top trung bình_Mặt A']),
    cpkOuterTopA: parseNullableFloat(wcsRow['Lỗ #1_Cpk Top_Mặt A']),
    innerBottomAvgA: parseNullableFloat(wcsRow['Lỗ #1_Đường kính Bottom trung bình_Mặt A']),
    cpkInnerBottomA: parseNullableFloat(wcsRow['Lỗ #1_Cpk Bottom_Mặt A']),
    outerTopAvgB: parseNullableFloat(wcsRow['Lỗ #1_Đường kính Top trung bình_Mặt B']),
    cpkOuterTopB: parseNullableFloat(wcsRow['Lỗ #1_Cpk Top_Mặt B']),
    innerBottomAvgB: parseNullableFloat(wcsRow['Lỗ #1_Đường kính Bottom trung bình_Mặt B']),
    cpkInnerBottomB: parseNullableFloat(wcsRow['Lỗ #1_Cpk Bottom_Mặt B']),
    checkLight: (wcsRow['Kiểm tra đèn sáng'] || 'NA').trim(),
    checkMasterMachine: (wcsRow['Kiểm tra máy bằng Master sample'] || 'NA').trim(),
    checkMasterSample: (wcsRow['Kiểm tra master sample'] || 'NA').trim(),
    expMasterSample: (wcsRow['Hạn sử dụng mẫu Master sample'] || 'NA').trim(),
    rollCleaning: (wcsRow['Bóc roll làm sạch'] || 'NA').trim(),
    airPressure: parseNullableFloat(wcsRow['Áp suất khí đầu vào']),
    anomalyFlag: warnings.join('; ') || null
  };
}

export async function rematchScanRecords(db: Pick<Client, 'execute'>): Promise<{ rematchedCount: number }> {
  logger.info('Refreshing Scan records from current Plus data...', { module: 'RematchEngine' });

  // WCS owns timestamps; Plus only refreshes matching and production quantities.
  const unmatched = await db.execute(`
    SELECT s.id, s.match_key, s.start_time, s.anomaly_flag, w.finish_time
    FROM scan4m_records s LEFT JOIN wcs_records w ON w.id = s.wcs_record_id;
  `);

  let rematchedCount = 0;
  for (const row of unmatched.rows) {
    const scanId = row.id as string;
    const key = row.match_key as string;
    const startTime = row.start_time as string;

    const finishTime = row.finish_time as string | null;
    const time = calculateTotalTime(startTime, finishTime || undefined);
    const oldWarnings = String(row.anomaly_flag || '').split('; ').filter(Boolean).filter(warning =>
      !['Lệch giờ', 'Thời gian không hợp lệ', configurationProvider.getCalculationRules().calculations.totalTime.anomalyHandling.anomalyFlag].includes(warning));
    const anomalyFlag = [...oldWarnings, ...(time.anomalyFlag ? [time.anomalyFlag] : [])].join('; ') || null;
    await db.execute({
      sql: 'UPDATE scan4m_records SET finish_time = ?, total_time = ?, anomaly_flag = ? WHERE id = ?',
      args: [finishTime, time.totalTime, anomalyFlag, scanId]
    });

    // Check if Plus record is now available
    const plusRes = await db.execute({
      sql: `SELECT id, work_result, prod_qty FROM plus_records WHERE match_key = ? LIMIT 1;`,
      args: [key]
    });

    if (plusRes.rows.length > 0) {
      const p = plusRes.rows[0];
      const prodQty = p.prod_qty as number | null;
      const plusRecordId = p.id as string;
      const now = new Date().toISOString();

      await db.execute({
        sql: `UPDATE scan4m_records 
              SET plus_record_id = ?, total_sheet_indi = ?,
                  anomaly_flag = ?, match_status = 'MATCHED', updated_at = ?
              WHERE id = ?;`,
        args: [plusRecordId, prodQty, anomalyFlag, now, scanId]
      });

      rematchedCount++;
    }
  }

  logger.info(`Rematch completed. Rematched ${rematchedCount} records.`, { module: 'RematchEngine' });
  return { rematchedCount };
}
