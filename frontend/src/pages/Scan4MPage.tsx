import { useScanner } from "../useScanner.js";
import { ItemSearchFilters, ItemSearchValues } from "../components/ItemSearchFilters.js";
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  Filter,
  Layers,
  RefreshCw,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  downloadExcelExport,
  getDashboardStats,
  getScan4mRecords,
} from "../api.js";
import { RecordVisibilityAction } from "../components/RecordVisibilityAction.js";
import { formatDurationMinutes } from "../formatters.js";
import { DashboardStats, Scan4MRecord, User } from "../types.js";
import { useSSE } from "../useSSE.js";

interface Scan4MPageProps {
  user: User;
}

export const Scan4MPage: React.FC<Scan4MPageProps> = ({ user }) => {
  const [records, setRecords] = useState<Scan4MRecord[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const { scanning, scan } = useScanner();
  const [exporting, setExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | "all">(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [machineFilter, setMachineFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [itemSearch, setItemSearch] = useState<ItemSearchValues>({ itemName: "", itemCode: "", lotNo: "" });
  const [visibility, setVisibility] = useState<"active" | "excluded">("active");
  const canManageRecords = user.permissions.includes("scan4m:manage");

  const canExport = user.permissions.includes("scan4m:export");
  const canScan = user.permissions.includes("config:manage");

  const latestRequest = useRef(0);

  const fetchData = useCallback(
    async (background = false) => {
      const requestId = ++latestRequest.current;
      if (!background) setLoading(true);
      setErrorMsg(null);
      try {
        const [recordsRes, statsRes] = await Promise.all([
          getScan4mRecords({
            page,
            pageSize,
            visibility,
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            shift: shiftFilter || undefined,
            machine: machineFilter || undefined,
            matchStatus: statusFilter || undefined,
            ...itemSearch,
          }),
          getDashboardStats(),
        ]);

        if (requestId !== latestRequest.current) return;
        setRecords(recordsRes.records);
        setPage(recordsRes.pagination.page);
        setTotalPages(recordsRes.pagination.totalPages);
        setTotalRecords(recordsRes.pagination.total);
        setStats(statsRes);
      } catch (err) {
        if (requestId !== latestRequest.current) return;
        setErrorMsg(err instanceof Error ? err.message : "Lỗi tải dữ liệu");
      } finally {
        if (requestId === latestRequest.current) setLoading(false);
      }
    },
    [
      visibility,
      page,
      pageSize,
      fromDate,
      toDate,
      shiftFilter,
      machineFilter,
      statusFilter,
      itemSearch,
    ],
  );

  useEffect(() => {
    fetchData();
    return () => {
      latestRequest.current++;
    };
  }, [fetchData]);

  // Realtime SSE updates
  useSSE(
    () => {
      fetchData(true);
    },
    () => {
      fetchData(true);
    },
  );

  const handleManualScan = async () => {
    if (scanning) return;
    try {
      await scan();
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Quét thất bại");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadExcelExport({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        shift: shiftFilter || undefined,
        machine: machineFilter || undefined,
        matchStatus: statusFilter || undefined,
        ...itemSearch,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Tải file Excel thất bại");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="main-content">
      <header className="top-bar">
        <div>
          <h2 className="page-title">4M Scan AOM</h2>
          <p style={{ fontSize: "0.8rem", color: "var(--gray-500)" }}>
            Dữ liệu tổng hợp từ hệ thống WCS và Plus
          </p>
        </div>

        <div className="top-actions">
          {canScan && (
            <button
              className="btn btn-outline"
              onClick={handleManualScan}
              disabled={scanning}
            >
              <RefreshCw size={16} className={scanning ? "spin" : ""} />
              <span>{scanning ? "Đang quét..." : "Quét ngay"}</span>
            </button>
          )}

          {canExport && (
            <button
              className="btn btn-success"
              onClick={handleExport}
              disabled={exporting || visibility === "excluded"}
            >
              <FileSpreadsheet size={16} />
              <span>{exporting ? "Đang xuất..." : "Xuất Excel"}</span>
            </button>
          )}
        </div>
      </header>

      <div className="page-body">
        {/* Metric Cards */}
        {stats && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue">
                <Layers size={22} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Tổng bản ghi Scan</span>
                <span className="stat-value">
                  {stats.totalRecords.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green">
                <CheckCircle size={22} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Đã match (WCS + Plus)</span>
                <span className="stat-value">
                  {stats.matchedRecords.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon orange">
                <Clock size={22} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Chưa match (Chờ Plus)</span>
                <span className="stat-value">
                  {stats.unmatchedRecords.toLocaleString()}
                </span>
              </div>
            </div>

            <div
              className="stat-card"
              title={
                stats.failedFiles > 0 && stats.failedFileNames
                  ? `File lỗi: ${stats.failedFileNames}`
                  : "Không có file lỗi"
              }
              style={{ cursor: stats.failedFiles > 0 ? "help" : "default" }}
            >
              <div
                className={`stat-icon ${stats.failedFiles > 0 ? "red" : "green"}`}
              >
                <AlertCircle size={22} />
              </div>
              <div className="stat-content">
                <span className="stat-label">File lỗi (encoding / hỏng)</span>
                <span
                  className="stat-value"
                  style={{
                    color: stats.failedFiles > 0 ? "var(--danger)" : "inherit",
                  }}
                >
                  {stats.failedFiles === 0
                    ? "✓ Không có"
                    : `${stats.failedFiles} file`}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="filter-card">
          <ItemSearchFilters value={itemSearch} onChange={value => { setItemSearch(value); setPage(1); }} />

          <div className="filter-group">
            <label className="filter-label">Từ ngày</label>
            <input
              type="date"
              className="filter-input"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Đến ngày</label>
            <input
              type="date"
              className="filter-input"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Ca làm việc</label>
            <select
              className="filter-select"
              value={shiftFilter}
              onChange={(e) => {
                setShiftFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả ca</option>
              <option value="A">Ca A</option>
              <option value="B">Ca B</option>
              <option value="C">Ca C</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Trạng thái Matching</label>
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả</option>
              <option value="MATCHED">Đã match</option>
              <option value="UNMATCHED_PLUS">Chưa có Plus</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Thiết bị</label>
            <input
              type="text"
              className="filter-input"
              placeholder="Tên máy..."
              value={machineFilter}
              onChange={(e) => {
                setMachineFilter(e.target.value);
                setPage(1);
              }}
              style={{ width: 140 }}
            />
          </div>

          {canManageRecords && (
            <>
              <label className="filter-group">
                <span className="filter-label">Hiển thị</span>
                <select
                  className="filter-select"
                  value={visibility}
                  onChange={(e) => {
                    setVisibility(e.target.value as "active" | "excluded");
                    setPage(1);
                  }}
                >
                  <option value="active">Đang sử dụng</option>
                  <option value="excluded">Đã loại bỏ</option>
                </select>
              </label>
            </>
          )}

          {(fromDate ||
            toDate ||
            shiftFilter ||
            machineFilter ||
            statusFilter ||
            Object.values(itemSearch).some(Boolean)) && (
            <button
              className="btn btn-outline"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setShiftFilter("");
                setMachineFilter("");
                setStatusFilter("");
                setItemSearch({ itemName: "", itemCode: "", lotNo: "" });
                setPage(1);
              }}
              style={{ alignSelf: "flex-end" }}
            >
              <Filter size={14} />
              <span>Xóa lọc</span>
            </button>
          )}
        </div>

        {errorMsg && <div className="alert-error">{errorMsg}</div>}

        {/* 30-Column Data Table */}
        <div className="table-card">
          <div className="table-wrapper">
            <table className="scan-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Date</th>
                  <th>Machine</th>
                  <th>Shift</th>
                  <th>Start time</th>
                  <th>Finish time</th>
                  <th>Total time</th>
                  <th>Item name</th>
                  <th>Item code</th>
                  <th>Lot no</th>
                  <th>Seq no</th>
                  <th>Process</th>
                  <th>Layer</th>
                  <th>Program name</th>
                  <th>Total sheet (Indi)</th>
                  <th>Total sheet (Scan)</th>
                  <th style={{ minWidth: 260 }}>OP</th>
                  <th>Outer Dia Top Avg (A side)</th>
                  <th>Cpk Outer Top (A side)</th>
                  <th>Inner Dia Bottom Avg (A side)</th>
                  <th>Cpk Inner Bottom (A side)</th>
                  <th>Outer Dia Top Avg (B side)</th>
                  <th>Cpk Outer Top (B side)</th>
                  <th>Inner Dia Bottom Avg (B side)</th>
                  <th>Cpk Inner Bottom (B side)</th>
                  <th>Light Check</th>
                  <th>Machine Check by Master Sample</th>
                  <th>Master Sample Check</th>
                  <th>Master Sample Expiry Date</th>
                  <th>Roll Cleaning</th>
                  <th>Input Air Pressure</th>
                  <th>Status</th>
                  {canManageRecords && <th>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {loading && records.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManageRecords ? 33 : 32}
                      style={{ padding: 40, color: "var(--gray-500)" }}
                    >
                      Đang tải dữ liệu...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManageRecords ? 33 : 32}
                      style={{ padding: 40, color: "var(--gray-500)" }}
                    >
                      Không có bản ghi nào phù hợp với bộ lọc
                    </td>
                  </tr>
                ) : (
                  records.map((r, idx) => (
                    <tr
                      key={r.id}
                      className={
                        r.match_status === "UNMATCHED_PLUS"
                          ? "row-unmatched"
                          : undefined
                      }
                    >
                      <td style={{ color: "var(--gray-400)" }}>
                        {(page - 1) * (pageSize === "all" ? totalRecords : pageSize) + idx + 1}
                      </td>
                      <td>{r.date}</td>
                      <td>{r.machine}</td>
                      <td>
                        <span className="badge badge-gray">{r.shift}</span>
                      </td>
                      <td>{r.start_time}</td>
                      <td>{r.finish_time || "-"}</td>
                      <td>
                        <strong style={{ color: r.total_time === "N/A" ? "var(--danger)" : undefined }}
                          title={r.total_time === "N/A" ? "Finish time trước Start time" : undefined}>
                          {r.total_time === null ? "-" : formatDurationMinutes(r.total_time)}
                        </strong>
                      </td>
                      <td className="text-left">{r.item_name}</td>
                      <td style={{ fontFamily: "monospace", fontWeight: 600 }}>
                        {r.item_code}
                      </td>
                      <td style={{ fontFamily: "monospace" }}>{r.lot_no}</td>
                      <td style={{ fontFamily: "monospace" }}>{r.seq_no}</td>
                      <td>{r.process}</td>
                      <td>
                        <span
                          className="badge badge-gray"
                          style={{ fontWeight: 700 }}
                        >
                          {r.layer}
                        </span>
                      </td>
                      <td
                        className="text-left"
                        style={{ fontFamily: "monospace" }}
                      >
                        {r.program_name}
                      </td>
                      <td>{r.total_sheet_indi ?? "-"}</td>
                      <td>{r.total_sheet_scan ?? "-"}</td>
                      <td className="op-cell">
                        {r.op
                          ? r.op.split("\n").map((line, i) => (
                              <div key={i} className="op-line">
                                {line}
                              </div>
                            ))
                          : "-"}
                      </td>
                      <td>{r.outer_top_avg_a ?? "-"}</td>
                      <td>{r.cpk_outer_top_a ?? "-"}</td>
                      <td>{r.inner_bottom_avg_a ?? "-"}</td>
                      <td>{r.cpk_inner_bottom_a ?? "-"}</td>
                      <td>{r.outer_top_avg_b ?? "-"}</td>
                      <td>{r.cpk_outer_top_b ?? "-"}</td>
                      <td>{r.inner_bottom_avg_b ?? "-"}</td>
                      <td>{r.cpk_inner_bottom_b ?? "-"}</td>
                      <td>{r.check_light}</td>
                      <td>{r.check_master_machine}</td>
                      <td>{r.check_master_sample}</td>
                      <td>{r.exp_master_sample}</td>
                      <td>{r.roll_cleaning}</td>
                      <td>
                        {r.air_pressure !== null
                          ? `${r.air_pressure} Mpa`
                          : "-"}
                      </td>
                      <td>
                        {r.anomaly_flag ? (
                          <span className="badge badge-danger">Lệch giờ</span>
                        ) : r.match_status === "MATCHED" ? (
                          <span className="badge badge-success">Matched</span>
                        ) : (
                          <span className="badge badge-warning">
                            Chưa có Plus
                          </span>
                        )}
                      </td>
                      {canManageRecords && (
                        <td>
                          <RecordVisibilityAction
                            report="scan4m"
                            id={r.id}
                            label={
                              r.item_code + " / " + r.lot_no + " / " + r.seq_no
                            }
                            excluded={visibility === "excluded"}
                            onChanged={() => void fetchData()}
                          />
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="pagination-bar">
            <div>
              Hiển thị <strong>{records.length}</strong> /{" "}
              <strong>{totalRecords}</strong> bản ghi
            </div>

            <div className="pagination-controls">
              <select
                className="filter-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(e.target.value === "all" ? "all" : Number(e.target.value));
                  setPage(1);
                }}
                style={{ height: 32 }}
              >
                <option value={50}>50 dòng / trang</option>
                <option value={100}>100 dòng / trang</option>
                <option value={200}>200 dòng / trang</option>
                <option value="all">Tất cả</option>
              </select>

              <button
                className="btn btn-outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ height: 32, padding: "0 10px" }}
              >
                <ChevronLeft size={16} />
              </button>

              <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Trang {page} / {totalPages || 1}
              </span>

              <button
                className="btn btn-outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{ height: 32, padding: "0 10px" }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
