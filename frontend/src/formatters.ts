export function formatDurationMinutes(value: string | null): string {
  const duration = value?.trim();
  if (!duration || duration === '-' || duration === '—') return '—';
  if (/^-?\d+(?:\.\d+)?$/.test(duration)) return `${duration} phút`;
  return duration.replace(/\bmin\b/g, 'phút');
}

export function formatPercentage(value: number | null): string {
  return value != null ? `${value.toFixed(3)}%` : '—';
}
