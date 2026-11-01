import React, { useState, useEffect } from 'react';
import { User } from './types.js';
import { LoginPage } from './pages/LoginPage.js';
import { Scan4MPage } from './pages/Scan4MPage.js';
import { CVR4MPage } from './pages/CVR4MPage.js';
import { AccountsPage } from './pages/AccountsPage.js';
import { ItemMappingPage } from './pages/ItemMappingPage.js';
import { AuditPage } from './pages/AuditPage.js';
import { getMe, logout } from './api.js';
import { Sidebar } from './components/Sidebar.js';

type ActiveTab = 'scan4m' | 'cvr4m' | 'accounts' | 'mapping' | 'audit';

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('scan4m');
  const [visitedTabs, setVisitedTabs] = useState<Set<ActiveTab>>(new Set(['scan4m']));

  const selectTab = (tab: ActiveTab) => {
    setVisitedTabs(previous => new Set([...previous, tab]));
    setActiveTab(tab);
  };

  // Restore session on app load
  useEffect(() => {
    const storedToken = localStorage.getItem('scan4m_token');
    const storedUser = localStorage.getItem('scan4m_user');
    if (storedToken && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        getMe().then(user => { setUser(user); localStorage.setItem('scan4m_user',JSON.stringify(user)); }).catch(() => { setUser(null); });
      } catch {
        localStorage.removeItem('scan4m_token');
        localStorage.removeItem('scan4m_user');
      }
    }
  }, []);

  const handleLoginSuccess = (_token: string, loggedUser: User) => {
    setUser(loggedUser);
    setVisitedTabs(new Set(['scan4m']));
    setActiveTab('scan4m');
  };

  const handleLogout = async () => {
    try { await logout(); } catch (error) { alert(error instanceof Error ? error.message : 'Đăng xuất thất bại'); return; }
    localStorage.removeItem('scan4m_token');
    localStorage.removeItem('scan4m_user');
    setUser(null);
    setVisitedTabs(new Set(['scan4m']));
  };

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const canManageMapping = user.permissions.includes('mapping:manage');

  return (
    <div className="app-container">
      <Sidebar
        user={user}
        activeTab={activeTab}
        onSelectTab={selectTab}
        onLogout={handleLogout}
      />

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {visitedTabs.has('scan4m') && <div className="tab-panel" hidden={activeTab !== 'scan4m'}><Scan4MPage user={user} /></div>}
        {visitedTabs.has('cvr4m') && <div className="tab-panel" hidden={activeTab !== 'cvr4m'}><CVR4MPage user={user} /></div>}
        {visitedTabs.has('accounts') && <div className="tab-panel" hidden={activeTab !== 'accounts'}><AccountsPage /></div>}
        {visitedTabs.has('audit') && user.permissions.includes('audit:view') && <div className="tab-panel" hidden={activeTab !== 'audit'}><AuditPage /></div>}
        {visitedTabs.has('mapping') && <div className="tab-panel" hidden={activeTab !== 'mapping'}><ItemMappingPage canManage={canManageMapping} /></div>}
      </main>
    </div>
  );
};
