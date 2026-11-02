export type ReportType = 'scan4m' | 'cvr4m';
export type DataRow = Record<string, unknown>;
export interface Actor { id: string; username: string; ip?: string; }
export interface AuditEntry {
  actor?: Actor; ip?: string; action: string; resource: string; details?: unknown;
  outcome: 'SUCCESS' | 'FAILED' | 'STARTED';
}
export interface AuditFilter { page: number; pageSize: number; search?: string; action?: string; from?: string; to?: string; }
export interface AuditRepository {
  append(entry: AuditEntry): Promise<string>;
  complete(id: string, outcome: 'SUCCESS' | 'FAILED', details: unknown): Promise<void>;
  list(filter: AuditFilter): Promise<{ records: DataRow[]; total: number }>;
}
export interface ExclusionRepository {
  findRecord(report: ReportType, id: string): Promise<DataRow | undefined>;
  find(report: ReportType, key: string): Promise<DataRow | undefined>;
  save(report: ReportType, key: string, record: DataRow, excluded: boolean, reason: string, actor: Actor): Promise<void>;
}
export function recordKey(report: ReportType, row: DataRow): string {
  return report === 'scan4m' ? scanRecordKey(row) : JSON.stringify(
    ['item_code','lot_no','seq_no','start_time','machine'].map(key => String(row[key] ?? '')));
}
export interface ManagementTransaction { exclusions: ExclusionRepository; audit: AuditRepository; }
export interface ManagementUnitOfWork {
  run<T>(work: (repositories: ManagementTransaction) => Promise<T>): Promise<T>;
}
export type MutationResource = 'accounts' | 'item_mapping' | 'password';
export interface MutationSnapshotRepository {
  read(resource: MutationResource, targetId?: string): Promise<unknown[]>;
}
import { scanRecordKey } from './scan-record-identity.js';
