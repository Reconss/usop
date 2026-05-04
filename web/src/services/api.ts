const API_BASE = 'http://localhost:5002/api';

interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

export async function request<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }
  
  return data;
}

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    request('/auth/login', { method: 'POST', body: { username, password } }),
  
  logout: () =>
    request('/auth/logout', { method: 'POST' }),
  
  getProfile: () =>
    request('/auth/me'),
  
  changePassword: (oldPassword: string, newPassword: string) =>
    request('/auth/change-password', {
      method: 'POST',
      body: { oldPassword, newPassword }
    }),
};

// User API
export const userApi = {
  getUsers: (params?: { page?: number; page_size?: number; search?: string; role?: string; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.search) searchParams.append('search', params.search);
    if (params?.role) searchParams.append('role', params.role);
    if (params?.status) searchParams.append('status', params.status);
    return request(`/users-api/users?${searchParams.toString()}`);
  },
  
  getUser: (id: number) =>
    request(`/users-api/users/${id}`),
  
  createUser: (data: any) =>
    request('/users-api/users', { method: 'POST', body: data }),
  
  updateUser: (id: number, data: any) =>
    request(`/users-api/users/${id}`, { method: 'PUT', body: data }),
  
  deleteUser: (id: number) =>
    request(`/users-api/users/${id}`, { method: 'DELETE' }),
  
  toggleStatus: (id: number) =>
    request(`/users-api/users/${id}/toggle-status`, { method: 'POST' }),
  
  resetPassword: (id: number, password: string) =>
    request(`/users-api/users/${id}/reset-password`, {
      method: 'POST',
      body: { password }
    }),
};
