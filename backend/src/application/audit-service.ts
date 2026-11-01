import { AuditEntry, AuditFilter, AuditRepository } from '../domain/report-management.js';
import { ValidationError } from '../errors/app-error.js';

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}
  record(entry: AuditEntry) { return this.repository.append(entry); }
  list(filter: AuditFilter) {
    if (filter.from && !Number.isFinite(Date.parse(filter.from)) || filter.to && !Number.isFinite(Date.parse(filter.to))) {
      throw new ValidationError('Khoảng thời gian audit không hợp lệ');
    }
    return this.repository.list(filter);
  }
  async operation<T>(entry: Omit<AuditEntry,'outcome'>, work: () => Promise<T>): Promise<T> {
    const id = await this.repository.append({ ...entry, outcome: 'STARTED' });
    try {
      const result = await work();
      await this.repository.complete(id,'SUCCESS',{ request: entry.details, result });
      return result;
    } catch (error) {
      await this.repository.complete(id,'FAILED',{ request: entry.details, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
}
