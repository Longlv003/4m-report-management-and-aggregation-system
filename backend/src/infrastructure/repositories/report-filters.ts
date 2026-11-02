/** Shared by list and export so the downloaded report uses the same filters. */
export function appendItemFilters(query: Record<string, unknown>, conditions: string[], args: unknown[]): void {
  for (const [key, column] of [['itemName', 'item_name'], ['itemCode', 'item_code'], ['lotNo', 'lot_no']]) {
    const value = query[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    conditions.push(`${column} LIKE ? ESCAPE '\\'`);
    args.push(`%${value.trim().replace(/[\\%_]/g, '\\$&')}%`);
  }
}
export const REPORT_ORDER_BY = 'date DESC, start_time DESC, machine ASC, id ASC';
