export function calculateTotalPcs(sheets: number | null, pcsPerSheet: number | null): number | null {
  if (sheets === null || pcsPerSheet === null || !Number.isFinite(sheets) ||
      !Number.isFinite(pcsPerSheet) || sheets < 0 || pcsPerSheet <= 0) return null;
  return sheets * pcsPerSheet;
}
