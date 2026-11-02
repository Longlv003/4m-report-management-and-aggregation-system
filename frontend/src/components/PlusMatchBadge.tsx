interface Props { status: string; method?: string | null; details?: string | null; }

function matchDescription(details?: string | null): string | undefined {
  if (!details) return undefined;
  try {
    const match = JSON.parse(details);
    if (!match || typeof match !== 'object') return undefined;
    const lines = [`${match.itemCode} / ${match.lotNo} / Seq ${match.seqNo}`];
    if (Array.isArray(match.records)) {
      for (const row of match.records) {
        if (row && typeof row === 'object') lines.push(`${row.lotNo} / Seq ${row.seqNo}: ${row.quantity ?? 'thiếu số lượng'} sheet`);
      }
    }
    if (match.quantity !== null) lines.push(`Tổng: ${match.quantity} sheet`);
    if (match.reason) lines.push(String(match.reason));
    return lines.join('\n');
  } catch { return undefined; }
}

export function PlusMatchBadge({ status, method, details }: Props) {
  const matched = status === 'MATCHED';
  const label = method === 'WCS_CHILD_PRESENT' ? 'Lot con đã có WCS' : method === 'INCOMPLETE_SPLIT' ? 'Thiếu lot con' : matched
    ? method === 'SPLIT' ? 'Khớp lot con' : 'Matched'
    : status === 'MATCHED_ERROR_ONLY' ? 'Chỉ có lỗi Plus' : 'Chưa có Plus';
  return <span className={`badge ${matched ? 'badge-success' : 'badge-warning'}`} title={matchDescription(details)}>{label}</span>;
}
