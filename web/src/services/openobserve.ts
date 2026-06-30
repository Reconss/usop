/**
 * OpenObserve API 客户端
 * 用于直接调用 OpenObserve API 显示采集状态
 */

const OPENOBSERVE_URL = import.meta.env.VITE_OPENOBSERVE_URL || 'http://localhost:19080';
const OPENOBSERVE_ORG = import.meta.env.VITE_OPENOBSERVE_ORG || 'default';

// 获取认证头（需要通过后端获取 token 或使用配置）
const getAuthHeader = (): HeadersInit => {
  const token = localStorage.getItem('openobserve_token');
  if (token) {
    return { 'Authorization': `Bearer ${token}` };
  }
  // 如果没有 token，使用 Basic Auth（临时方案）
  const credentials = btoa('admin@usop.local:Admin123!');
  return { 'Authorization': `Basic ${credentials}` };
};

export const openobserveApi = {
  // 获取认证配置
  getConfig: () => ({
    baseUrl: OPENOBSERVE_URL,
    org: OPENOBSERVE_ORG,
  }),

  // 获取组织下的所有流（数据采集端点）
  async getStreams(): Promise<any> {
    try {
      const response = await fetch(
        `${OPENOBSERVE_URL}/api/v1/streams?org=${OPENOBSERVE_ORG}`,
        {
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return data.list || [];
    } catch (error) {
      console.error('获取流失败:', error);
      return [];
    }
  },

  // 获取流统计信息
  async getStreamStats(streamName: string): Promise<any> {
    try {
      const response = await fetch(
        `${OPENOBSERVE_URL}/api/v1/${OPENOBSERVE_ORG}/streams/${streamName}/stats`,
        {
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
        }
      );
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('获取流统计失败:', error);
      return null;
    }
  },

  // 获取所有流的统计
  async getAllStreamStats(): Promise<any[]> {
    try {
      const streams = await openobserveApi.getStreams();
      const stats = await Promise.all(
        streams.map(async (stream: any) => {
          const streamStats = await openobserveApi.getStreamStats(stream.name);
          return {
            ...stream,
            stats: streamStats || {},
          };
        })
      );
      return stats;
    } catch (error) {
      console.error('获取流统计失败:', error);
      return [];
    }
  },

  // 获取日志搜索统计
  async getIngestStats(hours: number = 24): Promise<any> {
    try {
      const sql = `SELECT histogram(_timestamp, '1 hour') as time, count(*) as count 
                   FROM "_all" 
                   WHERE _timestamp >= NOW() - INTERVAL '${hours} hours' 
                   GROUP BY time 
                   ORDER BY time`;
      
      const response = await fetch(
        `${OPENOBSERVE_URL}/api/v1/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({
            sql,
            page: 1,
            size: 100,
          }),
        }
      );
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('获取采集统计失败:', error);
      return null;
    }
  },

  // 获取字段统计（快速值）
  async getFieldQuickValues(field: string, size: number = 10): Promise<any[]> {
    try {
      const response = await fetch(
        `${OPENOBSERVE_URL}/api/v1/${OPENOBSERVE_ORG}/logs/_quick_mode?field=${field}&size=${size}`,
        {
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
        }
      );
      if (!response.ok) return [];
      const data = await response.json();
      return data hits || [];
    } catch (error) {
      console.error('获取字段统计失败:', error);
      return [];
    }
  },

  // 获取最近日志
  async getRecentLogs(stream: string, limit: number = 10): Promise<any[]> {
    try {
      const response = await fetch(
        `${OPENOBSERVE_URL}/api/v1/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({
            sql: `SELECT * FROM "${stream}" ORDER BY _timestamp DESC LIMIT ${limit}`,
            page: 1,
            size: limit,
          }),
        }
      );
      if (!response.ok) return [];
      const data = await response.json();
      return data.hits || [];
    } catch (error) {
      console.error('获取最近日志失败:', error);
      return [];
    }
  },

  // 健康检查
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(
        `${OPENOBSERVE_URL}/health`,
        { method: 'GET' }
      );
      return response.ok;
    } catch {
      return false;
    }
  },

  // 打开 OpenObserve 管理界面
  openAdminUI: () => {
    window.open(`${OPENOBSERVE_URL}/`, '_blank');
  },
};
