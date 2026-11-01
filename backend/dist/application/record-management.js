"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecordManagementService = void 0;
const report_management_js_1 = require("../domain/report-management.js");
const app_error_js_1 = require("../errors/app-error.js");
class RecordManagementService {
    unitOfWork;
    constructor(unitOfWork) {
        this.unitOfWork = unitOfWork;
    }
    async setExcluded(report, id, excluded, reason, actor) {
        if ((excluded && !reason.trim()) || reason.length > 1000)
            throw new app_error_js_1.ValidationError('Nhập lý do loại bỏ (tối đa 1000 ký tự)');
        return this.unitOfWork.run(async ({ exclusions, audit }) => {
            const record = await exclusions.findRecord(report, id);
            if (!record)
                throw new app_error_js_1.NotFoundError('Không tìm thấy bản ghi');
            const key = (0, report_management_js_1.recordKey)(report, record);
            const previous = await exclusions.find(report, key);
            if (Boolean(previous?.is_excluded) === excluded)
                throw new app_error_js_1.ConflictError(excluded ? 'Bản ghi đã bị loại bỏ' : 'Bản ghi đang hoạt động');
            await exclusions.save(report, key, record, excluded, reason.trim(), actor);
            await audit.append({ actor, action: excluded ? 'EXCLUDE' : 'RESTORE', resource: report,
                outcome: 'SUCCESS', details: { recordId: id, recordKey: key, reason: reason.trim(), before: previous || null, after: { excluded }, record } });
            return { id, excluded };
        });
    }
}
exports.RecordManagementService = RecordManagementService;
