import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, Download, Calendar, User, Eye, RefreshCw } from 'lucide-react';
import type { AuditLog } from '../types';
import { auditApi } from '../services/api';

const actionColors: Record<string, string> = {
  '用户登录': 'text-green-400',
  '登录': 'text-green-400',
  '事件确认': 'text-blue-400',
  '规则更新': 'text-orange-400',
  '资产扫描': 'text-purple-400',
  '用户创建': 'text-primary',
  '创建': 'text-primary',
  '更新': 'text-orange-400',
  '删除': 'text-red-400',
  '登录失败': 'text-red-400'
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await auditApi.getLogs({ page_size: 100 });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        setLogs(items);
      } else {
        setLogs([]);
      }
    } catch (error) {
      console.error('获取审计日志失败:', error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log =>
    log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.ip.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">审计日志</h1>
          <p className="text-text-secondary text-sm mt-1">查看系统操作记录</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-card-bg border border-border-color rounded-lg text-text-secondary hover:border-primary transition-colors">
          <Download className="w-4 h-4" />导出
        </button>
        <button onClick={fetchLogs} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-card-bg border border-border-color rounded-lg text-text-secondary hover:border-primary transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />刷新
        </button>
      </div>

      <div className="glass-card rounded-xl p-4 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="搜索用户、操作或IP..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border border-border-color rounded-lg text-text-secondary hover:bg-white/5 transition-colors">
          <Calendar className="w-4 h-4" />时间范围
        </button>
        <button className="flex items-center gap-2 px-4 py-2 border border-border-color rounded-lg text-text-secondary hover:bg-white/5 transition-colors">
          <Filter className="w-4 h-4" />筛选
        </button>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-card-bg/50 border-b border-border-color">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">时间</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">用户</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">操作</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">详情</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">IP地址</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log, index) => (
              <motion.tr
                key={log.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="table-row border-b border-border-color/50 last:border-0"
              >
                <td className="px-6 py-4 text-sm text-text-secondary">{new Date(log.timestamp).toLocaleString()}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-text-muted" />
                    <span className="text-sm text-text-primary">{log.user}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-sm font-medium ${actionColors[log.action] || 'text-text-primary'}`}>{log.action}</span>
                </td>
                <td className="px-6 py-4 text-sm text-text-secondary">{JSON.stringify(log.details).slice(0, 30)}...</td>
                <td className="px-6 py-4 text-sm text-text-secondary font-mono">{log.ip}</td>
                <td className="px-6 py-4">
                  <button onClick={() => setSelectedLog(log)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                    <Eye className="w-4 h-4 text-text-secondary" />
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedLog(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card rounded-xl p-6 w-[500px]"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-text-primary mb-4">日志详情</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-text-secondary">时间</span><span className="text-text-primary">{new Date(selectedLog.timestamp).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">用户</span><span className="text-text-primary">{selectedLog.user}</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">操作</span><span className="text-text-primary">{selectedLog.action}</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">IP地址</span><span className="text-text-primary font-mono">{selectedLog.ip}</span></div>
              <div><span className="text-text-secondary">详情</span><pre className="mt-2 p-3 bg-page-bg rounded-lg text-text-primary overflow-auto">{JSON.stringify(selectedLog.details, null, 2)}</pre></div>
            </div>
            <button onClick={() => setSelectedLog(null)} className="mt-6 w-full py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors">关闭</button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
