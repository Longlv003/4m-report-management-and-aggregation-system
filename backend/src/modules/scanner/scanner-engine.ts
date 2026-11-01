import fs from 'fs';
import path from 'path';
import { getDb } from '../../database/connection.js';
import { configurationProvider } from '../../config/configuration-provider.js';
import { pathProvider } from '../../config/path-provider.js';
import { logger } from '../../logging/logger.js';
import { computeFileSha256, isFileStable } from './file-stability.js';
import { parseWcsCsv } from '../parser/csv-parser.js';
import { parsePlusExcel } from '../parser/excel-parser.js';
import { parseCvrWcsCsv } from '../parser/cvr-wcs-parser.js';
import { parsePlusErrorExcel } from '../parser/plus-error-parser.js';
import { aggregateWcsAndPlus, rematchScanRecords, parseNullableFloat, parseNullableInt } from '../matcher/scan-matching-engine.js';
import { CvrMatchingEngine } from '../matcher/cvr-matching-engine.js';
import crypto from 'crypto';
import { Client } from '@libsql/client';
import { withWriteTransaction } from '../../database/transaction.js';
import { FileProcessingError } from '../../errors/app-error.js';
import { sseManager } from '../realtime/sse-manager.js';

export class ScannerEngine {
  constructor(private readonly database: () => Client = getDb) {}

  private isScanning = false;
  private intervalId: NodeJS.Timeout | null = null;

  public async scanOnce(): Promise<{ filesProcessed: number; errors: number; skipped?: boolean }> {
    if (this.isScanning) {
      logger.info('Scan cycle already in progress, skipping...', { module: 'ScannerEngine' });
      return { filesProcessed: 0, errors: 0, skipped: true };
    }

    this.isScanning = true;
    let filesProcessed = 0;
    let errors = 0;
    let removedFiles = 0;

    try {
      const db = this.database();
      const sourceConfig = configurationProvider.getSourceFiles();

      for (const [sourceKey, source] of Object.entries(sourceConfig.sources)) {
        if (!source.enabled) continue;

        const subDir = source.subDirectory || sourceKey;
        const targetDir = await pathProvider.resolveInputDirectory(subDir, source.directory);

        if (!fs.existsSync(targetDir)) {
          logger.warn(`Source directory does not exist: ${targetDir}`, { module: 'ScannerEngine', sourceKey });
          continue;
        }

        const pattern = new RegExp(source.pattern, 'i');
        // Explicit guard: Scan 4M sources strictly ignore Verify files (which belong to CVR dashboard)
        const files = fs.readdirSync(targetDir).filter(f => {
          if (sourceKey === 'wcsScan' && f.toLowerCase().includes('verify')) return false;
          return pattern.test(f);
        });

        let cursor = 0;
        const config = configurationProvider.getScannerConfig().scanner;
        const worker = async () => {
          while (cursor < files.length) {
            const fileName = files[cursor++];
            const filePath = path.join(targetDir, fileName);
            for (let attempt = 0; ; attempt++) {
              try {
                if (await this.processFile(db, sourceKey, source.type, filePath, fileName)) filesProcessed++;
                break;
              } catch (err) {
                if (!(err instanceof FileProcessingError) && attempt < config.retryAttempts) {
                  await new Promise(resolve => setTimeout(resolve, config.retryDelayMs));
                  continue;
                }
                errors++;
                logger.error('Error processing file ' + fileName, { module: 'ScannerEngine', error: String(err) });
                break;
              }
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(config.maxConcurrentFiles, files.length) }, worker));
      }

      // Cleanup: mark FAILED files as REMOVED if they no longer exist on disk
      removedFiles = await withWriteTransaction(tx => this.cleanupRemovedFailedFiles(tx), db);

    } finally {
      this.isScanning = false;
    }

    if (filesProcessed > 0 || errors > 0 || removedFiles > 0) {
      sseManager.broadcast({ event: 'data_imported', data: { timestamp: new Date().toISOString(), filesProcessed, errors } });
    }
    return { filesProcessed, errors };
  }

  /**
   * Check all source_files with status='FAILED' — if the file no longer exists on disk,
   * mark it as 'REMOVED' so the dashboard stat drops to 0 once the bad file is cleaned up.
   */
  private async cleanupRemovedFailedFiles(db: Pick<Client, 'execute'>): Promise<number> {
    const failedFiles = await db.execute(
      `SELECT id, file_path, file_name FROM source_files WHERE status = 'FAILED';`
    );

    let removed = 0;
    for (const row of failedFiles.rows) {
      const filePath = row.file_path as string;
      if (!fs.existsSync(filePath)) {
        await db.execute({
          sql: `UPDATE source_files SET status = 'REMOVED', processed_at = ? WHERE id = ?;`,
          args: [new Date().toISOString(), row.id]
        });
        removed++;
        logger.info(`Failed file no longer on disk, marked REMOVED: ${row.file_name}`, {
          module: 'ScannerEngine',
          filePath
        });
      }
    }
    return removed;
  }


  public async processFile(
    db: Client, sourceKey: string, sourceType: 'CSV' | 'EXCEL', filePath: string, fileName: string
  ): Promise<boolean> {
    const config = configurationProvider.getScannerConfig().scanner;
    if (!await isFileStable(filePath, config.stabilityCheckMs, config.stabilityChecks)) return false;
    const sha256 = await computeFileSha256(filePath);
    const stat = fs.statSync(filePath);
    let fileId = 'file-' + crypto.randomUUID();
    try {
      return await withWriteTransaction(async tx => {
        const existing = await tx.execute({ sql: 'SELECT id, status FROM source_files WHERE sha256 = ?', args: [sha256] });
        if (existing.rows[0]?.status === 'SUCCESS') return false;
        fileId = String(existing.rows[0]?.id || fileId);
        await tx.execute({
          sql: `INSERT INTO source_files (id,file_path,file_name,file_type,source_system,file_size,sha256,detected_at,status)
                VALUES (?,?,?,?,?,?,?,?, 'PROCESSING') ON CONFLICT(sha256) DO UPDATE SET
                file_path=excluded.file_path,file_name=excluded.file_name,status='PROCESSING',error_message=NULL`,
          args: [fileId,filePath,fileName,sourceType,sourceKey,stat.size,sha256,new Date().toISOString()]
        });
        if (sourceKey === 'wcsCvr') await this.importWcsCvrCsv(tx, fileId, filePath, fileName);
        else if (sourceKey === 'plusError') await this.importPlusErrorExcel(tx, fileId, filePath, fileName);
        else if (sourceType === 'CSV') await this.importWcsCsv(tx, fileId, filePath, fileName);
        else await this.importPlusExcel(tx, fileId, filePath, fileName);
        await tx.execute({ sql: "UPDATE source_files SET status='SUCCESS',error_message=NULL,processed_at=? WHERE id=?",
          args: [new Date().toISOString(),fileId] });
        return true;
      }, db);
    } catch (error) {
      // The data transaction rolled back. Persist only failure metadata for the dashboard/retry.
      await withWriteTransaction(async tx => {
        await tx.execute({
          sql: `INSERT INTO source_files (id,file_path,file_name,file_type,source_system,file_size,sha256,detected_at,status,error_message,processed_at)
                VALUES (?,?,?,?,?,?,?,?,'FAILED',?,?) ON CONFLICT(sha256) DO UPDATE SET
                status='FAILED',error_message=excluded.error_message,processed_at=excluded.processed_at`,
          args: [fileId,filePath,fileName,sourceType,sourceKey,stat.size,sha256,new Date().toISOString(),
            error instanceof Error ? error.message : String(error),new Date().toISOString()]
        });
      }, db);
      throw error;
    }
  }

  private async importWcsCsv(db: Pick<Client, 'execute'>, fileId: string, filePath: string, fileName: string): Promise<void> {
    const { rows } = parseWcsCsv(filePath);
    logger.info(`Parsed ${rows.length} rows from CSV ${fileName}`, { module: 'ScannerEngine' });

    let successCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const r of rows) {
      const itemCode = (r['Mã item'] || '').trim();
      const lotNo = (r['Số lot'] || '').trim();
      const seqNo = (r['Công đoạn số'] || '').trim();
      const matchKey = `${itemCode}_${lotNo}_${seqNo}`;
      const now = new Date().toISOString();

      // --- Check if WCS row already exists in scan4m_records ---
      const existingWcs = await db.execute({
        sql: `SELECT start_time, machine, shift, program_name, total_sheet_scan, op, air_pressure
              FROM scan4m_records WHERE match_key = ? LIMIT 1;`,
        args: [matchKey]
      });

      const newStartTime = (r['Thời gian thao tác'] || '').trim();
      const newMachine = (r['Tên thiết bị'] || '').trim();
      const newShift = (r['Ca'] || '').trim();
      const newProgram = (r['Tên chương trình'] || '').trim();
      const newInputSheet = parseNullableInt(r['Số tấm input (Block)']);
      const newOp = [r['Người thao tác C'], r['Tên người thao tác'], r['Người thao tác C2'], r['Tên người thao tác2']]
        .map(v => (v || '').trim()).join('|');
      const newAirPressure = parseNullableFloat(r['Áp suất khí đầu vào']);

      if (existingWcs.rows.length > 0) {
        const e = existingWcs.rows[0];
        const existOp = String(e.op || '').replace('\n', '|').replace('\n', '|'); // normalize for compare

        const changed =
          e.start_time !== newStartTime ||
          e.machine !== newMachine ||
          e.shift !== newShift ||
          e.program_name !== newProgram ||
          Number(e.total_sheet_scan) !== newInputSheet ||
          existOp.replace(/\n/g, '|') !== newOp ||
          Number(e.air_pressure) !== (newAirPressure ?? 0);

        if (!changed) {
          // Identical WCS data — skip silently
          skippedCount++;
          continue;
        }

        // Data differs — log change for admin before updating
        logger.warn(`WCS record changed: match_key=${matchKey} | file=${fileName}`, {
          module: 'ScannerEngine',
          matchKey,
          before: {
            start_time: e.start_time, machine: e.machine, shift: e.shift,
            program_name: e.program_name, total_sheet_scan: e.total_sheet_scan
          },
          after: {
            start_time: newStartTime, machine: newMachine, shift: newShift,
            program_name: newProgram, total_sheet_scan: newInputSheet
          }
        });
        updatedCount++;
      }

      // Insert new wcs_records row (raw log of this file's data)
      const wcsRecordId = `wcs-${crypto.randomUUID()}`;
      await db.execute({
        sql: `INSERT INTO wcs_records (
          id, file_id, match_key, item_code, batch_no, seq_no, op_date, shift,
          start_time, machine_name, product_name, process_name, program_name,
          input_sheet, op_c1, op_name1, op_c2, op_name2, outer_top_avg_a,
          cpk_outer_top_a, inner_bottom_avg_a, cpk_inner_bottom_a, outer_top_avg_b,
          cpk_outer_top_b, inner_bottom_avg_b, cpk_inner_bottom_b, check_light,
          check_master_machine, check_master_sample, exp_master_sample, roll_cleaning,
          air_pressure, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?
        );`,
        args: [
          wcsRecordId, fileId, matchKey, itemCode, lotNo, seqNo, r['Ngày tháng'] || null, r['Ca'] || null,
          r['Thời gian thao tác'], r['Tên thiết bị'] || null, r['Tên sản phẩm'] || null, r['Công đoạn'] || null, r['Tên chương trình'] || null,
          parseNullableInt(r['Số tấm input (Block)']), r['Người thao tác C'] || null, r['Tên người thao tác'] || null,
          r['Người thao tác C2'] || null, r['Tên người thao tác2'] || null,
          parseNullableFloat(r['Lỗ #1_Đường kính Top trung bình_Mặt A']),
          parseNullableFloat(r['Lỗ #1_Cpk Top_Mặt A']),
          parseNullableFloat(r['Lỗ #1_Đường kính Bottom trung bình_Mặt A']),
          parseNullableFloat(r['Lỗ #1_Cpk Bottom_Mặt A']),
          parseNullableFloat(r['Lỗ #1_Đường kính Top trung bình_Mặt B']),
          parseNullableFloat(r['Lỗ #1_Cpk Top_Mặt B']),
          parseNullableFloat(r['Lỗ #1_Đường kính Bottom trung bình_Mặt B']),
          parseNullableFloat(r['Lỗ #1_Cpk Bottom_Mặt B']),
          r['Kiểm tra đèn sáng'] || 'NA',
          r['Kiểm tra máy bằng Master sample'] || 'NA',
          r['Kiểm tra master sample'] || 'NA',
          r['Hạn sử dụng mẫu Master sample'] || 'NA',
          r['Bóc roll làm sạch'] || 'NA',
          parseNullableFloat(r['Áp suất khí đầu vào']),
          now
        ]
      });

      // Try matching with Plus
      const plusRes = await db.execute({
        sql: `SELECT * FROM plus_records WHERE match_key = ? LIMIT 1;`,
        args: [matchKey]
      });

      let plusRecord: any = null;
      if (plusRes.rows.length > 0) {
        const p = plusRes.rows[0];
        plusRecord = {
          itemCode: p.item_code as string,
          batchNo: p.batch_no as string,
          seqNo: p.seq_no as string,
          matchKey: p.match_key as string,
          workStart: p.work_start as string,
          workResult: p.work_result as string,
          prodQty: p.prod_qty as number | null,
          acceptedQty: p.accepted_qty as number | null,
          badQty: p.bad_qty as number | null,
          picCode: p.pic_code as string,
          picName: p.pic_name as string
        };
      }

      const scanId = `scan-${crypto.randomUUID()}`;
      const aggregated = aggregateWcsAndPlus(scanId, wcsRecordId, r, plusRecord);
      aggregated.plusRecordId = plusRes.rows[0]?.id as string || null;

      // Upsert into scan4m_records by match_key
      await db.execute({
        sql: `INSERT INTO scan4m_records (
          id, match_key, wcs_record_id, plus_record_id, match_status, date, machine,
          shift, start_time, finish_time, total_time, item_name, item_code,
          lot_no, seq_no, process, layer, program_name, total_sheet_indi,
          total_sheet_scan, op, outer_top_avg_a, cpk_outer_top_a, inner_bottom_avg_a,
          cpk_inner_bottom_a, outer_top_avg_b, cpk_outer_top_b, inner_bottom_avg_b,
          cpk_inner_bottom_b, check_light, check_master_machine, check_master_sample,
          exp_master_sample, roll_cleaning, air_pressure, anomaly_flag, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(match_key) DO UPDATE SET
          wcs_record_id = excluded.wcs_record_id,
          plus_record_id = COALESCE(excluded.plus_record_id, scan4m_records.plus_record_id),
          match_status = excluded.match_status,
          date = excluded.date,
          machine = excluded.machine,
          shift = excluded.shift,
          start_time = excluded.start_time,
          finish_time = COALESCE(excluded.finish_time, scan4m_records.finish_time),
          total_time = COALESCE(excluded.total_time, scan4m_records.total_time),
          item_name = excluded.item_name,
          process = excluded.process,
          layer = excluded.layer,
          program_name = excluded.program_name,
          total_sheet_indi = COALESCE(excluded.total_sheet_indi, scan4m_records.total_sheet_indi),
          total_sheet_scan = excluded.total_sheet_scan,
          op = excluded.op,
          outer_top_avg_a = excluded.outer_top_avg_a,
          cpk_outer_top_a = excluded.cpk_outer_top_a,
          inner_bottom_avg_a = excluded.inner_bottom_avg_a,
          cpk_inner_bottom_a = excluded.cpk_inner_bottom_a,
          outer_top_avg_b = excluded.outer_top_avg_b,
          cpk_outer_top_b = excluded.cpk_outer_top_b,
          inner_bottom_avg_b = excluded.inner_bottom_avg_b,
          cpk_inner_bottom_b = excluded.cpk_inner_bottom_b,
          check_light = excluded.check_light,
          check_master_machine = excluded.check_master_machine,
          check_master_sample = excluded.check_master_sample,
          exp_master_sample = excluded.exp_master_sample,
          roll_cleaning = excluded.roll_cleaning,
          air_pressure = excluded.air_pressure,
          anomaly_flag = excluded.anomaly_flag,
          updated_at = excluded.updated_at;`,
        args: [
          aggregated.id, aggregated.matchKey, aggregated.wcsRecordId, aggregated.plusRecordId,
          aggregated.matchStatus, aggregated.date, aggregated.machine, aggregated.shift,
          aggregated.startTime, aggregated.finishTime, aggregated.totalTime, aggregated.itemName,
          aggregated.itemCode, aggregated.lotNo, aggregated.seqNo, aggregated.process,
          aggregated.layer, aggregated.programName, aggregated.totalSheetIndi, aggregated.totalSheetScan,
          aggregated.op, aggregated.outerTopAvgA, aggregated.cpkOuterTopA, aggregated.innerBottomAvgA,
          aggregated.cpkInnerBottomA, aggregated.outerTopAvgB, aggregated.cpkOuterTopB,
          aggregated.innerBottomAvgB, aggregated.cpkInnerBottomB, aggregated.checkLight,
          aggregated.checkMasterMachine, aggregated.checkMasterSample, aggregated.expMasterSample,
          aggregated.rollCleaning, aggregated.airPressure, aggregated.anomalyFlag, now, now
        ]
      });

      if (!plusRecord) {
        errorCount++;
      } else {
        successCount++;
      }
    }

    logger.info(
      `WCS import done: ${successCount} matched, ${errorCount} unmatched, ${skippedCount} skipped (no change), ${updatedCount} updated | file=${fileName}`,
      { module: 'ScannerEngine' }
    );

    await db.execute({
      sql: `UPDATE source_files SET record_count = ?, success_count = ?, error_count = ? WHERE id = ?;`,
      args: [rows.length, successCount, errorCount, fileId]
    });
  }

  private async importPlusExcel(db: Pick<Client, 'execute'>, fileId: string, filePath: string, fileName: string): Promise<void> {
    const source = configurationProvider.getSourceFiles().sources.plusExcel;
    const { records } = parsePlusExcel(filePath, source.sheetName, source.headerRow);
    logger.info(`Parsed ${records.length} records from Excel ${fileName}`, { module: 'ScannerEngine' });

    let successCount = 0;
    let updatedCount = 0;
    const now = new Date().toISOString();

    for (const p of records) {
      // Check if this Plus record already exists in DB
      const existing = await db.execute({
        sql: `SELECT work_start, work_result, prod_qty, accepted_qty, bad_qty, pic_code, pic_name
              FROM plus_records WHERE match_key = ? LIMIT 1;`,
        args: [p.matchKey]
      });

      if (existing.rows.length > 0) {
        const e = existing.rows[0];
        // Compare key fields to detect any real data change
        const changed =
          e.work_start !== p.workStart ||
          e.work_result !== p.workResult ||
          e.prod_qty !== p.prodQty ||
          e.accepted_qty !== p.acceptedQty ||
          e.bad_qty !== p.badQty ||
          e.pic_code !== p.picCode ||
          e.pic_name !== p.picName;

        if (!changed) {
          // Identical data - no update needed, skip silently
          successCount++;
          continue;
        }

        // Data differs - log the change for admin, then update
        logger.warn(`Plus record updated: match_key=${p.matchKey} | file=${fileName}`, {
          module: 'ScannerEngine',
          matchKey: p.matchKey,
          before: {
            work_start: e.work_start, work_result: e.work_result,
            prod_qty: e.prod_qty, accepted_qty: e.accepted_qty, bad_qty: e.bad_qty
          },
          after: {
            work_start: p.workStart, work_result: p.workResult,
            prod_qty: p.prodQty, accepted_qty: p.acceptedQty, bad_qty: p.badQty
          }
        });
        updatedCount++;
      }

      const plusRecordId = `plus-${crypto.randomUUID()}`;
      await db.execute({
        sql: `INSERT INTO plus_records (
          id, file_id, match_key, item_code, batch_no, seq_no, work_start, work_result,
          prod_qty, accepted_qty, bad_qty, pic_code, pic_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(match_key) DO UPDATE SET file_id=excluded.file_id,
          work_start=excluded.work_start,work_result=excluded.work_result,prod_qty=excluded.prod_qty,
          accepted_qty=excluded.accepted_qty,bad_qty=excluded.bad_qty,pic_code=excluded.pic_code,
          pic_name=excluded.pic_name,created_at=excluded.created_at;`,
        args: [
          plusRecordId, fileId, p.matchKey, p.itemCode, p.batchNo, p.seqNo, p.workStart,
          p.workResult, p.prodQty, p.acceptedQty, p.badQty, p.picCode, p.picName, now
        ]
      });
      successCount++;
    }

    // Refresh all derived records after a Plus export, including previous matches.
    const { rematchedCount } = await rematchScanRecords(db);
    const { rematchedCount: rematchedCvr } = await new CvrMatchingEngine(() => db).rematchCvrRecords();
    logger.info(
      `Plus import done: ${successCount} ok, ${updatedCount} updated, ${rematchedCount} Scan rematched, ${rematchedCvr} CVR rematched | file=${fileName}`,
      { module: 'ScannerEngine' }
    );

    await db.execute({
      sql: `UPDATE source_files SET record_count = ?, success_count = ?, error_count = ? WHERE id = ?;`,
      args: [records.length, successCount, 0, fileId]
    });
  }

  private async importWcsCvrCsv(db: Pick<Client, 'execute'>, fileId: string, filePath: string, fileName: string): Promise<void> {
    const records = parseCvrWcsCsv(filePath);
    logger.info(`Parsed ${records.length} records from CVR CSV ${fileName}`, { module: 'ScannerEngine' });

    const { inserted, updated } = await new CvrMatchingEngine(() => db).processAndMatchCvrRecords(records, fileId);

    logger.info(`CVR WCS import done: ${inserted} inserted, ${updated} updated | file=${fileName}`, { module: 'ScannerEngine' });

    await db.execute({
      sql: `UPDATE source_files SET record_count = ?, success_count = ?, error_count = ? WHERE id = ?;`,
      args: [records.length, inserted + updated, 0, fileId]
    });
  }

  private async importPlusErrorExcel(db: Pick<Client, 'execute'>, fileId: string, filePath: string, fileName: string): Promise<void> {
    const errorRecords = parsePlusErrorExcel(filePath);
    logger.info(`Parsed ${errorRecords.length} error records from Plus Error Excel ${fileName}`, { module: 'ScannerEngine' });

    let count = 0;
    const now = new Date().toISOString();

    for (const err of errorRecords) {
      const errId = `err-${crypto.randomUUID()}`;
      await db.execute({
        sql: `INSERT INTO plus_error_records (
          id, file_id, item_code, batch_no, product_name, process_type,
          inspection_date, total_ng_qty, inspection_qty, ng_rate,
          d1, d2, d3, d4, d5, d6, d7, d8, d9, d10, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(item_code, batch_no, process_type) DO UPDATE SET
          file_id = excluded.file_id,
          product_name = excluded.product_name,
          inspection_date = excluded.inspection_date,
          total_ng_qty = excluded.total_ng_qty,
          inspection_qty = excluded.inspection_qty,
          ng_rate = excluded.ng_rate,
          d1 = excluded.d1, d2 = excluded.d2, d3 = excluded.d3, d4 = excluded.d4, d5 = excluded.d5,
          d6 = excluded.d6, d7 = excluded.d7, d8 = excluded.d8, d9 = excluded.d9, d10 = excluded.d10,
          created_at = excluded.created_at;`,
        args: [
          errId, fileId, err.itemCode, err.batchNo, err.productName, err.processType,
          err.inspectionDate, err.totalNgQty, err.inspectionQty, err.ngRate,
          err.d1, err.d2, err.d3, err.d4, err.d5, err.d6, err.d7, err.d8, err.d9, err.d10, now
        ]
      });
      count++;
    }

    const { rematchedCount } = await new CvrMatchingEngine(() => db).rematchCvrRecords();
    logger.info(`Plus error import done: ${count} error records, ${rematchedCount} CVR rematched | file=${fileName}`, { module: 'ScannerEngine' });

    await db.execute({
      sql: `UPDATE source_files SET record_count = ?, success_count = ?, error_count = ? WHERE id = ?;`,
      args: [errorRecords.length, count, 0, fileId]
    });
  }

  public startPeriodicScan(): void {
    const config = configurationProvider.getScannerConfig().scanner;
    if (!config.enabled || this.intervalId) return;
    const intervalMs = config.pollIntervalMs;
    logger.info(`Starting background periodic scanner every ${intervalMs / 1000}s...`, { module: 'ScannerEngine' });
    this.intervalId = setInterval(() => {
      this.scanOnce().catch(err => {
        logger.error(`Periodic scan error: ${err instanceof Error ? err.message : String(err)}`, { module: 'ScannerEngine' });
      });
    }, intervalMs);
  }

  public stopPeriodicScan(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Periodic scanner stopped', { module: 'ScannerEngine' });
    }
  }
}

export const scannerEngine = new ScannerEngine();
