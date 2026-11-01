import React, { useState, useEffect, useCallback } from 'react';
import { AccountItem } from '../types.js';
import {
  getAccounts,
  createAccount,
  updateAccount,
  toggleAccount,
  resetAccountPassword
} from '../api.js';
import { Users, Plus, Lock, ToggleLeft, ToggleRight, X, Eye, EyeOff, Edit2 } from 'lucide-react';

// All configurable permissions
const ALL_PERMISSIONS = [
  { key: 'scan4m:manage', label: 'Loại bỏ / Khôi phục bản ghi Scan', group: 'Scan 4M' },
  { key: 'cvr4m:manage', label: 'Loại bỏ / Khôi phục bản ghi CVR', group: 'CVR 4M' },
  { key: 'cvr4m:view', label: 'Xem dữ liệu 4M CVR', group: 'CVR 4M' },
  { key: 'cvr4m:export', label: 'Export Excel 4M CVR', group: 'CVR 4M' },
  { key: 'scan4m:view',      label: 'Xem dữ liệu 4M Scan',            group: 'Scan 4M' },
  { key: 'scan4m:export',    label: 'Export Excel 4M Scan',            group: 'Scan 4M' },
  { key: 'mapping:view',     label: 'Xem bảng Item Mapping',           group: 'Mapping' },
  { key: 'mapping:manage',   label: 'Thêm / Sửa / Xóa Item Mapping',  group: 'Mapping' },
  { key: 'config:manage',    label: 'Quét dữ liệu (trigger scan)',     group: 'Hệ thống' },
  { key: 'accounts:manage',  label: 'Quản lý tài khoản (Admin)',       group: 'Hệ thống' },
  { key: 'audit:view',       label: 'Xem audit log',                   group: 'Hệ thống' },
];

const ADMIN_PERMISSIONS = ALL_PERMISSIONS.map(p => p.key);
const DEFAULT_USER_PERMISSIONS = ['scan4m:view', 'cvr4m:view', 'mapping:view'];

function groupPerms(perms: typeof ALL_PERMISSIONS) {
  const groups: Record<string, typeof ALL_PERMISSIONS> = {};
  for (const p of perms) {
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  }
  return groups;
}

export const AccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Create account modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: '', password: '', fullName: '', permissions: [...DEFAULT_USER_PERMISSIONS]
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit account modal
  const [editTarget, setEditTarget] = useState<AccountItem | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', permissions: [] as string[] });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<AccountItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await getAccounts();
      setAccounts(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tải danh sách tài khoản');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleToggle = async (acc: AccountItem) => {
    try {
      await toggleAccount(acc.id);
      setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, is_active: a.is_active === 1 ? 0 : 1 } : a));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Thao tác thất bại');
    }
  };

  const togglePerm = (perms: string[], key: string): string[] =>
    perms.includes(key) ? perms.filter(p => p !== key) : [...perms, key];

  const isAdmin = (perms: string[]) => perms.includes('accounts:manage');

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const roleName = isAdmin(createForm.permissions) ? 'ADMIN' : 'USER';
      await createAccount({
        username: createForm.username,
        password: createForm.password,
        fullName: createForm.fullName,
        roleName,
        permissions: createForm.permissions
      });
      setShowCreateModal(false);
      setCreateForm({ username: '', password: '', fullName: '', permissions: [...DEFAULT_USER_PERMISSIONS] });
      await fetchAccounts();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Tạo tài khoản thất bại');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (acc: AccountItem) => {
    setEditTarget(acc);
    setEditForm({ fullName: acc.full_name, permissions: acc.permissions || [] });
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditError(null);
    setEditSaving(true);
    try {
      await updateAccount(editTarget.id, { fullName: editForm.fullName, permissions: editForm.permissions });
      setEditTarget(null);
      await fetchAccounts();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Cập nhật thất bại');
    } finally {
      setEditSaving(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError(null);
    setResetting(true);
    try {
      await resetAccountPassword(resetTarget.id, newPassword);
      setResetTarget(null);
      setNewPassword('');
      alert('Đặt lại mật khẩu thành công');
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Đặt lại mật khẩu thất bại');
    } finally {
      setResetting(false);
    }
  };

  const grouped = groupPerms(ALL_PERMISSIONS);

  const PermCheckboxes = ({ perms, onChange }: { perms: string[]; onChange: (p: string[]) => void }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Tick All = Admin shortcut */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--gray-200)', marginBottom: 4, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={ADMIN_PERMISSIONS.every(k => perms.includes(k))}
          onChange={e => onChange(e.target.checked ? [...ADMIN_PERMISSIONS] : [...DEFAULT_USER_PERMISSIONS])}
        />
        <span style={{ fontWeight: 700, color: 'var(--danger)' }}>Tick tất cả = ADMIN (toàn quyền)</span>
      </label>

      {Object.entries(grouped).map(([group, items]) => (
        <div key={group} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            {group}
          </div>
          {items.map(p => (
            <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={perms.includes(p.key)}
                onChange={() => onChange(togglePerm(perms, p.key))}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--gray-800)' }}>{p.label}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="main-content">
      <header className="top-bar">
        <div>
          <h2 className="page-title">Quản lý Tài khoản</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
            Tạo, phân quyền, khóa/mở và đặt lại mật khẩu tài khoản
          </p>
        </div>
        <div className="top-actions">
          <button className="btn btn-primary" onClick={() => { setShowCreateModal(true); setCreateError(null); }}>
            <Plus size={16} />
            <span>Thêm tài khoản</span>
          </button>
        </div>
      </header>

      <div className="page-body">
        {errorMsg && <div className="alert-error">{errorMsg}</div>}

        <div className="table-card">
          <div className="table-wrapper">
            <table className="scan-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Tên đăng nhập</th>
                  <th>Họ và tên</th>
                  <th>Vai trò</th>
                  <th style={{ minWidth: 300, textAlign: 'left' }}>Quyền</th>
                  <th>Ngày tạo</th>
                  <th>Trạng thái</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ padding: 40, color: 'var(--gray-500)' }}>Đang tải danh sách tài khoản...</td></tr>
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 40, color: 'var(--gray-500)' }}>
                      <Users size={32} style={{ opacity: 0.3, marginBottom: 8 }} /><br />
                      Chưa có tài khoản nào
                    </td>
                  </tr>
                ) : (
                  accounts.map((acc, idx) => (
                    <tr key={acc.id}>
                      <td style={{ color: 'var(--gray-400)' }}>{idx + 1}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{acc.username}</td>
                      <td className="text-left">{acc.full_name}</td>
                      <td>
                        <span className={`badge ${acc.role_name === 'ADMIN' ? 'badge-danger' : 'badge-gray'}`} style={{ fontWeight: 700 }}>
                          {acc.role_name}
                        </span>
                      </td>
                      <td style={{ textAlign: 'left', padding: '6px 14px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(acc.permissions || []).map(p => {
                            const meta = ALL_PERMISSIONS.find(x => x.key === p);
                            return (
                              <span key={p} className="badge badge-gray" style={{ fontSize: '0.7rem' }}>
                                {meta?.label || p}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td>{acc.created_at ? acc.created_at.slice(0, 10) : '-'}</td>
                      <td>
                        <span className={`badge ${acc.is_active === 1 ? 'badge-success' : 'badge-warning'}`}>
                          {acc.is_active === 1 ? 'Đang hoạt động' : 'Đã khóa'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button className="btn btn-outline" style={{ height: 30, padding: '0 10px', fontSize: '0.78rem', gap: 4 }}
                            onClick={() => openEdit(acc)} title="Sửa thông tin & quyền">
                            <Edit2 size={13} /> Sửa
                          </button>
                          <button className="btn btn-outline" style={{ height: 30, padding: '0 10px', fontSize: '0.78rem', gap: 4 }}
                            onClick={() => handleToggle(acc)} disabled={acc.username === 'admin'}
                            title={acc.username === 'admin' ? 'Không thể khóa tài khoản admin' : ''}>
                            {acc.is_active === 1 ? <><ToggleRight size={14} /> Khóa</> : <><ToggleLeft size={14} /> Mở</>}
                          </button>
                          <button className="btn btn-outline" style={{ height: 30, padding: '0 10px', fontSize: '0.78rem', gap: 4 }}
                            onClick={() => { setResetTarget(acc); setNewPassword(''); setResetError(null); }}>
                            <Lock size={14} /> Đặt lại MK
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── CREATE ACCOUNT MODAL (no outside-click close) ── */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <span>Thêm tài khoản mới</span>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-500)' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
                {createError && <div className="alert-error">{createError}</div>}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Tên đăng nhập <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="text" className="form-input" placeholder="Ví dụ: nguyen_van_a"
                    value={createForm.username} onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))} required autoFocus />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Họ và tên <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="text" className="form-input" placeholder="Ví dụ: Nguyễn Văn A"
                    value={createForm.fullName} onChange={e => setCreateForm(f => ({ ...f, fullName: e.target.value }))} required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Mật khẩu <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="password" className="form-input" placeholder="Ít nhất 6 ký tự"
                    value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} required minLength={6} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ marginBottom: 8, display: 'block' }}>Phân quyền <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: '10px 14px' }}>
                    <PermCheckboxes perms={createForm.permissions} onChange={p => setCreateForm(f => ({ ...f, permissions: p }))} />
                  </div>
                  {isAdmin(createForm.permissions) && (
                    <div style={{ marginTop: 6, padding: '4px 10px', background: 'var(--danger-bg)', borderRadius: 6, fontSize: '0.78rem', color: 'var(--danger)' }}>
                      ⚠ Tài khoản này sẽ là ADMIN với toàn bộ quyền hệ thống
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowCreateModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Đang tạo...' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT ACCOUNT MODAL (no outside-click close) ── */}
      {editTarget && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <span>Sửa tài khoản: <strong>{editTarget.username}</strong></span>
              <button onClick={() => setEditTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-500)' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
                {editError && <div className="alert-error">{editError}</div>}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Họ và tên <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="text" className="form-input" value={editForm.fullName}
                    onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))} required autoFocus />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ marginBottom: 8, display: 'block' }}>Phân quyền</label>
                  <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: '10px 14px' }}>
                    <PermCheckboxes perms={editForm.permissions} onChange={p => setEditForm(f => ({ ...f, permissions: p }))} />
                  </div>
                  {isAdmin(editForm.permissions) && (
                    <div style={{ marginTop: 6, padding: '4px 10px', background: 'var(--danger-bg)', borderRadius: 6, fontSize: '0.78rem', color: 'var(--danger)' }}>
                      ⚠ Tài khoản này sẽ có vai trò ADMIN
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setEditTarget(null)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>
                  {editSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── RESET PASSWORD MODAL (no outside-click close) ── */}
      {resetTarget && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <span>Đặt lại mật khẩu: <strong>{resetTarget.username}</strong></span>
              <button onClick={() => setResetTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-500)' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleResetSubmit}>
              <div className="modal-body">
                {resetError && <div className="alert-error">{resetError}</div>}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Mật khẩu mới <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Ít nhất 6 ký tự"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      required minLength={6} autoFocus
                      style={{ paddingRight: 40 }}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      style={{ position: 'absolute', right: 10, top: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)' }}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setResetTarget(null)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={resetting}>
                  {resetting ? 'Đang đặt lại...' : 'Xác nhận'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
