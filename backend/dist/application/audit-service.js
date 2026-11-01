"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const app_error_js_1 = require("../errors/app-error.js");
class AuditService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    record(entry) { return this.repository.append(entry); }
    list(filter) {
        if (filter.from && !Number.isFinite(Date.parse(filter.from)) || filter.to && !Number.isFinite(Date.parse(filter.to))) {
            throw new app_error_js_1.ValidationError('Khoảng thời gian audit không hợp lệ');
        }
        return this.repository.list(filter);
    }
    async operation(entry, work) {
        const id = await this.repository.append({ ...entry, outcome: 'STARTED' });
        try {
            const result = await work();
            await this.repository.complete(id, 'SUCCESS', { request: entry.details, result });
            return result;
        }
        catch (error) {
            await this.repository.complete(id, 'FAILED', { request: entry.details, error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
}
exports.AuditService = AuditService;
