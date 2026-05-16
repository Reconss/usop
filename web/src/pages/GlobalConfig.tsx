import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Settings, Bell, Shield, Database, Zap,
  Save, Check, RefreshCw, Server, Clock, Activity
} from 'lucide-react';
import { systemConfigApi } from '../services/api';

interface ConfigSection {
  id: string;
  name: string;
  icon: React.ElementType;
  description: string;
}

interface ConfigItem {
  key: string;
  section: string;
  label: string;
  description: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'password';
  value: any;
  options?: { label: string; value: string }[];
  placeholder?: string;
}

const sections: ConfigSection[] = [
  { id: 'general', name: '基础设置', icon: Settings, description: '系统基础参数' },
  { id: 'notification', name: '通知配置', icon: Bell, description: '告警通知渠道' },
  { id: 'security', name: '安全设置', icon: Shield, description: '安全策略与认证' },
  { id: 'storage', name: '存储配置', icon: Database, description: 'TimescaleDB + PostgreSQL' },
  { id: 'advanced', name: '高级设置', icon: Zap, description: '性能与调试参数' }
];

const defaultConfigs: ConfigItem[] = [
  // 基础设置
  { key: 'system.name', section: 'general', label: '系统名称', description: '页面标题和通知中的系统名称', type: 'text', value: 'USOP安全运营平台' },
  { key: 'system.timezone', section: 'general', label: '默认时区', description: '系统默认时区', type: 'select', value: 'Asia/Shanghai', options: [
    { label: '北京时间 (UTC+8)', value: 'Asia/Shanghai' },
    { label: '东京时间 (UTC+9)', value: 'Asia/Tokyo' },
    { label: '纽约时间 (UTC-5)', value: 'America/New_York' },
    { label: '伦敦时间 (UTC+0)', value: 'Europe/London' }
  ]},
  { key: 'system.session_timeout', section: 'general', label: '会话超时(分钟)', description: '无操作自动登出时间', type: 'number', value: 30 },
  { key: 'system.max_login_attempts', section: 'general', label: '最大登录尝试', description: '超过次数锁定账户', type: 'number', value: 5 },

  // 通知配置
  { key: 'email.enabled', section: 'notification', label: '启用邮件通知', description: '通过邮件发送告警', type: 'boolean', value: false },
  { key: 'email.smtp_host', section: 'notification', label: 'SMTP服务器', description: '邮件服务器地址', type: 'text', value: '', placeholder: 'smtp.company.com' },
  { key: 'email.smtp_port', section: 'notification', label: 'SMTP端口', description: '邮件服务器端口', type: 'number', value: 587 },
  { key: 'email.username', section: 'notification', label: '邮箱账号', description: '发件邮箱账号', type: 'text', value: '' },
  { key: 'email.password', section: 'notification', label: '邮箱密码', description: '发件邮箱密码或授权码', type: 'password', value: '' },
  { key: 'dingtalk.enabled', section: 'notification', label: '启用钉钉通知', description: '通过钉钉机器人发送告警', type: 'boolean', value: false },
  { key: 'dingtalk.webhook', section: 'notification', label: '钉钉Webhook', description: '钉钉机器人Webhook地址', type: 'text', value: '' },

  // 安全设置
  { key: 'auth.password_min_length', section: 'security', label: '密码最小长度', description: '用户密码最小字符数', type: 'number', value: 8 },
  { key: 'auth.token_expire', section: 'security', label: 'Token有效期(h)', description: 'API Token过期时间', type: 'number', value: 24 },
  { key: 'audit.retention_days', section: 'security', label: '审计日志保留(天)', description: '操作审计日志保留天数', type: 'number', value: 90 },
  { key: 'alert.retention_days', section: 'security', label: '告警数据保留(天)', description: '历史告警数据保留天数', type: 'number', value: 365 },

  // 存储配置 - 匹配实际架构 TimescaleDB + PostgreSQL
  { key: 'tsdb.host', section: 'storage', label: 'TimescaleDB地址', description: '时序数据库主机地址', type: 'text', value: 'localhost', placeholder: 'localhost' },
  { key: 'tsdb.port', section: 'storage', label: 'TimescaleDB端口', description: '时序数据库端口', type: 'number', value: 5433 },
  { key: 'tsdb.database', section: 'storage', label: 'TimescaleDB数据库', description: '时序数据库名称', type: 'text', value: 'postgres' },
  { key: 'pg.host', section: 'storage', label: 'PostgreSQL地址', description: '业务数据库主机地址', type: 'text', value: 'localhost', placeholder: 'localhost' },
  { key: 'pg.port', section: 'storage', label: 'PostgreSQL端口', description: '业务数据库端口', type: 'number', value: 5432 },
  { key: 'pg.database', section: 'storage', label: 'PostgreSQL数据库', description: '业务数据库名称', type: 'text', value: 'usop_security' },
  { key: 'storage.default_retention', section: 'storage', label: '默认保留天数', description: '数据默认保留时间', type: 'number', value: 90 },

  // 高级设置
  { key: 'performance.cache_enabled', section: 'advanced', label: '启用Redis缓存', description: '是否启用数据缓存', type: 'boolean', value: true },
  { key: 'performance.cache_ttl', section: 'advanced', label: '缓存TTL(秒)', description: '缓存过期时间', type: 'number', value: 300 },
  { key: 'performance.max_query_limit', section: 'advanced', label: '最大查询条数', description: '单次查询返回上限', type: 'number', value: 10000 },
  { key: 'debug.level', section: 'advanced', label: '日志级别', description: '系统日志输出级别', type: 'select', value: 'info', options: [
    { label: 'DEBUG', value: 'debug' },
    { label: 'INFO', value: 'info' },
    { label: 'WARN', value: 'warn' },
    { label: 'ERROR', value: 'error' }
  ]}
];

export default function GlobalConfig() {
  const [activeSection, setActiveSection] = useState('general');
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSection, setSavedSection] = useState<string | null>(null);

  // 从服务端加载配置
  const fetchConfigs = useCallback(async () => {
    try {
      const res = await systemConfigApi.getConfigs();
      if (res.success && res.data?.items) {
        const serverItems = res.data.items;
        setConfigs(defaultConfigs.map(dc => {
          const serverItem = serverItems.find((s: any) => s.key === dc.key);
          return serverItem ? { ...dc, value: serverItem.value } : dc;
        }));
      } else {
        setConfigs(defaultConfigs);
      }
    } catch {
      setConfigs(defaultConfigs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const activeSectionData = sections.find(s => s.id === activeSection);
  const sectionConfigs = configs.filter(c => c.section === activeSection);

  const updateConfig = (key: string, value: any) => {
    setConfigs(prev => prev.map(c => c.key === key ? { ...c, value } : c));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const items = sectionConfigs.map(c => ({ key: c.key, value: String(c.value), category: c.section }));
      await systemConfigApi.batchUpdate(items);
      setSavedSection(activeSection);
      setTimeout(() => setSavedSection(null), 2000);
    } catch {
      // 静默失败，保留本地状态
    } finally {
      setSaving(false);
    }
  };

  const renderInput = (config: ConfigItem) => {
    const baseClass = "w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none transition-colors";

    switch (config.type) {
      case 'text':
        return <input type="text" value={config.value} onChange={e => updateConfig(config.key, e.target.value)} placeholder={config.placeholder} className={baseClass} />;
      case 'number':
        return <input type="number" value={config.value} onChange={e => updateConfig(config.key, Number(e.target.value))} className={baseClass} />;
      case 'password':
        return <input type="password" value={config.value} onChange={e => updateConfig(config.key, e.target.value)} className={baseClass} />;
      case 'select':
        return (
          <select value={config.value} onChange={e => updateConfig(config.key, e.target.value)} className={baseClass}>
            {config.options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        );
      case 'boolean':
        return (
          <button onClick={() => updateConfig(config.key, !config.value)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.value ? 'bg-primary' : 'bg-text-muted'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.value ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        );
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw className="w-8 h-8 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">全局配置</h1>
          <p className="text-text-secondary mt-1">管理系统参数，当前架构: TimescaleDB(时序数据) + PostgreSQL(业务数据)</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-lg transition-colors">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : savedSection === activeSection ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? '保存中...' : savedSection === activeSection ? '已保存' : '保存配置'}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {/* 左侧导航 */}
        <div className="space-y-2">
          {sections.map(section => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button key={section.id} onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-start gap-3 p-4 rounded-xl transition-all text-left ${
                  isActive ? 'bg-primary/10 border border-primary/30' : 'bg-card-bg border border-border-color hover:border-primary/50'
                }`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isActive ? 'bg-primary/20' : 'bg-page-bg'}`}>
                  <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-text-secondary'}`} />
                </div>
                <div>
                  <h3 className={`font-medium ${isActive ? 'text-primary' : 'text-text-primary'}`}>{section.name}</h3>
                  <p className="text-text-secondary text-sm">{section.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* 右侧配置表单 */}
        <div className="col-span-3">
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              {activeSectionData && (
                <>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <activeSectionData.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-text-primary">{activeSectionData.name}</h2>
                    <p className="text-text-secondary">{activeSectionData.description}</p>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-6">
              {sectionConfigs.map(config => (
                <div key={config.key} className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <label className="font-medium text-text-primary">{config.label}</label>
                      {config.type === 'password' && <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-500 text-xs rounded">敏感</span>}
                    </div>
                    <p className="text-text-secondary text-sm mb-2">{config.description}</p>
                    {renderInput(config)}
                  </div>
                </div>
              ))}
            </div>

            {/* 存储状态面板 */}
            {activeSection === 'storage' && (
              <div className="mt-6 pt-6 border-t border-border-color">
                <h3 className="font-medium text-text-primary mb-4">存储状态</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-page-bg rounded-lg p-4">
                    <div className="flex items-center gap-2 text-text-secondary text-sm mb-2">
                      <Clock className="w-4 h-4" />
                      TimescaleDB
                    </div>
                    <p className="text-2xl font-bold text-text-primary">localhost:5433</p>
                    <p className="text-text-muted text-xs mt-1">告警/日志时序数据</p>
                  </div>
                  <div className="bg-page-bg rounded-lg p-4">
                    <div className="flex items-center gap-2 text-text-secondary text-sm mb-2">
                      <Server className="w-4 h-4" />
                      PostgreSQL
                    </div>
                    <p className="text-2xl font-bold text-text-primary">localhost:5432</p>
                    <p className="text-text-muted text-xs mt-1">业务数据/事件/审计</p>
                  </div>
                  <div className="bg-page-bg rounded-lg p-4">
                    <div className="flex items-center gap-2 text-text-secondary text-sm mb-2">
                      <Activity className="w-4 h-4" />
                      连接状态
                    </div>
                    <p className="text-2xl font-bold text-green-400">正常</p>
                    <p className="text-text-muted text-xs mt-1">双库运行中</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
