import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuditLogs } from '../api.js';
import { AuditRecord } from '../types.js';

const actions = ['LOGIN','LOGOUT','CREATE','UPDATE','DELETE','EXCLUDE','RESTORE','EXPORT','MANUAL_SCAN','TOGGLE_ACTIVE','RESET_PASSWORD','CHANGE_PASSWORD','VIEW','POST_ATTEMPT','PUT_ATTEMPT','DELETE_ATTEMPT'];
const labels: Record<string,string> = { LOGIN:'Đăng nhập',LOGOUT:'Đăng xuất',CREATE:'Thêm',UPDATE:'Sửa',DELETE:'Xóa mềm',EXCLUDE:'Loại bỏ',RESTORE:'Khôi phục',EXPORT:'Xuất Excel',MANUAL_SCAN:'Quét thủ công',TOGGLE_ACTIVE:'Khóa / mở khóa',RESET_PASSWORD:'Đặt lại mật khẩu',CHANGE_PASSWORD:'Đổi mật khẩu',VIEW:'Xem dữ liệu' };
export function AuditPage() {
  const [records,setRecords] = useState<AuditRecord[]>([]);
  const [search,setSearch] = useState(''); const [action,setAction] = useState('');
  const [from,setFrom] = useState(''); const [to,setTo] = useState('');
  const [page,setPage] = useState(1); const [total,setTotal] = useState(0);
  const [loading,setLoading] = useState(false); const [error,setError] = useState('');
  const latest = useRef(0);
  const fetchLogs = useCallback(async () => {
    const id = ++latest.current; setLoading(true); setError('');
    try {
      const result = await getAuditLogs({ page,pageSize: 50,search,action,
        from: from ? new Date(from).toISOString() : undefined,to: to ? new Date(to).toISOString() : undefined });
      if (id !== latest.current) return;
      setRecords(result.records); setTotal(result.pagination.total);
    } catch (error) { if (id === latest.current) setError(error instanceof Error ? error.message : 'Không tải được audit'); }
    finally { if (id === latest.current) setLoading(false); }
  },[page,search,action,from,to]);
  useEffect(() => { void fetchLogs(); return () => { latest.current++; }; },[fetchLogs]);
  const pretty = (details: string | null) => { try { return JSON.stringify(JSON.parse(details || '{}'),null,2); } catch { return details || ''; } };
  return <div className="main-content">
    <header className="top-bar"><div><h2 className="page-title">Lịch sử thao tác</h2>
      <p style={{ color:'var(--gray-500)' }}>Theo dõi tài khoản, hành động, kết quả và dữ liệu trước / sau thay đổi.</p></div>
      <button className="btn btn-outline" disabled={loading} onClick={() => void fetchLogs()}>Làm mới</button></header>
    <div className="page-body">
      <div className="filter-card">
        <label className="filter-group">Tài khoản / nội dung<input className="filter-input" value={search} placeholder="Tìm lịch sử..." onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
        <label className="filter-group">Hành động<select className="filter-select" value={action} onChange={e => { setAction(e.target.value); setPage(1); }}>
          <option value="">Tất cả</option>{actions.map(action => <option key={action} value={action}>{labels[action] || action}</option>)}</select></label>
        <label className="filter-group">Từ thời điểm<input type="datetime-local" className="filter-input" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></label>
        <label className="filter-group">Đến trước thời điểm<input type="datetime-local" className="filter-input" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} /></label>
      </div>
      {error && <div className="alert-error">{error}</div>}
      <div className="table-card"><div className="table-wrapper"><table className="scan-table"><thead><tr>
        <th>Thời gian</th><th>Tài khoản</th><th>Hành động</th><th>Đối tượng</th><th>Kết quả</th><th>IP</th><th>Chi tiết</th>
      </tr></thead><tbody>
        {!records.length && <tr><td colSpan={7}>{loading ? 'Đang tải...' : 'Không có lịch sử phù hợp'}</td></tr>}
        {records.map(row => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString('vi-VN')}</td><td>{row.username}</td>
          <td>{labels[row.action] || row.action}</td><td>{row.resource}</td><td>{row.outcome === 'FAILED' ? 'Thất bại' : row.outcome === 'STARTED' ? 'Đang xử lý / chưa hoàn tất' : 'Thành công'}</td>
          <td>{row.ip_address || '—'}</td><td><details><summary>Xem chi tiết</summary><pre style={{ maxWidth: 620,maxHeight: 320,overflow:'auto',textAlign:'left',whiteSpace:'pre-wrap' }}>{pretty(row.details)}</pre></details></td></tr>)}
      </tbody></table></div>
      <div className="pagination-bar"><span>{total} thao tác</span><div className="pagination-controls">
        <button className="btn btn-outline" disabled={page <= 1 || loading} onClick={() => setPage(page-1)}>Trước</button>
        <span>Trang {page} / {Math.max(1,Math.ceil(total/50))}</span>
        <button className="btn btn-outline" disabled={page*50 >= total || loading} onClick={() => setPage(page+1)}>Sau</button>
      </div></div></div>
    </div>
  </div>;
}
