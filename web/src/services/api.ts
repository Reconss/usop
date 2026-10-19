// API 基础路径配置
// 开发环境：优先走 webpack 代理（同源），失败时 fallback 到后端直连
const API_BASE = '/api';
const BACKEND_FALLBACK = 'http://localhost:5001';

/** 原始 fetch（附件上传/下载用）：同源代理优先，失败回退直连后端 */
async function rawApiFetch(path: string, init: { method?: string; body?: any; token?: string | null }): Promise<Response> {
  const headers: Record<string, string> = {};
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  try {
    return await fetch(`${API_BASE}${path}`, { method: init.method || 'GET', headers, body: init.body });
  } catch {
    return fetch(`${BACKEND_FALLBACK}${API_BASE}${path}`, { method: init.method || 'GET', headers, body: init.body });
  }
}

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

  const fetchOptions = {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  };

  // 尝试通过代理请求（同源），失败则 fallback 到直连后端
  let response: Response;
  let useDirectConnect = false;
  
  try {
    response = await fetch(`${API_BASE}${endpoint}`, fetchOptions);
  } catch (proxyError) {
    // 代理不可用时（如 IDE 预览环境），直接连接后端
    useDirectConnect = true;
    try {
      response = await fetch(`${BACKEND_FALLBACK}${API_BASE}${endpoint}`, fetchOptions);
    } catch (directError) {
      throw new Error(`无法连接后端服务 (${BACKEND_FALLBACK})`);
    }
  }

  // 检查响应是否为HTML（代理失败）
  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text();
  
  if (responseText.startsWith('<') && !responseText.startsWith('[{')) {
    // 返回的是HTML而不是JSON，说明代理或直连都失败了
    console.error('API代理失败，请求返回HTML:', responseText.substring(0, 200));
    throw new Error(`无法连接到API服务，请确保后端服务运行在 ${useDirectConnect ? BACKEND_FALLBACK : 'localhost:5001'}`);
  }
  
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    // 非JSON响应（如代理错误页），返回原始文本
    throw new Error(responseText.substring(0, 200) || `请求失败 (${response.status})`);
  }
  
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new CustomEvent('auth:expired'));
      throw new Error('登录已过期，请重新登录');
    }
    // 带上后端结构化错误（如剧本入参校验的 code/missing/invalid），便于前端精确提示
    const err: any = new Error(data.error || `请求失败 (${response.status})`);
    err.status = response.status;
    err.payload = data;
    throw err;
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


// System Status API
export const systemStatusApi = {
  getStorageStatus: () => request('/system-status/storage-status'),
  getDataFlowStatus: () => request('/system-status/data-flow-status'),
  getQuickStats: () => request('/system-status/quick-stats'),
};

// Dashboard API
export const dashboardApi = {
  getMetrics: () => request('/dashboard-api/metrics'),
  getAlertsTrend: (days?: number) => request(`/dashboard-api/event-trend?days=${days || 7}`),
  getEventDistribution: () => request('/dashboard-api/event-types'),
  getTopAlerts: (limit?: number) => request(`/dashboard-api/recent-alerts?limit=${limit || 10}`),
};

// Alerts API (使用 Elasticsearch 存储)
export const alertsApi = {
  getAlerts: (params?: {
    page?: number;
    page_size?: number;
    severity?: string;
    status?: string;
    search?: string;
    source?: string;
    src_ip?: string;
    dst_ip?: string;
    start_time?: string;
    end_time?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.severity) searchParams.append('severity', params.severity);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.search) searchParams.append('search', params.search);
    if (params?.source) searchParams.append('source', params.source);
    if (params?.src_ip) searchParams.append('src_ip', params.src_ip);
    if (params?.dst_ip) searchParams.append('dst_ip', params.dst_ip);
    if (params?.start_time) searchParams.append('start_time', params.start_time);
    if (params?.end_time) searchParams.append('end_time', params.end_time);
    return request(`/alerts-api/alerts?${searchParams.toString()}`);
  },

  getAlert: (id: string | number) => request(`/alerts-api/alerts/${id}`),
  updateAlert: (id: string | number, data: any) => request(`/alerts-api/alerts/${id}`, { method: 'PUT', body: data }),
  updateAlertStatus: (id: string | number, status: string) =>
    request(`/alerts-api/alerts/${id}/status`, { method: 'PUT', body: { status } }),
  batchUpdateStatus: (alert_ids: (string | number)[], status: string) =>
    request('/alerts-api/alerts/batch/status', { method: 'PUT', body: { alert_ids, status } }),
  deleteAlert: (id: string | number) => request(`/alerts-api/alerts/${id}`, { method: 'DELETE' }),
  batchDelete: (alert_ids: (string | number)[]) =>
    request('/alerts-api/alerts/batch', { method: 'DELETE', body: { alert_ids } }),
  aggregateAlerts: (data: { alert_ids: (string | number)[]; title: string; severity?: string; description?: string; category?: string; include_related?: boolean; mark_status?: string }) =>
    request('/alerts-api/alerts/aggregate', { method: 'POST', body: data }),
  getAlertStats: () => request('/alerts-api/alerts/stats'),
  getAlertTrend: (bucket?: string, start_time?: string, end_time?: string) => {
    const params = new URLSearchParams();
    if (bucket) params.append('bucket', bucket);
    if (start_time) params.append('start_time', start_time);
    if (end_time) params.append('end_time', end_time);
    return request(`/alerts-api/alerts/trend?${params.toString()}`);
  },
  exportAlerts: (params?: { severity?: string; status?: string; start_time?: string; end_time?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.severity) searchParams.append('severity', params.severity);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.start_time) searchParams.append('start_time', params.start_time);
    if (params?.end_time) searchParams.append('end_time', params.end_time);
    return request(`/alerts-api/alerts/export?${searchParams.toString()}`);
  },
  initHypertable: () => request('/alerts-api/alerts/init-hypertable', { method: 'POST' }),

  // ===== Graylog-style ES 搜索 API =====
  searchAlerts: (params: {
    q?: string;
    page?: number;
    page_size?: number;
    aggregations?: string[];
    agg_field?: string;
    histogram_interval?: string;
    start_time?: string;
    end_time?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params.q) sp.append('q', params.q);
    if (params.page) sp.append('page', String(params.page));
    if (params.page_size) sp.append('page_size', String(params.page_size));
    if (params.agg_field) sp.append('agg_field', params.agg_field);
    if (params.histogram_interval) sp.append('histogram_interval', params.histogram_interval);
    if (params.start_time) sp.append('start_time', params.start_time);
    if (params.end_time) sp.append('end_time', params.end_time);
    if (params.aggregations) params.aggregations.forEach(a => sp.append('aggregations', a));
    return request(`/alerts-api/alerts/search?${sp.toString()}`);
  },

  quickValues: (field: string, start_time?: string, end_time?: string) => {
    const sp = new URLSearchParams();
    sp.append('field', field);
    if (start_time) sp.append('start_time', start_time);
    if (end_time) sp.append('end_time', end_time);
    return request(`/alerts-api/alerts/quick-values?${sp.toString()}`);
  },

  fieldStats: (field: string, start_time?: string, end_time?: string) => {
    const sp = new URLSearchParams();
    sp.append('field', field);
    if (start_time) sp.append('start_time', start_time);
    if (end_time) sp.append('end_time', end_time);
    return request(`/alerts-api/alerts/field-stats?${sp.toString()}`);
  },

  // ===== Related Alerts =====
  relatedAlerts: (alertId: string, limit?: number) => {
    const sp = new URLSearchParams();
    if (limit) sp.append('limit', String(limit));
    return request(`/alerts-api/alerts/${alertId}/related?${sp.toString()}`);
  },

  // ===== Date Histogram =====
  dateHistogram: (params?: {
    interval?: string;
    start_time?: string;
    end_time?: string;
    query?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params?.query) sp.append('q', params.query);
    if (params?.start_time) sp.append('start_time', params.start_time);
    if (params?.end_time) sp.append('end_time', params.end_time);
    sp.append('aggregations', 'date_histogram');
    sp.append('histogram_interval', params?.interval || '1h');
    return request(`/alerts-api/alerts/search?${sp.toString()}`);
  },

  // ===== Streams API =====
  getStreams: () => request('/alerts-api/alerts/streams'),
  getStream: (id: string) => request(`/alerts-api/alerts/streams/${id}`),
  createStream: (data: any) => request('/alerts-api/alerts/streams', { method: 'POST', body: data }),
  updateStream: (id: string, data: any) => request(`/alerts-api/alerts/streams/${id}`, { method: 'PUT', body: data }),
  deleteStream: (id: string) => request(`/alerts-api/alerts/streams/${id}`, { method: 'DELETE' }),

  // ===== Saved Searches API =====
  getSavedSearches: () => request('/alerts-api/alerts/saved-searches'),
  createSavedSearch: (data: any) => request('/alerts-api/alerts/saved-searches', { method: 'POST', body: data }),
  deleteSavedSearch: (id: string) => request(`/alerts-api/alerts/saved-searches/${id}`, { method: 'DELETE' }),
};

// Events API (使用 events API 作为后端)
export const eventsApi = {
  getEvents: (params?: { page?: number; page_size?: number; severity?: string; status?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.severity) searchParams.append('severity', params.severity);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.search) searchParams.append('search', params.search);
    return request(`/event-actions-api/events?${searchParams.toString()}`);
  },

  getEvent: (id: string | number) => request(`/event-actions-api/events/${id}`),
  createEvent: (data: {
    title: string;
    description?: string;
    severity?: string;
    category?: string;
    alert_ids?: number[];
    sourceIp?: string;
  }) => request('/event-actions-api/events', { method: 'POST', body: data }),
  updateEvent: (id: number, data: any) => request(`/event-actions-api/events/${id}`, { method: 'PUT', body: data }),
  updateEventStatus: (id: number, status: string) =>
    request(`/event-actions-api/events/${id}/status`, { method: 'PUT', body: { status } }),
  deleteEvent: (id: number) => request(`/event-actions-api/events/${id}`, { method: 'DELETE' }),
  getEventStats: () => request('/event-actions-api/events/stats'),
};

// Assets API
export const assetsApi = {
  getAssets: (params?: {
    page?: number; page_size?: number; type?: string; search?: string;
    status?: string; min_risk?: number; max_risk?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.type) searchParams.append('type', params.type);
    if (params?.search) searchParams.append('search', params.search);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.min_risk !== undefined) searchParams.append('min_risk', String(params.min_risk));
    if (params?.max_risk !== undefined) searchParams.append('max_risk', String(params.max_risk));
    return request(`/assets-api/assets?${searchParams.toString()}`);
  },

  getAsset: (id: number) => request(`/assets-api/assets/${id}`),
  createAsset: (data: any) => request('/assets-api/assets', { method: 'POST', body: data }),
  updateAsset: (id: number, data: any) => request(`/assets-api/assets/${id}`, { method: 'PUT', body: data }),
  deleteAsset: (id: number) => request(`/assets-api/assets/${id}`, { method: 'DELETE' }),
  batchDelete: (assetIds: (string | number)[]) =>
    request('/assets-api/assets/batch', { method: 'DELETE', body: { asset_ids: assetIds } }),
  getStats: () => request('/assets-api/assets/stats'),
  getTopology: (limit = 20) => request(`/assets-api/assets/topology?limit=${limit}`),
  exportAssets: () => request('/assets-api/assets/export'),
  syncScan: (taskId: number) => request(`/assets-api/assets/sync-scan/${taskId}`, { method: 'POST' }),
};

// Scans API
export const scansApi = {
  getScans: (params?: { page?: number; page_size?: number; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.status) searchParams.append('status', params.status);
    return request(`/scans-api/tasks?${searchParams.toString()}`);
  },
  
  getScan: (id: number) => request(`/scans-api/tasks/${id}`),
  createScan: (data: any) => request('/scans-api/tasks', { method: 'POST', body: data }),
  startScan: (id: number) => request(`/scans-api/tasks/${id}/start`, { method: 'POST' }),
  stopScan: (id: number) => request(`/scans-api/tasks/${id}/pause`, { method: 'POST' }),
  resumeScan: (id: number) => request(`/scans-api/tasks/${id}/resume`, { method: 'POST' }),
  
  // 代理配置
  getProxyConfig: () => request('/scans-api/tasks/proxy'),
  setProxyConfig: (data: any) => request('/scans-api/tasks/proxy', { method: 'POST', body: data }),
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

  getRule: (id: string | number) => request(`/rules-api/rules/${id}`),
  createRule: (data: any) => request('/rules-api/rules', { method: 'POST', body: data }),
  updateRule: (id: string | number, data: any) => request(`/rules-api/rules/${id}`, { method: 'PUT', body: data }),
  deleteRule: (id: string | number) => request(`/rules-api/rules/${id}`, { method: 'DELETE' }),
  toggleRule: (id: string | number) => request(`/rules-api/rules/${id}/toggle`, { method: 'POST' }),
  testRule: (id: string | number) => request(`/rules-api/rules/${id}/test`, { method: 'POST' }),

  getFields: (dataSourceIds: (string | number)[], type?: string) => {
    const params = new URLSearchParams();
    if (dataSourceIds.length > 0) params.append('data_source_ids', dataSourceIds.join(','));
    if (type) params.append('type', type);
    return request(`/rules-api/rules/fields?${params.toString()}`);
  },

  previewRule: (id: string | number) => request(`/rules-api/rules/${id}/preview`),

  /** 从存储表直接检测最近数据 */
  testRuleFromStorage: (id: string | number, params?: { time_range_minutes?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.time_range_minutes) searchParams.append('time_range_minutes', String(params.time_range_minutes));
    const query = searchParams.toString();
    return request(`/rules-api/rules/${id}/test-storage${query ? `?${query}` : ''}`, { method: 'POST' });
  },
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
  // 提交剧本人工审批申请（需要审批后执行）
  requestApproval: (id: number, data: { event_id?: string | number; params?: Record<string, string>; reason?: string }) =>
    request(`/playbooks-api/playbooks/${id}/approve-request`, { method: 'POST', body: data }),
  
  // 执行记录（支持筛选：剧本/状态/触发方式/关键字[执行人·事件编号·IP]）
  getExecutions: (params?: { page?: number; page_size?: number; playbook_id?: number; status?: string; trigger_type?: string; keyword?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.playbook_id) searchParams.append('playbook_id', String(params.playbook_id));
    if (params?.status) searchParams.append('status', params.status);
    if (params?.trigger_type) searchParams.append('trigger_type', params.trigger_type);
    if (params?.keyword) searchParams.append('keyword', params.keyword);
    return request(`/playbooks-api/playbooks/executions?${searchParams.toString()}`);
  },
  getExecution: (id: string) => request(`/playbooks-api/playbooks/executions/${id}`),
  // 当前封堵名单（剧本封禁 IP 的持久化记录）与手动解封
  getBlockedIps: () => request('/playbooks-api/playbooks/blocked-ips'),
  unblockIp: (ip: string) =>
    request(`/playbooks-api/playbooks/blocked-ips/${encodeURIComponent(ip)}`, { method: 'DELETE' }),
  executePlaybook: (id: number, data?: any) =>
    request(`/playbooks-api/playbooks/${id}/execute`, { method: 'POST', body: data || {} }),

  // 数据查询节点：可查询数据源（存储表注册表 + 内部业务表）
  getQuerySources: () => request('/playbooks-api/query-sources'),
  listActions: () => request('/playbooks-api/playbooks/actions/list'),
  // 剧本执行参数 Schema：按剧本真实节点动态生成（事件工作台执行弹窗用）
  getParams: (id: number, eventId?: string | number) =>
    request(`/playbooks-api/playbooks/${id}/params${eventId ? `?event_id=${encodeURIComponent(String(eventId))}` : ''}`),
  
  // 审批相关
  getApprovals: (params?: { page?: number; limit?: number; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.limit) searchParams.append('limit', String(params.limit));
    if (params?.status) searchParams.append('status', params.status);
    return request(`/playbooks-api/playbooks/approvals?${searchParams.toString()}`);
  },
  processApproval: (approvalId: string, approved: boolean) => 
    request(`/playbooks-api/playbooks/approvals/${approvalId}`, { method: 'POST', body: { approved } }),
};

// 集成应用 API（Shuffle / OpenAPI 规范导入）
export const integrationsApi = {
  getApps: () => request('/integrations/apps'),
  getApp: (id: number) => request(`/integrations/apps/${id}`),
  importApp: (data: { text?: string; url?: string }) =>
    request('/integrations/apps/import', { method: 'POST', body: data }),
  updateApp: (id: number, data: any) =>
    request(`/integrations/apps/${id}`, { method: 'PUT', body: data }),
  deleteApp: (id: number) => request(`/integrations/apps/${id}`, { method: 'DELETE' }),
  testAction: (id: number, actionId: string, values: Record<string, any>) =>
    request(`/integrations/apps/${id}/test-action`, { method: 'POST', body: { action_id: actionId, values } }),
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
  getTemplates: () => request('/hunting-api/templates'),
  search: (data: { query: string; page?: number; page_size?: number; severity?: string; source?: string; start_time?: string; end_time?: string }) =>
    request('/hunting-api/search', { method: 'POST', body: data }),
  getStats: () => request('/hunting-api/stats'),
  getIndicators: () => request('/hunting-api/indicators'),
};

// Vulnerabilities API
export const vulnerabilitiesApi = {
  getVulnerabilities: (params?: { page?: number; page_size?: number; severity?: string; status?: string; search?: string; type?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.severity) searchParams.append('severity', params.severity);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.search) searchParams.append('search', params.search);
    if (params?.type) searchParams.append('type', params.type);
    return request(`/vulnerabilities-api/vulnerabilities?${searchParams.toString()}`);
  },

  getVulnerability: (id: number) => request(`/vulnerabilities-api/vulnerabilities/${id}`),
  createVulnerability: (data: any) => request('/vulnerabilities-api/vulnerabilities', { method: 'POST', body: data }),
  updateVulnerability: (id: number, data: any) => request(`/vulnerabilities-api/vulnerabilities/${id}`, { method: 'PUT', body: data }),
  deleteVulnerability: (id: number) => request(`/vulnerabilities-api/vulnerabilities/${id}`, { method: 'DELETE' }),
  changeVulnStatus: (id: number, data: { status: string; comment?: string; repair_plan?: string; deadline?: string; assignee?: string }) =>
    request(`/vulnerabilities-api/vulnerabilities/${id}/status`, { method: 'PUT', body: data }),
  batchVulnStatus: (data: { ids: number[]; status: string; comment?: string }) =>
    request('/vulnerabilities-api/vulnerabilities/batch-status', { method: 'PUT', body: data }),
  reassessVuln: (id: number, data: { asset_importance: number; exploitability: number; fix_difficulty: number; reason?: string; manual_score?: number }) =>
    request(`/vulnerabilities-api/vulnerabilities/${id}/reassess`, { method: 'PUT', body: data }),
  getVulnStats: () => request('/vulnerabilities-api/vulnerabilities/stats'),

  // 漏洞附件（截图 / 报告）
  getVulnAttachments: (id: number) => request(`/vulnerabilities-api/vulnerabilities/${id}/attachments`),
  deleteVulnAttachment: (id: number, attId: number) =>
    request(`/vulnerabilities-api/vulnerabilities/${id}/attachments/${attId}`, { method: 'DELETE' }),
  uploadVulnAttachment: async (id: number, file: File) => {
    const token = localStorage.getItem('token');
    const fd = new FormData();
    fd.append('file', file);
    const resp = await rawApiFetch(`/vulnerabilities-api/vulnerabilities/${id}/attachments`, {
      method: 'POST',
      body: fd,
      token,
    });
    return resp.json();
  },
  /** 取附件二进制（图片预览 / 下载） */
  fetchVulnAttachment: async (id: number, attId: number): Promise<Blob> => {
    const token = localStorage.getItem('token');
    const resp = await rawApiFetch(`/vulnerabilities-api/vulnerabilities/${id}/attachments/${attId}`, { token });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.blob();
  },

  // 漏洞评级配置
  getAssessmentConfig: () => request('/vulnerabilities-api/assessment/config'),
  saveAssessmentConfig: (rules: any[]) => request('/vulnerabilities-api/assessment/config', { method: 'POST', body: { rules } }),
  recalculateAll: () => request('/vulnerabilities-api/assessment/recalculate', { method: 'POST' }),

  // Nessus 导入
  importNessus: (items: any[], type: string) => request('/vulnerabilities-api/nessus/import', { method: 'POST', body: { items, type } }),
  previewNessus: (items: any[]) => request('/vulnerabilities-api/nessus/preview', { method: 'POST', body: { items } }),
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

// Roles API
export const rolesApi = {
  getRoles: (params?: { page?: number; page_size?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    return request(`/roles-api/roles?${searchParams.toString()}`);
  },
  getRole: (id: string) => request(`/roles-api/roles/${id}`),
  createRole: (data: any) => request('/roles-api/roles', { method: 'POST', body: data }),
  updateRole: (id: string, data: any) => request(`/roles-api/roles/${id}`, { method: 'PUT', body: data }),
  deleteRole: (id: string) => request(`/roles-api/roles/${id}`, { method: 'DELETE' }),
};

// Data Sources API
export const dataSourcesApi = {
  getDataSources: (params?: { page?: number; page_size?: number; type?: string; configured?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.type) searchParams.append('type', params.type);
    if (params?.configured) searchParams.append('configured', 'true');
    return request(`/datasources-api/datasources?${searchParams.toString()}`);
  },
  
  getDataSource: (id: number) => request(`/datasources-api/datasources/${id}`),
  createDataSource: (data: any) => request('/datasources-api/datasources', { method: 'POST', body: data }),
  updateDataSource: (id: number, data: any) => request(`/datasources-api/datasources/${id}`, { method: 'PUT', body: data }),
  deleteDataSource: (id: number) => request(`/datasources-api/datasources/${id}`, { method: 'DELETE' }),
  testConnection: (id: number) => request(`/datasources-api/datasources/${id}/test`, { method: 'POST' }),
  
  // 保存数据流关联配置
  saveMappingConfig: (dataSourceId: number, mappingConfig: {
    logTypeId?: string;
    logTypeName?: string;
    logTypeDescription?: string;
    pipelineIds?: string[];
    pipelineNames?: string[];
    storageConfigId?: string;
    storageTableName?: string;
    storageRetentionDays?: number;
    storagePartition?: string;
    storageCompression?: boolean;
    storageIndexes?: string[];
    formatTemplateId?: string;
    formatTemplateName?: string;
  }) => request(`/datasources-api/datasources/${dataSourceId}/mapping`, { 
    method: 'POST', 
    body: mappingConfig 
  }),
  
  // 启动 Flink 任务
  startFlinkJob: (dataSourceId: number) => request(`/datasources-api/datasources/${dataSourceId}/start-flink`, { 
    method: 'POST' 
  }),
  
  // 停止 Flink 任务
  stopFlinkJob: (dataSourceId: number) => request(`/datasources-api/datasources/${dataSourceId}/stop-flink`, { 
    method: 'POST' 
  }),
  
  // 获取 Flink 任务状态
  getFlinkStatus: (dataSourceId: number) => request(`/datasources-api/datasources/${dataSourceId}/status`),
  
  // 批量启动所有已配置的数据源
  startAllDatasources: () => request(`/datasources-api/datasources/batch/start`, { method: 'POST' }),
};

// SSE 流式读取辅助函数
export function readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (content: string) => void,
  onDone: (messageId?: string) => void,
  onError: (error: string) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  return new Promise((resolve) => {
    function pump(): Promise<void> {
      if (abortSignal?.aborted) {
        resolve();
        return Promise.resolve();
      }
      return reader.read().then(({ done, value }) => {
        if (done) { resolve(); return; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) { onError(parsed.error); resolve(); return; }
            if (parsed.done) { onDone(parsed.message_id); resolve(); return; }
            if (parsed.content !== undefined) { onChunk(parsed.content); }
          } catch { /* skip malformed frame */ }
        }
        return pump();
      }).catch((err) => {
        onError(err.message || 'SSE 读取失败');
        resolve();
      });
    }
    return pump();
  });
}

// AI API
export const aiApi = {
  getInsights: () => request('/ai-api/insights'),

  // ========== 对话会话管理 ==========

  /** 获取会话列表 */
  getSessions: () => request('/ai-api/chat/sessions'),

  /** 创建新会话 */
  createSession: (data: { title?: string; model_id?: string; context?: Record<string, any> }) =>
    request('/ai-api/chat/sessions', { method: 'POST', body: data }),

  /** 获取会话详情 */
  getSession: (sessionId: string) => request(`/ai-api/chat/sessions/${sessionId}`),

  /** 删除会话 */
  deleteSession: (sessionId: string) =>
    request(`/ai-api/chat/sessions/${sessionId}`, { method: 'DELETE' }),

  // ========== 消息发送与流式对话 ==========

  /**
   * 发送消息（流式 SSE）
   * 返回一个 controller（AbortController）用于中断请求
   */
  sendMessageStream: (
    sessionId: string,
    params: { content: string; model?: string; temperature?: number; max_tokens?: number },
    callbacks: {
      onChunk: (content: string) => void;
      onDone: (messageId?: string) => void;
      onError: (error: string) => void;
    },
  ): AbortController => {
    const controller = new AbortController();
    const token = localStorage.getItem('token');
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/api/ai-api/chat/sessions/${sessionId}/messages`;

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...params, stream: true }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        callbacks.onError(`请求失败 (${response.status}): ${text}`);
        return;
      }
      const reader = response.body?.getReader();
      if (!reader) { callbacks.onError('响应体不可读'); return; }
      await readSSEStream(
        reader,
        callbacks.onChunk,
        callbacks.onDone,
        callbacks.onError,
        controller.signal,
      );
    }).catch((err) => {
      if (err.name === 'AbortError') return;
      callbacks.onError(err.message || '请求失败');
    });

    return controller;
  },

  // ===== LLM Provider Management =====
  getLlmProviders: () => request('/ai-api/llm-providers'),
  addLlmProvider: (data: any) => request('/ai-api/llm-providers', { method: 'POST', body: data }),
  updateLlmProvider: (id: string, data: any) => request(`/ai-api/llm-providers/${id}`, { method: 'PUT', body: data }),
  deleteLlmProvider: (id: string) => request(`/ai-api/llm-providers/${id}`, { method: "DELETE" }),
  setDefaultLlmProvider: (id: string) => request(`/ai-api/llm-providers/${id}/set-default`, { method: "POST" }),
  getDefaultLlmProvider: () => request("/ai-api/llm-providers/default"),

  // ===== Agent Provider Management =====
  getAgentProviders: () => request('/ai-api/agent-providers'),
  addAgentProvider: (data: any) => request('/ai-api/agent-providers', { method: 'POST', body: data }),
  updateAgentProvider: (id: string, data: any) => request(`/ai-api/agent-providers/${id}`, { method: 'PUT', body: data }),
  deleteAgentProvider: (id: string) => request(`/ai-api/agent-providers/${id}`, { method: 'DELETE' }),

  /** LangGraph + CrewAI 编排分析 */
  orchestrate: (data: { query: string; session_id?: string }) =>
    request('/ai-api/orchestrate', { method: 'POST', body: data }),

  /** 编排人工审批 */
  orchestrateApprove: (data: { session_id: string; approved: boolean }) =>
    request('/ai-api/orchestrate/approve', { method: 'POST', body: data }),

  // ===== AI Capabilities =====
  copilotAnalyzeEvent: (data: any) => request('/ai-api/copilot/analyze-event', { method: 'POST', body: data }),
  listSkills: () => request('/ai-api/skills/list'),
  agentSkillRoute: (data: any) => request('/ai-api/skills/agent-route', { method: 'POST', body: data }),
  alertsTriage: (data: any) => request('/ai-api/alerts/triage', { method: 'POST', body: data }),
  investigateEvent: (data: any) => request('/ai-api/investigate/event', { method: 'POST', body: data }),
  autoRespond: (data: any) => request('/ai-api/respond/auto', { method: 'POST', body: data }),
  nlQuery: (data: any) => request('/ai-api/nl/query', { method: 'POST', body: data }),
  recordFeedback: (data: any) => request('/ai-api/feedback/record', { method: 'POST', body: data }),
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

// 告警标准字段定义 API（从数据库加载，供 SmartParser 解析管道使用）
export const alertFieldsApi = {
  /** 获取所有启用的标准字段定义（按分类分组） */
  getFields: (category?: string) => {
    const params = category ? `?category=${encodeURIComponent(category)}` : '';
    return request(`/alert-fields/fields${params}`);
  },
  /** 获取所有字段（含禁用的，管理用） */
  getAllFields: () => request('/alert-fields/fields/all'),
  /** 更新字段定义 */
  updateField: (id: number, data: any) => request(`/alert-fields/fields/${id}`, { method: 'PUT', body: data }),
  /** 删除字段定义 */
  deleteField: (id: number) => request(`/alert-fields/fields/${id}`, { method: 'DELETE' }),
  /** 自动映射匹配 */
  resolveMapping: (fields: string[]) => request('/alert-fields/fields/mapping', { method: 'POST', body: { fields } }),
};

// 解析管道字段映射 API
export const pipelineMappingsApi = {
  /** 获取管道的字段映射 */
  getMappings: (pipelineId: number) => 
    request(`/pipeline-config/pipelines/${pipelineId}/mappings`),
  
  /** 批量保存字段映射 */
  saveMappings: (pipelineId: number, mappings: Array<{
    target_field: string;
    source_field: string;
    field_type: string;
    default_value?: string;
    is_required?: boolean;
    sort_order?: number;
  }>) => request(`/pipeline-config/pipelines/${pipelineId}/mappings`, { 
    method: 'POST', 
    body: { mappings } 
  }),
  
  /** 删除单个字段映射 */
  deleteMapping: (pipelineId: number, mappingId: number) => 
    request(`/pipeline-config/pipelines/${pipelineId}/mappings/${mappingId}`, { method: 'DELETE' }),
  
  /** 获取管道配置 */
  getConfig: (pipelineId: number) => 
    request(`/pipeline-config/pipelines/${pipelineId}/config`),
  
  /** 更新管道配置 */
  updateConfig: (pipelineId: number, config: any) => 
    request(`/pipeline-config/pipelines/${pipelineId}/config`, { method: 'PUT', body: config }),
  
  /** 自动映射字段 */
  autoMap: (pipelineId: number, parsedFields: Array<{name: string; type: string}>) => 
    request(`/pipeline-config/pipelines/${pipelineId}/auto-map`, { 
      method: 'POST', 
      body: { parsed_fields: parsedFields } 
    }),
  
  /** 获取映射建议 */
  getSuggestions: () => request('/pipeline-config/mappings/suggestions'),
};

// Notifications API
export const notificationsApi = {
  getNotifications: (params?: { page?: number; limit?: number; type?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.limit) searchParams.append('limit', String(params.limit));
    if (params?.type) searchParams.append('type', params.type);
    return request(`/notifications?${searchParams.toString()}`);
  },
  getUnreadCount: () => request('/notifications/unread-count'),
  markAsRead: (id: string) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllAsRead: () => request('/notifications/mark-all-read', { method: 'POST' }),
  deleteNotification: (id: string) => request(`/notifications/${id}`, { method: 'DELETE' }),
  
  // 审批相关
  getApprovals: (params?: { page?: number; limit?: number; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.limit) searchParams.append('limit', String(params.limit));
    if (params?.status) searchParams.append('status', params.status);
    return request(`/notifications/approvals?${searchParams.toString()}`);
  },
  getApproval: (id: string) => request(`/notifications/approvals/${encodeURIComponent(String(id))}`),
  processApproval: (id: string, approved: boolean) => 
    request(`/notifications/approvals/${encodeURIComponent(String(id))}`, { method: 'POST', body: { approved } }),
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
  executePlaybook: (eventId: string, playbookId: string | number, data?: { params?: Record<string, string>; event?: any }) =>
    request(`/event-actions-api/events/${eventId}/playbooks/${playbookId}/execute`, { method: 'POST', body: data || {} }),

  // 事件 AI 结构化研判（结果写入 event.extra_data.ai_analysis）
  aiAnalyzeEvent: (eventId: string) =>
    request(`/event-actions-api/events/${eventId}/ai-analyze`, { method: 'POST' }),

  // 读取事件 AI 研判结果
  getEventAiAnalysis: (eventId: string) =>
    request(`/event-actions-api/events/${eventId}/ai-analysis`),

  // 获取可用剧本
  getEventPlaybooks: (eventId: string) =>
    request(`/event-actions-api/events/${eventId}/playbooks`),

  // 获取事件统计
  getEventStats: () => request('/event-actions-api/events/stats'),

  // 批量更新状态
  batchUpdateStatus: (eventIds: string[], status: string, reason?: string) =>
    request('/event-actions-api/events/batch/status', { method: 'PUT', body: { event_ids: eventIds, status, reason } }),

  // 批量删除
  batchDelete: (eventIds: string[]) =>
    request('/event-actions-api/events/batch', { method: 'DELETE', body: { event_ids: eventIds } }),
};

// Format Templates API (ingestion formats)
export const formatTemplatesApi = {
  getFormats: (params?: { page?: number; page_size?: number; log_type_id?: string; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.log_type_id) searchParams.append('log_type_id', params.log_type_id);
    if (params?.status) searchParams.append('status', params.status);
    const query = searchParams.toString();
    return request(`/ingestion/formats${query ? `?${query}` : ''}`);
  },

  getFormat: (id: string) => request(`/ingestion/formats/${id}`),
  createFormat: (data: any) => request('/ingestion/formats', { method: 'POST', body: data }),
  updateFormat: (id: string, data: any) => request(`/ingestion/formats/${id}`, { method: 'PUT', body: data }),
  deleteFormat: (id: string) => request(`/ingestion/formats/${id}`, { method: 'DELETE' }),
};

// System Config API
export const systemConfigApi = {
  getConfigs: () => request('/config/config'),
  getConfig: (key: string) => request(`/config/config/${key}`),
  updateConfig: (key: string, value: string, category?: string) =>
    request(`/config/config/${key}`, { method: 'PUT', body: { value, category } }),
  batchUpdate: (items: { key: string; value: string; category?: string }[]) =>
    request('/config/config/batch', { method: 'POST', body: { items } }),
};


export const workflowApi = {
  list: () => request("/ai-api/workflows"),
  save: (data: any) => request("/ai-api/workflows", {method:"POST",body:data}),
  delete: (id:string) => request("/ai-api/workflows/"+id, {method:"DELETE"}),
};

// Search API (全文搜索 + 调查)
export const searchApi = {
  // 关键词搜索
  search: (keyword: string, limit?: number) => 
    request(`/search/search?q=${encodeURIComponent(keyword)}${limit ? '&limit=' + limit : ''}`),
  
  // IP搜索
  searchByIp: (ip: string, limit?: number) => 
    request(`/search/search/ip?ip=${ip}${limit ? '&limit=' + limit : ''}`),
  
  // IP调查
  investigateIp: (ip: string) => 
    request(`/search/search/investigate-ip?ip=${ip}`),
  
  // 高级搜索
  advancedSearch: (conditions: {
    keyword?: string;
    ip?: string;
    severity?: string;
    category?: string;
    start_time?: string;
    end_time?: string;
    limit?: number;
  }) => request('/search/search/advanced', { method: 'POST', body: conditions }),
};

// ==================== 以下为依据线上构建产物重建的 API 封装 ====================

/** 通用查询串构造：跳过 undefined / 空串 */
function buildQuery(params?: Record<string, any>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') sp.append(k, String(v));
  });
  const q = sp.toString();
  return q ? `?${q}` : '';
}

// Pipeline API（设备接入 / 日志解析 / 过滤规则 / 分流策略 / 存储路由 / 关联规则）
export const pipelineApi = {
  status: () => request('/pipeline/status'),
  toggleTopic: (data: any) => request('/pipeline/topics', { method: 'POST', body: data }),
  testIngest: (data: any) => request('/pipeline/test-ingest', { method: 'POST', body: data }),
  correlationRules: () => request('/pipeline/correlation-rules'),
  correlationFieldCatalog: () => request('/pipeline/correlation-rules/field-catalog'),
  createCorrelationRule: (data: any) => request('/pipeline/correlation-rules', { method: 'POST', body: data }),
  deleteCorrelationRule: (id: number | string) => request(`/pipeline/correlation-rules/${id}`, { method: 'DELETE' }),
  updateCorrelationRule: (id: number | string, data: any) => request(`/pipeline/correlation-rules/${id}`, { method: 'PATCH', body: data }),
  previewCorrelationSql: (data?: any) => request('/pipeline/correlation-rules/preview', { method: 'POST', body: data || {} }),
  deployCorrelationJob: () => request('/pipeline/correlation/deploy', { method: 'POST', body: {} }),
  stopCorrelationJob: () => request('/pipeline/correlation/stop', { method: 'POST', body: {} }),
  correlationStatus: () => request('/pipeline/correlation/status'),
  filterRules: () => request('/pipeline/filter-rules'),
  createFilterRule: (data: any) => request('/pipeline/filter-rules', { method: 'POST', body: data }),
  updateFilterRule: (id: number | string, data: any) => request(`/pipeline/filter-rules/${id}`, { method: 'PATCH', body: data }),
  deleteFilterRule: (id: number | string) => request(`/pipeline/filter-rules/${id}`, { method: 'DELETE' }),
  deviceTopics: () => request('/pipeline/device-topics'),
  createDeviceTopic: (data: any) => request('/pipeline/device-topics', { method: 'POST', body: data }),
  deviceTopicDetail: (topic: string) => request(`/pipeline/device-topics/${encodeURIComponent(topic)}`),
  updateDeviceTopic: (topic: string, data: any) => request(`/pipeline/device-topics/${encodeURIComponent(topic)}`, { method: 'PATCH', body: data }),
  deviceTopicMessages: (topic: string, limit = 50) => request(`/pipeline/device-topics/${encodeURIComponent(topic)}/messages?limit=${limit}`),
  deleteDeviceTopic: (topic: string) => request(`/pipeline/device-topics/${encodeURIComponent(topic)}`, { method: 'DELETE' }),
  parseProfiles: () => request('/pipeline/parse-profiles'),
  parseTemplates: () => request('/pipeline/parse-templates'),
  fieldCatalog: () => request('/pipeline/parse-profiles/field-catalog'),
  modelFields: () => request('/pipeline/parse-profiles/model-fields'),
  previewParse: (data: any) => request('/pipeline/parse-profiles/preview', { method: 'POST', body: data }),
  autoMapFields: (parsedFields: any) => request('/pipeline/parse-profiles/auto-map', { method: 'POST', body: { parsed_fields: parsedFields } }),
  createParseProfile: (data: any) => request('/pipeline/parse-profiles', { method: 'POST', body: data }),
  updateParseProfile: (id: number | string, data: any) => request(`/pipeline/parse-profiles/${id}`, { method: 'PATCH', body: data }),
  deleteParseProfile: (id: number | string) => request(`/pipeline/parse-profiles/${id}`, { method: 'DELETE' }),
  dispatchPolicies: () => request('/pipeline/dispatch-policies'),
  createDispatchPolicy: (data: any) => request('/pipeline/dispatch-policies', { method: 'POST', body: data }),
  updateDispatchPolicy: (id: number | string, data: any) => request(`/pipeline/dispatch-policies/${id}`, { method: 'PATCH', body: data }),
  deleteDispatchPolicy: (id: number | string) => request(`/pipeline/dispatch-policies/${id}`, { method: 'DELETE' }),
  storageRoutes: () => request('/pipeline/storage-routes'),
  createStorageRoute: (data: any) => request('/pipeline/storage-routes', { method: 'POST', body: data }),
  updateStorageRoute: (id: number | string, data: any) => request(`/pipeline/storage-routes/${id}`, { method: 'PATCH', body: data }),
  deleteStorageRoute: (id: number | string) => request(`/pipeline/storage-routes/${id}`, { method: 'DELETE' }),
  kafkaTopics: () => request('/pipeline/kafka-topics'),
  esIndexes: () => request('/pipeline/es-indexes'),
};

// AI 研判 API（结构化研判 / STE 经验库）
export const aiJudgmentApi = {
  analyze: (alertId: string | number) =>
    request('/ai-judgment/analyze', { method: 'POST', body: { alert_id: alertId } }),
  analyzeBatch: (limit?: number) =>
    request('/ai-judgment/analyze-batch', { method: 'POST', body: { limit: limit || 20 } }),
  getExperiences: (params?: Record<string, any>) =>
    request(`/ai-judgment/ste${buildQuery(params)}`),
  createExperience: (data: any) =>
    request('/ai-judgment/ste', { method: 'POST', body: data }),
  feedbackExperience: (id: number | string, feedback: any) =>
    request(`/ai-judgment/ste/${id}/feedback`, { method: 'POST', body: { feedback } }),
  autoExtract: (data: any) =>
    request('/ai-judgment/ste/auto-extract', { method: 'POST', body: data }),
};

// 运营 KPI API
// 系统备份 API
export const backupApi = {
  exportBackup: () => request('/backup/export'),
  importBackup: (data: any) => request('/backup/import', { method: 'POST', body: data }),
};

// AI 中心 API（提示词管理 / 经验库）
export const aiCenterApi = {
  catalog: () => request('/ai-center/catalog'),
  prompts: (params?: { prompt_key?: string; q?: string }) => {
    const sp = new URLSearchParams();
    if (params?.prompt_key) sp.set('prompt_key', params.prompt_key);
    if (params?.q) sp.set('q', params.q);
    const q = sp.toString();
    return request(`/ai-center/prompts${q ? `?${q}` : ''}`);
  },
  createPrompt: (data: any) => request('/ai-center/prompts', { method: 'POST', body: data }),
  updatePrompt: (id: number | string, data: any) => request(`/ai-center/prompts/${id}`, { method: 'PATCH', body: data }),
  deletePrompt: (id: number | string) => request(`/ai-center/prompts/${id}`, { method: 'DELETE' }),
  setDefaultPrompt: (id: number | string) => request(`/ai-center/prompts/${id}/set-default`, { method: 'POST', body: {} }),
  previewPrompt: (data: any) => request('/ai-center/prompts/preview', { method: 'POST', body: data }),
  resetBuiltinPrompts: () => request('/ai-center/prompts/reset-builtin', { method: 'POST', body: {} }),
  experiences: (params?: { q?: string; status?: string; verdict?: string; category?: string; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set('q', params.q);
    if (params?.status) sp.set('status', params.status);
    if (params?.verdict) sp.set('verdict', params.verdict);
    if (params?.category) sp.set('category', params.category);
    if (params?.limit) sp.set('limit', String(params.limit));
    const q = sp.toString();
    return request(`/ai-center/experiences${q ? `?${q}` : ''}`);
  },
  experienceStats: () => request('/ai-center/experiences/stats'),
  createExperience: (data: any) => request('/ai-center/experiences', { method: 'POST', body: data }),
  updateExperience: (id: number | string, data: any) => request(`/ai-center/experiences/${id}`, { method: 'PATCH', body: data }),
  deleteExperience: (id: number | string) => request(`/ai-center/experiences/${id}`, { method: 'DELETE' }),
  publishExperience: (id: number | string) => request(`/ai-center/experiences/${id}/publish`, { method: 'POST', body: {} }),
  batchExperiences: (action: string, ids: (number | string)[]) =>
    request('/ai-center/experiences/batch', { method: 'POST', body: { action, ids } }),
};

// 资源管理 API（IP 组 / 域名组）
export const resourcesApi = {
  ipGroups: (usage?: string) => request(`/resources/ip-groups${usage ? `?usage=${usage}` : ''}`),
  createIpGroup: (data: any) => request('/resources/ip-groups', { method: 'POST', body: data }),
  updateIpGroup: (id: number | string, data: any) => request(`/resources/ip-groups/${id}`, { method: 'PATCH', body: data }),
  testIpGroups: (ip: string) => request('/resources/ip-groups/test', { method: 'POST', body: { ip } }),
  deleteIpGroup: (id: number | string) => request(`/resources/ip-groups/${id}`, { method: 'DELETE' }),
  domainGroups: () => request('/resources/domain-groups'),
  createDomainGroup: (data: any) => request('/resources/domain-groups', { method: 'POST', body: data }),
  updateDomainGroup: (id: number | string, data: any) => request(`/resources/domain-groups/${id}`, { method: 'PATCH', body: data }),
  deleteDomainGroup: (id: number | string) => request(`/resources/domain-groups/${id}`, { method: 'DELETE' }),
};

// 消息模型 / 模板 API
export const templatesApi = {
  list: (params?: { type?: string; scene?: string }) => {
    const sp = new URLSearchParams();
    if (params?.type) sp.set('type', params.type);
    if (params?.scene) sp.set('scene', params.scene);
    const q = sp.toString();
    return request(`/templates${q ? `?${q}` : ''}`);
  },
  get: (id: number | string) => request(`/templates/${id}`),
  create: (data: any) => request('/templates', { method: 'POST', body: data }),
  update: (id: number | string, data: any) => request(`/templates/${id}`, { method: 'PATCH', body: data }),
  remove: (id: number | string) => request(`/templates/${id}`, { method: 'DELETE' }),
  fields: () => request('/templates/fields'),
  createField: (data: any) => request('/templates/fields', { method: 'POST', body: data }),
  updateField: (id: number | string, data: any) => request(`/templates/fields/${id}`, { method: 'PATCH', body: data }),
  removeField: (id: number | string) => request(`/templates/fields/${id}`, { method: 'DELETE' }),
  variables: (alertId?: number | string, eventId?: number | string) => {
    const sp = new URLSearchParams();
    if (alertId) sp.set('alert_id', String(alertId));
    if (eventId) sp.set('event_id', String(eventId));
    const q = sp.toString();
    return request(`/templates/variables${q ? `?${q}` : ''}`);
  },
  render: (templateId: number | string, alertId?: number | string, eventId?: number | string) =>
    request('/templates/render', { method: 'POST', body: { template_id: templateId, alert_id: alertId, event_id: eventId } }),
};
