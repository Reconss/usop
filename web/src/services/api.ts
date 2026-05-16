// API 基础路径配置
// 开发环境：优先走 webpack 代理（同源），失败时 fallback 到后端直连
const API_BASE = '/api';
const BACKEND_FALLBACK = 'http://localhost:5001';

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
  
  const data = JSON.parse(responseText);
  
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new CustomEvent('auth:expired'));
      throw new Error('登录已过期，请重新登录');
    }
    throw new Error(data.error || `请求失败 (${response.status})`);
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

// Dashboard API
export const dashboardApi = {
  getMetrics: () => request('/dashboard-api/metrics'),
  getAlertsTrend: (days?: number) => request(`/dashboard-api/event-trend?days=${days || 7}`),
  getEventDistribution: () => request('/dashboard-api/event-types'),
  getTopAlerts: (limit?: number) => request(`/dashboard-api/recent-alerts?limit=${limit || 10}`),
};

// Alerts API (使用 TimescaleDB 存储)
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
  updateAlert: (id: number, data: any) => request(`/alerts-api/alerts/${id}`, { method: 'PUT', body: data }),
  updateAlertStatus: (id: number, status: string) =>
    request(`/alerts-api/alerts/${id}/status`, { method: 'PUT', body: { status } }),
  batchUpdateStatus: (alert_ids: number[], status: string) =>
    request('/alerts-api/alerts/batch/status', { method: 'PUT', body: { alert_ids, status } }),
  deleteAlert: (id: number) => request(`/alerts-api/alerts/${id}`, { method: 'DELETE' }),
  batchDelete: (alert_ids: number[]) =>
    request('/alerts-api/alerts/batch', { method: 'DELETE', body: { alert_ids } }),
  aggregateAlerts: (data: { alert_ids: number[]; title: string; severity?: string; description?: string }) =>
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
  startFlinkJob: (dataSourceId: number) => request(`/datasources-api/datasources/${dataSourceId}/start`, { 
    method: 'POST' 
  }),
  
  // 停止 Flink 任务
  stopFlinkJob: (dataSourceId: number) => request(`/datasources-api/datasources/${dataSourceId}/stop`, { 
    method: 'POST' 
  }),
  
  // 获取 Flink 任务状态
  getFlinkStatus: (dataSourceId: number) => request(`/datasources-api/datasources/${dataSourceId}/status`),
  
  // 批量启动所有已配置的数据源
  startAllDatasources: () => request(`/datasources-api/datasources/batch/start`, { method: 'POST' }),
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
  updateLogType: (id: number | string, data: any) => request(`/log-types-api/log-types/${id}`, { method: 'PUT', body: data }),
  deleteLogType: (id: number | string) => request(`/log-types-api/log-types/${id}`, { method: 'DELETE' }),
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
   * 发送消息（非流式）
   */
  sendMessage: (sessionId: string, data: { content: string; model?: string; temperature?: number; max_tokens?: number }) =>
    request(`/ai-api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: { ...data, stream: false },
    }),

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

  // ========== AI 分析 ==========

  /** 实时安全分析 */
  analyze: (data: { type: string; data: any }) =>
    request('/ai-api/analyze', { method: 'POST', body: data }),
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

// Pipelines API
export const pipelinesApi = {
  getPipelines: (params?: { page?: number; page_size?: number; status?: string; product_id?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.page_size) searchParams.append('page_size', String(params.page_size));
    if (params?.status) searchParams.append('status', params.status);
    if (params?.product_id) searchParams.append('product_id', params.product_id);
    const query = searchParams.toString();
    return request(`/pipelines${query ? `?${query}` : ''}`);
  },

  getPipeline: (id: number) => request(`/pipelines/${id}`),
  createPipeline: (data: any) => request('/pipelines', { method: 'POST', body: data }),
  updatePipeline: (id: number, data: any) => request(`/pipelines/${id}`, { method: 'PUT', body: data }),
  deletePipeline: (id: number) => request(`/pipelines/${id}`, { method: 'DELETE' }),
  togglePipeline: (id: number) => request(`/pipelines/${id}/toggle`, { method: 'POST' }),
  getFormats: () => request('/pipelines/formats'),
  createFormat: (data: any) => request('/pipelines/formats', { method: 'POST', body: data }),
  getTemplates: () => request('/pipelines/templates'),
  parseLog: (data: { raw_log: string; pipeline_id?: number; format?: string; config?: any }) =>
    request('/pipelines/parse', { method: 'POST', body: data }),
  testParse: (data: { raw_log: string; format: string; config?: any }) =>
    request('/pipelines/parse/test', { method: 'POST', body: data }),
};

// Storage Tables API
export const storageTablesApi = {
  // 获取所有存储表
  getTables: (params?: { auto_created?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.auto_created !== undefined) {
      searchParams.append('auto_created', String(params.auto_created));
    }
    const query = searchParams.toString();
    return request(`/storage-tables${query ? `?${query}` : ''}`);
  },

  // 获取单个存储表
  getTable: (id: number) => request(`/storage-tables/${id}`),

  // 创建存储表
  createTable: (data: {
    name: string;
    displayName?: string;
    dataSource?: string;
    logType?: string;
    retentionDays?: number;
    partitionInterval?: string;
    indexes?: string[];
    compression?: boolean;
  }) => request('/storage-tables', { method: 'POST', body: data }),

  // 更新存储表
  updateTable: (id: number, data: any) =>
    request(`/storage-tables/${id}`, { method: 'PUT', body: data }),

  // 删除存储表
  deleteTable: (id: number) => request(`/storage-tables/${id}`, { method: 'DELETE' }),

  // 批量删除存储表
  batchDelete: (ids: number[]) =>
    request('/storage-tables/batch-delete', { method: 'POST', body: { ids } }),
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
