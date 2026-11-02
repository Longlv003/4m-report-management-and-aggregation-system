import { PlusMatchBadge } from "../components/PlusMatchBadge.js";
import { useScanner } from "../useScanner.js";
import { ItemSearchFilters, ItemSearchValues } from "../components/ItemSearchFilters.js";
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Filter,
  Layers,
  RefreshCw,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  downloadCvrExcelExport,
  getCvr4mRecords,
  getCvrDashboardStats,
} from "../api.js";
import { RecordVisibilityAction } from "../components/RecordVisibilityAction.js";
import { formatDurationMinutes, formatPercentage } from "../formatters.js";
import { Cvr4mRecord, CvrDashboardStats, User } from "../types.js";
import { useSSE } from "../useSSE.js";

interface CVR4MPageProps {
  user: User;
}

export const CVR4MPage: React.FC<CVR4MPageProps> = ({ user }) => {
  const [records, setRecords] = useState<Cvr4mRecord[]>([]);
  const [stats, setStats] = useState<CvrDashboardStats | null>(null);
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
  const canManageRecords = user.permissions.includes("cvr4m:manage");

  const canExport = user.permissions.includes("cvr4m:export");
  const canScan = user.permissions.includes("config:manage");

  const latestRequest = useRef(0);

  const fetchData = useCallback(
    async (background = false) => {
      const requestId = ++latestRequest.current;
      if (!background) setLoading(true);
      setErrorMsg(null);
      try {
        const [recordsRes, statsRes] = await Promise.all([
          getCvr4mRecords({
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
          getCvrDashboardStats(),
        ]);

        if (requestId !== latestRequest.current) return;
        setRecords(recordsRes.records);
        setPage(recordsRes.pagination.page);
        setTotalPages(recordsRes.pagination.totalPages);
        setTotalRecords(recordsRes.pagination.total);
        setStats(statsRes);
      } catch (err) {
        if (requestId !== latestRequest.current) return;
        setErrorMsg(
          err instanceof Error ? err.message : "Lỗi tải dữ liệu CVR 4M",
        );
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
      await downloadCvrExcelExport({
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
          <h2 className="page-title">4M CVR AOM</h2>
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
        <div className="stats-grid">
          <div className="stat-card">
            <div
              className="stat-icon"
              style={{ background: "#eff6ff", color: "#2563eb" }}
            >
              <Layers size={22} />
            </div>
            <div className="stat-content">
              <span className="stat-label">Tổng bản ghi CVR</span>
              <span className="stat-value">
                {stats?.total.toLocaleString() ?? "—"}
              </span>
            </div>
          </div>

          <div className="stat-card">
            <div
              className="stat-icon"
              style={{ background: "#ecfdf5", color: "#059669" }}
            >
              <CheckCircle size={22} />
            </div>
            <div className="stat-content">
              <span className="stat-label">Đã match (Có Plus)</span>
              <span className="stat-value" style={{ color: "#059669" }}>
                {stats?.matched.toLocaleString() ?? "—"}
              </span>
            </div>
          </div>

          <div className="stat-card">
            <div
              className="stat-icon"
              style={{ background: "#fffbeb", color: "#d97706" }}
            >
              <AlertCircle size={22} />
            </div>
            <div className="stat-content">
              <span className="stat-label">Chờ khớp Plus</span>
              <span className="stat-value" style={{ color: "#d97706" }}>
                {stats?.unmatched.toLocaleString() ?? "—"}
              </span>
            </div>
          </div>

          <div
            className="stat-card"
            title={
              stats && stats.failedFiles > 0 && stats.failedFileNames
                ? `File lỗi: ${stats.failedFileNames}`
                : stats
                  ? "Không có file lỗi"
                  : "Đang tải thống kê file lỗi"
            }
            style={{
              cursor: stats && stats.failedFiles > 0 ? "help" : "default",
            }}
          >
            <div
              className={`stat-icon ${stats && stats.failedFiles > 0 ? "red" : "green"}`}
            >
              <AlertCircle size={22} />
            </div>
            <div className="stat-content">
              <span className="stat-label">File lỗi (encoding / hỏng)</span>
              <span
                className="stat-value"
                style={{
                  color:
                    stats && stats.failedFiles > 0
                      ? "var(--danger)"
                      : "inherit",
                }}
              >
                {stats
                  ? stats.failedFiles === 0
                    ? "✓ Không có"
                    : stats.failedFiles != null
                      ? `${stats.failedFiles} file`
                      : "—"
                  : "—"}
              </span>
            </div>
          </div>
        </div>

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
              <option value="1">Ca 1</option>
              <option value="2">Ca 2</option>
              <option value="Day">Day</option>
              <option value="Night">Night</option>
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
              <option value="MATCHED_ERROR_ONLY">Chỉ có lỗi Plus</option>
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

        <div className="table-card" aria-busy={loading}>
          <div className="table-wrapper">
            <table className="scan-table">
              <thead>
                <tr>
                  <th style={{ width: 45, textAlign: "center" }}>No.</th>
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
                  <th>Program name</th>
                  <th>Total sheet (Indi)</th>
                  <th>Total sheet (VRF)</th>
                  <th>OP</th>
                  <th>Total pcs (lot)</th>
                  <th>Total pcs (cvr)</th>
                  <th>Total pattern NG</th>
                  <th>% NG</th>
                  <th style={{ background: "#f0fdf4", color: "#166534" }}>
                    A side - Accumulative defect
                  </th>
                  <th style={{ background: "#f0fdf4", color: "#166534" }}>
                    % NG A side
                  </th>
                  <th style={{ background: "#f0fdf4" }}>Discoloration A</th>
                  <th style={{ background: "#f0fdf4" }}>FM A</th>
                  <th style={{ background: "#f0fdf4" }}>Copper residue A</th>
                  <th style={{ background: "#f0fdf4" }}>Broken hole A</th>
                  <th style={{ background: "#f0fdf4" }}>BVH shift A</th>
                  <th style={{ background: "#f0fdf4" }}>Missing hole A</th>
                  <th style={{ background: "#f0fdf4" }}>Extra hole A</th>
                  <th style={{ background: "#f0fdf4" }}>DFR seepage A</th>
                  <th style={{ background: "#f0fdf4" }}>Other A</th>
                  <th style={{ background: "#f0fdf4" }}>DFR remain A</th>
                  <th style={{ background: "#f0fdf4" }}>Verify zoom A</th>
                  <th style={{ background: "#eff6ff", color: "#1e40af" }}>
                    B side - Accumulative defect
                  </th>
                  <th style={{ background: "#eff6ff", color: "#1e40af" }}>
                    % NG B side
                  </th>
                  <th style={{ background: "#eff6ff" }}>Discoloration B</th>
                  <th style={{ background: "#eff6ff" }}>FM B</th>
                  <th style={{ background: "#eff6ff" }}>Copper residue B</th>
                  <th style={{ background: "#eff6ff" }}>Broken hole B</th>
                  <th style={{ background: "#eff6ff" }}>BVH shift B</th>
                  <th style={{ background: "#eff6ff" }}>Missing hole B</th>
                  <th style={{ background: "#eff6ff" }}>Extra hole B</th>
                  <th style={{ background: "#eff6ff" }}>DFR seepage B</th>
                  <th style={{ background: "#eff6ff" }}>Other B</th>
                  <th style={{ background: "#eff6ff" }}>DFR remain B</th>
                  <th style={{ background: "#eff6ff" }}>Verify zoom B</th>
                  <th style={{ width: 100, textAlign: "center" }}>Status</th>
                  {canManageRecords && <th>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManageRecords ? 48 : 47}
                      style={{
                        textAlign: "center",
                        padding: "32px 0",
                        color: "var(--gray-400)",
                      }}
                    >
                      {loading
                        ? "Đang tải dữ liệu CVR 4M..."
                        : "Không có bản ghi nào phù hợp với bộ lọc"}
                    </td>
                  </tr>
                ) : (
                  records.map((r, idx) => {
                    const rowNo = (page - 1) * (pageSize === "all" ? totalRecords : pageSize) + idx + 1;

                    return (
                      <tr
                        key={r.id}
                        className={
                          r.match_status === "UNMATCHED_PLUS"
                            ? "row-unmatched"
                            : undefined
                        }
                      >
                        <td
                          style={{
                            textAlign: "center",
                            fontWeight: 600,
                            color: "var(--gray-500)",
                          }}
                        >
                          {rowNo}
                        </td>
                        <td>{r.date || "—"}</td>
                        <td style={{ fontWeight: 600 }}>{r.machine || "—"}</td>
                        <td>{r.shift || "—"}</td>
                        <td>{r.start_time || "—"}</td>
                        <td>{r.finish_time || "—"}</td>
                        <td>
                          <strong>{formatDurationMinutes(r.total_time)}</strong>
                        </td>
                        <td style={{ fontWeight: 600, color: "#0f766e" }}>
                          {r.item_name || "—"}
                        </td>
                        <td
                          style={{ fontFamily: "monospace", fontWeight: 600 }}
                        >
                          {r.item_code}
                        </td>
                        <td style={{ fontWeight: 600 }}>{r.lot_no}</td>
                        <td>{r.seq_no}</td>
                        <td>{r.process || "—"}</td>
                        <td
                          className="text-left"
                          style={{ fontFamily: "monospace" }}
                          title={r.program_name}
                        >
                          {r.program_name || "—"}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: r.total_sheet_indi ? 600 : 400,
                            color: r.total_sheet_indi
                              ? "var(--gray-900)"
                              : "var(--gray-400)",
                          }}
                        >
                          {r.total_sheet_indi ?? "—"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          {r.total_sheet_vrf ?? "—"}
                        </td>
                        <td className="op-cell">
                          {r.op
                            ? r.op.split("\n").map((line, i) => (
                                <div key={i} className="op-line">
                                  {line}
                                </div>
                              ))
                            : "—"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {r.total_pcs?.toLocaleString() ?? "—"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {r.total_pcs_cvr?.toLocaleString() ?? "—"}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            color:
                              (r.total_pattern_ng || 0) > 0
                                ? "#dc2626"
                                : "var(--gray-700)",
                          }}
                        >
                          {r.total_pattern_ng?.toLocaleString() ?? "—"}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: 600,
                            color:
                              (r.ng_rate || 0) > 1
                                ? "#dc2626"
                                : "var(--gray-800)",
                          }}
                        >
                          {formatPercentage(r.ng_rate)}
                        </td>

                        {/* Side A Defect Breakdown */}
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            background: "#f0fdf4",
                            color: "#166534",
                          }}
                        >
                          {r.accumulative_defect_a ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#f0fdf4" }}
                        >
                          {formatPercentage(r.ng_rate_a)}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#f0fdf4" }}
                        >
                          {r.discoloration_a ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#f0fdf4" }}
                        >
                          {r.fm_a ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#f0fdf4" }}
                        >
                          {r.copper_residue_a ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#f0fdf4" }}
                        >
                          {r.broken_hole_a ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#f0fdf4" }}
                        >
                          {r.bvh_shift_a ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#f0fdf4" }}
                        >
                          {r.missing_hole_a ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#f0fdf4" }}
                        >
                          {r.extra_hole_a ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#f0fdf4" }}
                        >
                          {r.dfr_seepage_a ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#f0fdf4" }}
                        >
                          {r.other_a ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#f0fdf4" }}
                        >
                          {r.dfr_remain_a ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "center", background: "#f0fdf4" }}
                        >
                          {r.verify_zoom_a || "—"}
                        </td>

                        {/* Side B Defect Breakdown */}
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            background: "#eff6ff",
                            color: "#1e40af",
                          }}
                        >
                          {r.accumulative_defect_b ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#eff6ff" }}
                        >
                          {formatPercentage(r.ng_rate_b)}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#eff6ff" }}
                        >
                          {r.discoloration_b ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#eff6ff" }}
                        >
                          {r.fm_b ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#eff6ff" }}
                        >
                          {r.copper_residue_b ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#eff6ff" }}
                        >
                          {r.broken_hole_b ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#eff6ff" }}
                        >
                          {r.bvh_shift_b ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#eff6ff" }}
                        >
                          {r.missing_hole_b ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#eff6ff" }}
                        >
                          {r.extra_hole_b ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#eff6ff" }}
                        >
                          {r.dfr_seepage_b ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#eff6ff" }}
                        >
                          {r.other_b ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "right", background: "#eff6ff" }}
                        >
                          {r.dfr_remain_b ?? 0}
                        </td>
                        <td
                          style={{ textAlign: "center", background: "#eff6ff" }}
                        >
                          {r.verify_zoom_b || "—"}
                        </td>
                        <td>
                          <PlusMatchBadge status={r.match_status} method={r.plus_match_method} details={r.plus_match_details} />
                        </td>
                        {canManageRecords && (
                          <td>
                            <RecordVisibilityAction
                              report="cvr4m"
                              id={r.id}
                              label={
                                r.item_code +
                                " / " +
                                r.lot_no +
                                " / " +
                                r.machine
                              }
                              excluded={visibility === "excluded"}
                              onChanged={() => void fetchData()}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })
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
