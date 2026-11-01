import { User, Scan4MRecord, DashboardStats, AccountItem } from './types.js';

const BASE_URL = '/api/v1';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('scan4m_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...options.headers
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    localStorage.removeItem('scan4m_token');
    localStorage.removeItem('scan4m_user');
    window.location.href = '#/login';
    throw new Error('Phiên đăng nhập đã hết hạn');
  }

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error?.message || 'Yêu cầu thất bại');
  }

  return data.data;
}

// Auth API
export async function login(username: string, password: string): Promise<{ token: string; user: User }> {
  return request<{ token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

export async function getMe(): Promise<User> {
  return request<User>('/auth/me');
}

// Scan 4M API
export async function getScan4mRecords(params: {
  page: number;
  pageSize: number;
  visibility?: 'active' | 'excluded';
  date?: string;
  fromDate?: string;
  toDate?: string;
  shift?: string;
  machine?: string;
  matchStatus?: string;
  search?: string;
}): Promise<{ records: Scan4MRecord[]; pagination: { total: number; totalPages: number } }> {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('pageSize', String(params.pageSize));
  if (params.visibility) query.set('visibility',params.visibility);
  if (params.date) query.set('date', params.date);
  if (params.fromDate) query.set('fromDate', params.fromDate);
  if (params.toDate) query.set('toDate', params.toDate);
  if (params.shift) query.set('shift', params.shift);
  if (params.machine) query.set('machine', params.machine);
  if (params.matchStatus) query.set('matchStatus', params.matchStatus);
  if (params.search) query.set('search', params.search);

  return request(`/scan4m/records?${query.toString()}`);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return request<DashboardStats>('/scan4m/stats');
}

export async function triggerScan(): Promise<{ filesProcessed: number; errors: number }> {
  return request<{ filesProcessed: number; errors: number }>('/scan4m/trigger-scan', {
    method: 'POST'
  });
}

// Download Excel directly in browser
export async function downloadExcelExport(params: {
  date?: string;
  fromDate?: string;
  toDate?: string;
  shift?: string;
  machine?: string;
  matchStatus?: string;
  search?: string;
}): Promise<void> {
  const query = new URLSearchParams();
  if (params.date) query.set('date', params.date);
  if (params.fromDate) query.set('fromDate', params.fromDate);
  if (params.toDate) query.set('toDate', params.toDate);
  if (params.shift) query.set('shift', params.shift);
  if (params.machine) query.set('machine', params.machine);
  if (params.matchStatus) query.set('matchStatus', params.matchStatus);
  if (params.search) query.set('search', params.search);

  const token = localStorage.getItem('scan4m_token');
  const response = await fetch(`${BASE_URL}/scan4m/export?${query.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Bạn không có quyền tải file Excel (Chỉ tài khoản Admin)');
    }
    throw new Error('Không thể tạo file Excel');
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  const contentDisp = response.headers.get('content-disposition');
  let filename = 'Form_Scan_4M.xlsx';
  if (contentDisp && contentDisp.includes('filename=')) {
    filename = contentDisp.split('filename=')[1].replace(/["']/g, '');
  }
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

// Accounts API (Admin)
export async function getAccounts(): Promise<AccountItem[]> {
  return request<AccountItem[]>('/accounts');
}

export async function createAccount(data: {
  username: string;
  password: string;
  fullName: string;
  roleName: 'ADMIN' | 'USER';
  permissions?: string[];
}): Promise<void> {
  return request('/accounts', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function toggleAccount(id: string): Promise<{ isActive: number }> {
  return request<{ isActive: number }>(`/accounts/${id}/toggle`, {
    method: 'PATCH'
  });
}

export async function resetAccountPassword(id: string, newPassword: string): Promise<void> {
  return request(`/accounts/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ newPassword })
  });
}

export async function updateAccount(id: string, data: { fullName: string; permissions: string[] }): Promise<void> {
  return request(`/accounts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

// Item Mapping API
export async function getMappings(search?: string, status?: 'active' | 'deleted'): Promise<import('./types.js').ItemMapping[]> {
  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (status) query.set('status', status);
  return request(`/mapping?${query.toString()}`);
}

export async function createMapping(data: { itemName: string; pcsPerSheet: number; process: string }): Promise<void> {
  return request('/mapping', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateMapping(id: string, data: { itemName: string; pcsPerSheet: number; process: string }): Promise<void> {
  return request(`/mapping/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteMapping(id: string): Promise<void> {
  return request(`/mapping/${id}`, { method: 'DELETE' });
}

export async function restoreMapping(id: string): Promise<void> {
  return request(`/mapping/${id}/restore`, { method: 'POST' });
}

// CVR 4M API
export async function getCvr4mRecords(params: {
  page: number;
  pageSize: number;
  visibility?: 'active' | 'excluded';
  date?: string;
  fromDate?: string;
  toDate?: string;
  shift?: string;
  machine?: string;
  matchStatus?: string;
  search?: string;
}): Promise<{ records: import('./types.js').Cvr4mRecord[]; pagination: { total: number; totalPages: number } }> {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('pageSize', String(params.pageSize));
  if (params.visibility) query.set('visibility',params.visibility);
  if (params.date) query.set('date', params.date);
  if (params.fromDate) query.set('fromDate', params.fromDate);
  if (params.toDate) query.set('toDate', params.toDate);
  if (params.shift) query.set('shift', params.shift);
  if (params.machine) query.set('machine', params.machine);
  if (params.matchStatus) query.set('matchStatus', params.matchStatus);
  if (params.search) query.set('search', params.search);

  return request(`/cvr4m/records?${query.toString()}`);
}

export async function getCvrDashboardStats(): Promise<import('./types.js').CvrDashboardStats> {
  return request<import('./types.js').CvrDashboardStats>('/cvr4m/stats');
}

export async function downloadCvrExcelExport(params: {
  date?: string;
  fromDate?: string;
  toDate?: string;
  shift?: string;
  machine?: string;
  matchStatus?: string;
  search?: string;
}): Promise<void> {
  const query = new URLSearchParams();
  if (params.date) query.set('date', params.date);
  if (params.fromDate) query.set('fromDate', params.fromDate);
  if (params.toDate) query.set('toDate', params.toDate);
  if (params.shift) query.set('shift', params.shift);
  if (params.machine) query.set('machine', params.machine);
  if (params.matchStatus) query.set('matchStatus', params.matchStatus);
  if (params.search) query.set('search', params.search);

  const token = localStorage.getItem('scan4m_token');
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const response = await fetch(`${BASE_URL}/cvr4m/export?${query.toString()}`, {
    headers
  });

  if (!response.ok) {
    throw new Error('Không thể tải file xuất Excel');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `CVR_4M_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}



export async function setRecordExcluded(report: 'scan4m' | 'cvr4m', id: string, excluded: boolean, reason: string): Promise<void> {
  return request('/' + report + '/records/' + encodeURIComponent(id) + (excluded ? '/exclude' : '/restore'), {
    method: 'POST',body: JSON.stringify({ reason })
  });
}
export async function logout(): Promise<void> { return request('/auth/logout',{ method:'POST' }); }
export async function getAuditLogs(params: { page: number; pageSize: number; search?: string; action?: string; from?: string; to?: string }): Promise<{
  records: import('./types.js').AuditRecord[]; pagination: { total: number; totalPages: number }
}> {
  const query = new URLSearchParams();
  for (const [key,value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key,String(value));
  return request('/audit?' + query.toString());
}
