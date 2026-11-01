import React, { useState } from 'react';
import { login } from '../api.js';
import { User } from '../types.js';
import { Database, Lock, User as UserIcon } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (token: string, user: User) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await login(username, password);
      localStorage.setItem('scan4m_token', data.token);
      localStorage.setItem('scan4m_user', JSON.stringify(data.user));
      onLoginSuccess(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập không thành công');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-header">
          <div style={{
            background: 'var(--primary)',
            width: 48,
            height: 48,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px'
          }}>
            <Database size={26} color="white" />
          </div>
          <h2 style={{ fontSize: '1.28rem', fontWeight: 700, lineHeight: 1.35, color: 'var(--gray-900)' }}>
            4M Report Management & Aggregation System
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--gray-500)', marginTop: 8 }}>
            Hệ thống Quản lý & Tổng hợp Báo cáo 4M - Phòng AOM
          </p>
        </div>

        {error && <div className="alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Tên đăng nhập</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Nhập username (admin / user)"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
                style={{ paddingLeft: 38 }}
              />
              <UserIcon size={18} color="var(--gray-400)" style={{ position: 'absolute', left: 12, top: 12 }} />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 24 }}>
            <label>Mật khẩu</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                className="form-input"
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ paddingLeft: 38 }}
              />
              <Lock size={18} color="var(--gray-400)" style={{ position: 'absolute', left: 12, top: 12 }} />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', height: 42, justifyContent: 'center' }}
          >
            {loading ? 'Đang xác thực...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
};
