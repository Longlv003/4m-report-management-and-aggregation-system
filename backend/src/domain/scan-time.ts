/** WCS timestamps are local date-times, matching the WCS operation time. */
export function latestWcsFinishTime(row: Record<string, string>): string | null {
  let latest: { value: string; milliseconds: number } | null = null;
  for (const column of ['Time01', 'Time02', 'Time03', 'Time04', 'Time05']) {
    const value = (row[column] || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value)) continue;
    const parsed = new Date(value.replace(' ', 'T'));
    const parts = value.split(/[- T:]/).map(Number);
    const valid = parsed.getFullYear() === parts[0] && parsed.getMonth() + 1 === parts[1] &&
      parsed.getDate() === parts[2] && parsed.getHours() === parts[3] &&
      parsed.getMinutes() === parts[4] && parsed.getSeconds() === parts[5];
    const milliseconds = parsed.getTime();
    if (valid && (!latest || milliseconds > latest.milliseconds)) {
      latest = { value: value.replace('T', ' '), milliseconds };
    }
  }
  return latest?.value ?? null;
}
