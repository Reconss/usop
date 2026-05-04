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

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json();
    
    if (!response.ok) {
      // 401 未授权，跳转到登录页
      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        throw new Error('登录已过期，请重新登录');
      }
      throw new Error(data.error || `请求失败 (${response.status})`);
    }
    
    return data;
  } catch (error) {
    console.error(`API Error [${options.method || 'GET'} ${endpoint}]:`, error);
    throw error;
  }
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

// Dashboard API
export const dashboardApi = {
  getMetrics: () => request('/dashboard-api/metrics'),
  getAlertsTrend: (days?: number) => request(`/dashboard-api/alerts-trend?days=${days || 7}`),
  getEventDistribution: () => request('/dashboard-api/event-distribution'),
  getTopAlerts: (limit?: number) => request(`/dashboard-api/top-alerts?limit=${limit || 10}`),
};

// Alerts API (使用 events API 作为后端)
export const alertsApi = {
  getAlerts: (params?: { page?: number; page_size?: number; severity?: string; status?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.severity) searchParams.append('severity', params.severity);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.search) searchParams.append('search', params.search);
    return request(`/event-actions-api/events?${searchParams.toString()}`);
  },
  
  getAlert: (id: string | number) => request(`/event-actions-api/events/${id}`),
  updateAlert: (id: number, data: any) => request(`/event-actions-api/events/${id}`, { method: 'PUT', body: data }),
  deleteAlert: (id: number) => request(`/event-actions-api/events/${id}`, { method: 'DELETE' }),
};

// Assets API
export const assetsApi = {
  getAssets: (params?: { page?: number; page_size?: number; type?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.type) searchParams.append('type', params.type);
    if (params?.search) searchParams.append('search', params.search);
    return request(`/assets-api/assets?${searchParams.toString()}`);
  },
  
  getAsset: (id: number) => request(`/assets-api/assets/${id}`),
  createAsset: (data: any) => request('/assets-api/assets', { method: 'POST', body: data }),
  updateAsset: (id: number, data: any) => request(`/assets-api/assets/${id}`, { method: 'PUT', body: data }),
  deleteAsset: (id: number) => request(`/assets-api/assets/${id}`, { method: 'DELETE' }),
};

// Scans API
export const scansApi = {
  getScans: (params?: { page?: number; page_size?: number; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.status) searchParams.append('status', params.status);
    return request(`/scans-api/scans?${searchParams.toString()}`);
  },
  
  getScan: (id: number) => request(`/scans-api/scans/${id}`),
  createScan: (data: any) => request('/scans-api/scans', { method: 'POST', body: data }),
  startScan: (id: number) => request(`/scans-api/scans/${id}/start`, { method: 'POST' }),
  stopScan: (id: number) => request(`/scans-api/scans/${id}/stop`, { method: 'POST' }),
};

// Rules API
export const rulesApi = {
  getRules: (params?: { page?: number; page_size?: number; type?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.type) searchParams.append('type', params.type);
    if (params?.search) searchParams.append('search', params.search);
    return request(`/rules-api/rules?${searchParams.toString()}`);
  },
  
  getRule: (id: number) => request(`/rules-api/rules/${id}`),
  createRule: (data: any) => request('/rules-api/rules', { method: 'POST', body: data }),
  updateRule: (id: number, data: any) => request(`/rules-api/rules/${id}`, { method: 'PUT', body: data }),
  deleteRule: (id: number) => request(`/rules-api/rules/${id}`, { method: 'DELETE' }),
  toggleRule: (id: number) => request(`/rules-api/rules/${id}/toggle`, { method: 'POST' }),
};

// Playbooks API
export const playbooksApi = {
  getPlaybooks: (params?: { page?: number; page_size?: number; category?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.category) searchParams.append('category', params.category);
    return request(`/playbooks-api/playbooks?${searchParams.toString()}`);
  },
  
  getPlaybook: (id: number) => request(`/playbooks-api/playbooks/${id}`),
  createPlaybook: (data: any) => request('/playbooks-api/playbooks', { method: 'POST', body: data }),
  updatePlaybook: (id: number, data: any) => request(`/playbooks-api/playbooks/${id}`, { method: 'PUT', body: data }),
  deletePlaybook: (id: number) => request(`/playbooks-api/playbooks/${id}`, { method: 'DELETE' }),
  executePlaybook: (id: string | number, data?: any) => request(`/playbooks-api/playbooks/${id}/execute`, { method: 'POST', body: data }),
};

// Hunting API
export const huntingApi = {
  getQueries: (params?: { page?: number; page_size?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    return request(`/hunting-api/queries?${searchParams.toString()}`);
  },
  
  createQuery: (data: any) => request('/hunting-api/queries', { method: 'POST', body: data }),
  getQueryResults: (id: number) => request(`/hunting-api/queries/${id}/results`),
  deleteQuery: (id: number) => request(`/hunting-api/queries/${id}`, { method: 'DELETE' }),
  executeQuery: (id: number) => request(`/hunting-api/queries/${id}/execute`, { method: 'POST' }),
};

// Vulnerabilities API
export const vulnerabilitiesApi = {
  getVulnerabilities: (params?: { page?: number; page_size?: number; severity?: string; type?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.severity) searchParams.append('severity', params.severity);
    if (params?.type) searchParams.append('type', params.type);
    return request(`/vulnerabilities-api/vulnerabilities?${searchParams.toString()}`);
  },
  
  getVulnerability: (id: number) => request(`/vulnerabilities-api/vulnerabilities/${id}`),
  createVulnerability: (data: any) => request('/vulnerabilities-api/vulnerabilities', { method: 'POST', body: data }),
  updateVulnerability: (id: number, data: any) => request(`/vulnerabilities-api/vulnerabilities/${id}`, { method: 'PUT', body: data }),
};

// Audit Logs API
export const auditApi = {
  getLogs: (params?: { page?: number; page_size?: number; module?: string; action?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.module) searchParams.append('module', params.module);
    if (params?.action) searchParams.append('action', params.action);
    return request(`/audit-logs-api/logs?${searchParams.toString()}`);
  },
};

// Data Sources API
export const dataSourcesApi = {
  getDataSources: (params?: { page?: number; page_size?: number; type?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.type) searchParams.append('type', params.type);
    return request(`/datasources-api/datasources?${searchParams.toString()}`);
  },
  
  getDataSource: (id: number) => request(`/datasources-api/datasources/${id}`),
  createDataSource: (data: any) => request('/datasources-api/datasources', { method: 'POST', body: data }),
  updateDataSource: (id: number, data: any) => request(`/datasources-api/datasources/${id}`, { method: 'PUT', body: data }),
  deleteDataSource: (id: number) => request(`/datasources-api/datasources/${id}`, { method: 'DELETE' }),
  testConnection: (id: number) => request(`/datasources-api/datasources/${id}/test`, { method: 'POST' }),
};

// Log Types API
export const logTypesApi = {
  getLogTypes: (params?: { page?: number; page_size?: number; category?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.category) searchParams.append('category', params.category);
    return request(`/log-types-api/log-types?${searchParams.toString()}`);
  },
  
  createLogType: (data: any) => request('/log-types-api/log-types', { method: 'POST', body: data }),
  updateLogType: (id: number, data: any) => request(`/log-types-api/log-types/${id}`, { method: 'PUT', body: data }),
  deleteLogType: (id: number) => request(`/log-types-api/log-types/${id}`, { method: 'DELETE' }),
};

// AI API
export const aiApi = {
  getModels: (params?: { page?: number; page_size?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    return request(`/ai-api/models?${searchParams.toString()}`);
  },
  
  getModel: (id: number) => request(`/ai-api/models/${id}`),
  createModel: (data: any) => request('/ai-api/models', { method: 'POST', body: data }),
  updateModel: (id: number, data: any) => request(`/ai-api/models/${id}`, { method: 'PUT', body: data }),
  deleteModel: (id: number) => request(`/ai-api/models/${id}`, { method: 'DELETE' }),
  getInsights: () => request('/ai-api/insights'),
  getTasks: (params?: { page?: number; page_size?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    return request(`/ai-api/tasks?${searchParams.toString()}`);
  },
};

// Products API
export const productsApi = {
  getProducts: (params?: { page?: number; page_size?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    return request(`/products-api/products?${searchParams.toString()}`);
  },
};

// Notifications API
export const notificationsApi = {
  getNotifications: () => request('/notifications'),
  markAsRead: (id: number) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllAsRead: () => request('/notifications/mark-all-read', { method: 'POST' }),
  deleteNotification: (id: number) => request(`/notifications/${id}`, { method: 'DELETE' }),
};

// Event Actions API (事件处置记录)
export const eventActionsApi = {
  // 获取事件的处置记录列表
  getEventActions: (eventId: string) => request(`/event-actions-api/events/${eventId}/actions`),

  // 添加处置记录
  createEventAction: (eventId: string, data: {
    action: string;
    content?: string;
    assignee?: string;
    previousStatus?: string;
    newStatus?: string;
    previousSeverity?: string;
    newSeverity?: string;
    metadata?: Record<string, any>;
  }) => request(`/event-actions-api/events/${eventId}/actions`, { method: 'POST', body: data }),

  // 更新处置记录
  updateEventAction: (eventId: string, actionId: string, data: any) =>
    request(`/event-actions-api/events/${eventId}/actions/${actionId}`, { method: 'PUT', body: data }),

  // 删除处置记录
  deleteEventAction: (eventId: string, actionId: string) =>
    request(`/event-actions-api/events/${eventId}/actions/${actionId}`, { method: 'DELETE' }),

  // 获取事件列表
  getEvents: (params?: { page?: number; page_size?: number; severity?: string; status?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.severity) searchParams.append('severity', params.severity);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.search) searchParams.append('search', params.search);
    return request(`/event-actions-api/events?${searchParams.toString()}`);
  },

  // 获取事件详情
  getEvent: (eventId: string) => request(`/event-actions-api/events/${eventId}`),

  // 创建事件
  createEvent: (data: {
    title: string;
    description?: string;
    severity?: string;
    event_type?: string;
    source_ip?: string;
  }) => request('/event-actions-api/events', { method: 'POST', body: data }),

  // 更新事件
  updateEvent: (eventId: string, data: any) =>
    request(`/event-actions-api/events/${eventId}`, { method: 'PUT', body: data }),

  // 更新事件状态
  updateEventStatus: (eventId: string, status: string, reason?: string) =>
    request(`/event-actions-api/events/${eventId}/status`, { method: 'PUT', body: { status, reason } }),

  // 删除事件
  deleteEvent: (eventId: string) =>
    request(`/event-actions-api/events/${eventId}`, { method: 'DELETE' }),

  // 执行剧本
  executePlaybook: (eventId: string, playbookId: string | number) =>
    request(`/event-actions-api/events/${eventId}/playbooks/${playbookId}/execute`, { method: 'POST', body: {} }),

  // 获取可用剧本
  getEventPlaybooks: (eventId: string) =>
    request(`/event-actions-api/events/${eventId}/playbooks`),

  // 获取事件统计
  getEventStats: () => request('/event-actions-api/events/stats'),

  // 批量更新状态
  batchUpdateStatus: (eventIds: string[], status: string) =>
    request('/event-actions-api/events/batch/status', { method: 'PUT', body: { event_ids: eventIds, status } }),

  // 批量删除
  batchDelete: (eventIds: string[]) =>
    request('/event-actions-api/events/batch', { method: 'DELETE', body: { event_ids: eventIds } }),
};
