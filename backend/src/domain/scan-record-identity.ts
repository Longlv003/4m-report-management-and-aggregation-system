export const WCS_SCAN_PARSER_VERSION = 2;

/** A Plus lot/process match can have many WCS machine runs. */
export function scanRecordKey(row: Record<string, unknown>): string {
  return JSON.stringify(['item_code', 'lot_no', 'seq_no', 'start_time', 'machine']
    .map(column => String(row[column] ?? '').trim()));
}
