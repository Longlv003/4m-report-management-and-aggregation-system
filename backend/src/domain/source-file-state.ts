export interface FileFingerprint { size: number; mtimeMs: number; ctimeMs: number; }
export interface SourceFileState extends FileFingerprint {
  sha256: string;
  sourceFileId: string;
  status: string;
  parserVersion: number;
  sourceStatus: string | null;
  sourceParserVersion: number;
}
export function sameFingerprint(a: FileFingerprint, b: FileFingerprint): boolean {
  return a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}
export function canSkipUnchangedFile(state: SourceFileState | undefined, current: FileFingerprint, parserVersion: number): boolean {
  return Boolean(state && state.status === 'SUCCESS' && state.sourceStatus === 'SUCCESS' &&
    state.parserVersion >= parserVersion && state.sourceParserVersion >= parserVersion && sameFingerprint(state, current));
}
