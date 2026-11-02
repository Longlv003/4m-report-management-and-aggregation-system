"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportPagination = reportPagination;
/** The explicit 'all' option removes the SQL limit, including on empty results. */
function reportPagination(query, total) {
    if (query.pageSize === 'all')
        return { page: 1, pageSize: total, limit: -1, offset: 0, totalPages: 1 };
    const pageSize = Math.min(500, Math.max(10, Number.parseInt(String(query.pageSize)) || 50));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(totalPages, Math.max(1, Number.parseInt(String(query.page)) || 1));
    return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize, totalPages };
}
