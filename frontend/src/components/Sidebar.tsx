import React from 'react';
import { User } from '../types.js';
import { Users, LogOut, Database, FileSpreadsheet, Map } from 'lucide-react';

interface SidebarProps {
  user: User;
  activeTab: 'scan4m' | 'cvr4m' | 'accounts' | 'mapping' | 'audit';
  onSelectTab: (tab: 'scan4m' | 'cvr4m' | 'accounts' | 'mapping' | 'audit') => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ user, activeTab, onSelectTab, onLogout }) => {
  const isAdmin = user.permissions.includes('accounts:manage');
  const canViewMapping = user.permissions.includes('mapping:view') || user.permissions.includes('mapping:manage');
  const canViewCvr = user.permissions.includes('cvr4m:view');

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div style={{ background: 'var(--primary)', padding: 7, borderRadius: 8, display: 'flex' }}>
          <Database size={22} color="white" />
        </div>
        <div>
          <h1 style={{ fontSize: '0.98rem', fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1.2 }}>4M REPORT</h1>
          <p style={{ fontSize: '0.68rem', color: 'var(--gray-400)', fontWeight: 500 }}>AOM Management Hub</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Dashboard 4M</div>
        <button
          className={`nav-item ${activeTab === 'scan4m' ? 'active' : ''}`}
          onClick={() => onSelectTab('scan4m')}
        >
          <FileSpreadsheet size={18} />
          <span>4M Scan</span>
        </button>

        {canViewCvr && (
          <button
            className={`nav-item ${activeTab === 'cvr4m' ? 'active' : ''}`}
            onClick={() => onSelectTab('cvr4m')}
          >
            <FileSpreadsheet size={18} />
            <span>4M CVR</span>
          </button>
        )}

        {/* Mapping — visible to users with mapping:view or mapping:manage */}
        {canViewMapping && (
          <>
            <div className="nav-section-label" style={{ marginTop: 14 }}>DỮ LIỆU</div>
            <button
              className={`nav-item ${activeTab === 'mapping' ? 'active' : ''}`}
              onClick={() => onSelectTab('mapping')}
            >
              <Map size={18} />
              <span>Item Mapping</span>
            </button>
          </>
        )}

        {isAdmin && (
          <>
            <div className="nav-section-label" style={{ marginTop: 14 }}>HỆ THỐNG</div>
            <button
              className={`nav-item ${activeTab === 'accounts' ? 'active' : ''}`}
              onClick={() => onSelectTab('accounts')}
            >
              <Users size={18} />
              <span>Quản lý tài khoản</span>
            </button>
          </>
        )}
        {user.permissions.includes('audit:view') && <button className={'nav-item ' + (activeTab === 'audit' ? 'active' : '')} onClick={() => onSelectTab('audit')}>
          <FileSpreadsheet size={18} /><span>Lịch sử thao tác</span>
        </button>}
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <span className="user-name">{user.fullName || user.username}</span>
          <span className="user-role">{user.roleName}</span>
        </div>
        <button
          onClick={onLogout}
          title="Đăng xuất"
          style={{ background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', padding: 6 }}
        >
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
};
