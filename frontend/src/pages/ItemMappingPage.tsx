import React, { useState, useEffect, useCallback } from 'react';
import { ItemMapping } from '../types.js';
import { getMappings, createMapping, updateMapping, deleteMapping, restoreMapping } from '../api.js';
import { Plus, Search, Edit2, Trash2, X, Map, RotateCcw } from 'lucide-react';

// Default process options (users can also type custom ones directly)
const DEFAULT_PROCESS_OPTIONS = ['Shadow S/S', 'Electroless'];

// Permission-aware props
interface ItemMappingPageProps {
  canManage: boolean;
}

export const ItemMappingPage: React.FC<ItemMappingPageProps> = ({ canManage }) => {
  const [mappings, setMappings] = useState<ItemMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'deleted'>('active');

  // Collect all unique processes from database + defaults for autocomplete
  const availableProcesses = Array.from(
    new Set([
      ...DEFAULT_PROCESS_OPTIONS,
      ...mappings.map(m => m.process).filter(Boolean)
    ])
  );

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ itemName: '', pcsPerSheet: '', process: 'Shadow S/S' });
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState<ItemMapping | null>(null);
  const [editForm, setEditForm] = useState({ itemName: '', pcsPerSheet: '', process: 'Shadow S/S' });
  const [editError, setEditError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Delete confirm modal
  const [deleteTarget, setDeleteTarget] = useState<ItemMapping | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchMappings = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await getMappings(search || undefined, statusFilter);
      setMappings(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tải dữ liệu mapping');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { fetchMappings(); }, [fetchMappings]);

  const handleRestore = async (m: ItemMapping) => {
    try {
      await restoreMapping(m.id);
      await fetchMappings();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Khôi phục thất bại');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAdding(true);
    try {
      await createMapping({ itemName: addForm.itemName, pcsPerSheet: Number(addForm.pcsPerSheet), process: addForm.process });
      setShowAddModal(false);
      setAddForm({ itemName: '', pcsPerSheet: '', process: 'Electroless' });
      await fetchMappings();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Thêm thất bại');
    } finally {
      setAdding(false);
    }
  };

  const openEdit = (m: ItemMapping) => {
    setEditTarget(m);
    setEditForm({ itemName: m.item_name, pcsPerSheet: String(m.pcs_per_sheet), process: m.process });
    setEditError(null);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditError(null);
    setEditing(true);
    try {
      await updateMapping(editTarget.id, { itemName: editForm.itemName, pcsPerSheet: Number(editForm.pcsPerSheet), process: editForm.process });
      setEditTarget(null);
      await fetchMappings();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Cập nhật thất bại');
    } finally {
      setEditing(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMapping(deleteTarget.id);
      setDeleteTarget(null);
      await fetchMappings();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xóa thất bại');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="main-content">
      <header className="top-bar">
        <div>
          <h2 className="page-title">Bảng Mapping Item</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
            Danh sách Item name → Số pcs/sheet → Process
          </p>
        </div>
        <div className="top-actions">
          {canManage && (
            <button
              className="btn btn-primary"
              onClick={() => { setShowAddModal(true); setAddError(null); setAddForm({ itemName: '', pcsPerSheet: '', process: 'Electroless' }); }}
            >
              <Plus size={16} />
              <span>Thêm item</span>
            </button>
          )}
        </div>
      </header>

      <div className="page-body">
        {errorMsg && <div className="alert-error">{errorMsg}</div>}

        {/* Search bar & Status filter */}
        <div className="filter-card">
          <div className="filter-group">
            <label className="filter-label">Tìm kiếm</label>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--gray-400)' }} />
              <input
                type="text"
                className="filter-input"
                placeholder="Item name hoặc Process..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 34, width: 260 }}
              />
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label">Trạng thái</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`btn ${statusFilter === 'active' ? 'btn-primary' : 'btn-outline'}`}
                style={{ height: 36, padding: '0 12px', fontSize: '0.8rem' }}
                onClick={() => setStatusFilter('active')}
              >
                Đang hoạt động
              </button>
              <button
                type="button"
                className={`btn ${statusFilter === 'deleted' ? 'btn-primary' : 'btn-outline'}`}
                style={{ height: 36, padding: '0 12px', fontSize: '0.8rem' }}
                onClick={() => setStatusFilter('deleted')}
              >
                Thùng rác (Đã xóa)
              </button>
            </div>
          </div>

          <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', fontSize: '0.83rem', color: 'var(--gray-500)' }}>
            <Map size={14} style={{ display: 'inline', marginRight: 4 }} />
            {mappings.length} items {statusFilter === 'deleted' && '(đã xóa)'}
          </div>
        </div>

        {/* Table */}
        <div className="table-card">
          <div className="table-wrapper">
            <table className="scan-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th style={{ textAlign: 'left', minWidth: 200 }}>Item name</th>
                  <th>Số pcs / sheet</th>
                  <th style={{ minWidth: 140 }}>Process</th>
                  {canManage && <th>Hành động</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={canManage ? 5 : 4} style={{ padding: 40, color: 'var(--gray-500)' }}>Đang tải...</td></tr>
                ) : mappings.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} style={{ padding: 40, color: 'var(--gray-400)' }}>
                      {statusFilter === 'deleted' ? 'Thùng rác trống (không có item nào bị xóa)' : 'Chưa có dữ liệu mapping'}
                    </td>
                  </tr>
                ) : (
                  mappings.map((m, idx) => (
                    <tr key={m.id} style={statusFilter === 'deleted' ? { opacity: 0.85, background: 'rgba(239, 68, 68, 0.03)' } : undefined}>
                      <td style={{ color: 'var(--gray-400)' }}>{idx + 1}</td>
                      <td style={{ textAlign: 'left', fontWeight: 600, fontFamily: 'monospace' }}>{m.item_name}</td>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{m.pcs_per_sheet}</td>
                      <td>
                        <span className={`badge ${m.process === 'Electroless' ? 'badge-success' : 'badge-gray'}`}>
                          {m.process}
                        </span>
                      </td>
                      {canManage && (
                        <td>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            {statusFilter === 'active' ? (
                              <>
                                <button
                                  className="btn btn-outline"
                                  style={{ height: 30, padding: '0 10px', fontSize: '0.78rem', gap: 4 }}
                                  onClick={() => openEdit(m)}
                                  title="Sửa"
                                >
                                  <Edit2 size={13} /> Sửa
                                </button>
                                <button
                                  className="btn"
                                  style={{ height: 30, padding: '0 10px', fontSize: '0.78rem', gap: 4, background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
                                  onClick={() => setDeleteTarget(m)}
                                  title="Xóa mềm"
                                >
                                  <Trash2 size={13} /> Xóa
                                </button>
                              </>
                            ) : (
                              <button
                                className="btn"
                                style={{ height: 30, padding: '0 12px', fontSize: '0.78rem', gap: 5, background: 'var(--success-bg, #ecfdf5)', color: 'var(--success, #059669)', border: '1px solid #10b981', fontWeight: 600 }}
                                onClick={() => handleRestore(m)}
                                title="Khôi phục lại item này"
                              >
                                <RotateCcw size={13} /> Khôi phục
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── ADD MODAL ── */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <span>Thêm item mapping mới</span>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-500)' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAdd}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {addError && <div className="alert-error">{addError}</div>}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Item name <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="text" className="form-input" placeholder="Ví dụ: 5CRPV" value={addForm.itemName}
                    onChange={e => setAddForm(f => ({ ...f, itemName: e.target.value }))} required autoFocus />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Số pcs / sheet <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="number" className="form-input" placeholder="Ví dụ: 72" min={1} value={addForm.pcsPerSheet}
                    onChange={e => setAddForm(f => ({ ...f, pcsPerSheet: e.target.value }))} required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Process <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    type="text"
                    list="process-options-list"
                    className="form-input"
                    placeholder="Chọn gợi ý hoặc gõ Process mới..."
                    value={addForm.process}
                    onChange={e => setAddForm(f => ({ ...f, process: e.target.value }))}
                    required
                  />
                  <datalist id="process-options-list">
                    {availableProcesses.map(p => <option key={p} value={p}>{p}</option>)}
                  </datalist>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowAddModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={adding}>
                  {adding ? 'Đang thêm...' : 'Thêm item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {editTarget && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <span>Sửa: <strong>{editTarget.item_name}</strong></span>
              <button onClick={() => setEditTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-500)' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {editError && <div className="alert-error">{editError}</div>}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Item name <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="text" className="form-input" value={editForm.itemName}
                    onChange={e => setEditForm(f => ({ ...f, itemName: e.target.value }))} required autoFocus />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Số pcs / sheet <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="number" className="form-input" min={1} value={editForm.pcsPerSheet}
                    onChange={e => setEditForm(f => ({ ...f, pcsPerSheet: e.target.value }))} required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Process <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    type="text"
                    list="process-options-list"
                    className="form-input"
                    placeholder="Chọn gợi ý hoặc gõ Process mới..."
                    value={editForm.process}
                    onChange={e => setEditForm(f => ({ ...f, process: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setEditTarget(null)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={editing}>
                  {editing ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL ── */}
      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span>Xác nhận xóa</span>
              <button onClick={() => setDeleteTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-500)' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--gray-700)', lineHeight: 1.6 }}>
                Bạn có chắc muốn xóa item <strong style={{ color: 'var(--danger)' }}>{deleteTarget.item_name}</strong>?
              </p>
              <p style={{ fontSize: '0.82rem', color: 'var(--gray-500)', marginTop: 8 }}>
                Dữ liệu sẽ được xóa mềm (soft delete) — có thể khôi phục nếu cần.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>Hủy</button>
              <button
                className="btn"
                style={{ background: 'var(--danger)', color: 'white' }}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
