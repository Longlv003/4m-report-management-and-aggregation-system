import { Actor, ManagementUnitOfWork, ReportType, recordKey } from '../domain/report-management.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/app-error.js';

export class RecordManagementService {
  constructor(private readonly unitOfWork: ManagementUnitOfWork) {}
  async setExcluded(report: ReportType, id: string, excluded: boolean, reason: string, actor: Actor) {
    if ((excluded && !reason.trim()) || reason.length > 1000) throw new ValidationError('Nhập lý do loại bỏ (tối đa 1000 ký tự)');
    return this.unitOfWork.run(async ({ exclusions, audit }) => {
      const record = await exclusions.findRecord(report,id);
      if (!record) throw new NotFoundError('Không tìm thấy bản ghi');
      const key = recordKey(report,record);
      const previous = await exclusions.find(report,key);
      if (Boolean(previous?.is_excluded) === excluded) throw new ConflictError(excluded ? 'Bản ghi đã bị loại bỏ' : 'Bản ghi đang hoạt động');
      await exclusions.save(report,key,record,excluded,reason.trim(),actor);
      await audit.append({ actor, action: excluded ? 'EXCLUDE' : 'RESTORE', resource: report,
        outcome: 'SUCCESS', details: { recordId: id, recordKey: key, reason: reason.trim(), before: previous || null, after: { excluded }, record } });
      return { id, excluded };
    });
  }
}
