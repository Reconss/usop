import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Bell, Mail, MessageSquare, Shield, Database, Server,
  Key, Globe, Clock, Save, Check, AlertCircle, RefreshCw,
  ChevronRight, ExternalLink, ToggleLeft, ToggleRight, Copy,
  Webhook, FileText, Lock, User, Activity, Zap
} from 'lucide-react';

interface ConfigSection {
  id: string;
  name: string;
  icon: React.ElementType;
  description: string;
}

interface ConfigItem {
  id: string;
  section: string;
  key: string;
  label: string;
  description: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'password' | 'textarea';
  value: any;
  options?: { label: string; value: string }[];
  placeholder?: string;
}

const sections: ConfigSection[] = [
  { id: 'general', name: '基础设置', icon: Settings, description: '系统基础参数配置' },
  { id: 'notification', name: '通知配置', icon: Bell, description: '告警通知渠道设置' },
  { id: 'security', name: '安全设置', icon: Shield, description: '安全策略和认证配置' },
  { id: 'integration', name: '集成配置', icon: Server, description: '第三方系统集成' },
  { id: 'storage', name: '存储配置', icon: Database, description: '数据存储和备份' },
  { id: 'advanced', name: '高级设置', icon: Zap, description: '高级系统参数' }
];

const mockConfigs: ConfigItem[] = [
  // 基础设置
  { id: '1', section: 'general', key: 'system.name', label: '系统名称', description: '显示在页面标题和邮件中的系统名称', type: 'text', value: 'USOP安全运营平台' },
  { id: '2', section: 'general', key: 'system.logo', label: '系统Logo', description: '系统Logo图片URL', type: 'text', value: '', placeholder: 'https://example.com/logo.png' },
  { id: '3', section: 'general', key: 'system.timezone', label: '默认时区', description: '系统默认时区设置', type: 'select', value: 'Asia/Shanghai', options: [{ label: '北京时间', value: 'Asia/Shanghai' }, { label: '东京时间', value: 'Asia/Tokyo' }, { label: '纽约时间', value: 'America/New_York' }, { label: '伦敦时间', value: 'Europe/London' }] },
  { id: '4', section: 'general', key: 'system.language', label: '默认语言', description: '系统默认显示语言', type: 'select', value: 'zh-CN', options: [{ label: '简体中文', value: 'zh-CN' }, { label: 'English', value: 'en-US' }] },
  { id: '5', section: 'general', key: 'system.session_timeout', label: '会话超时(分钟)', description: '用户无操作自动登出时间', type: 'number', value: 30 },
  { id: '6', section: 'general', key: 'system.max_login_attempts', label: '最大登录尝试次数', description: '超过次数将锁定账户', type: 'number', value: 5 },

  // 通知配置
  { id: '7', section: 'notification', key: 'email.enabled', label: '启用邮件通知', description: '是否通过邮件发送告警通知', type: 'boolean', value: true },
  { id: '8', section: 'notification', key: 'email.smtp_host', label: 'SMTP服务器', description: '邮件服务器地址', type: 'text', value: 'smtp.company.com' },
  { id: '9', section: 'notification', key: 'email.smtp_port', label: 'SMTP端口', description: '邮件服务器端口', type: 'number', value: 587 },
  { id: '10', section: 'notification', key: 'email.username', label: '邮箱账号', description: '发件邮箱账号', type: 'text', value: 'security@company.com' },
  { id: '11', section: 'notification', key: 'email.password', label: '邮箱密码', description: '发件邮箱密码或授权码', type: 'password', value: '********' },
  { id: '12', section: 'notification', key: 'dingtalk.enabled', label: '启用钉钉通知', description: '是否通过钉钉发送告警', type: 'boolean', value: true },
  { id: '13', section: 'notification', key: 'dingtalk.webhook', label: '钉钉Webhook', description: '钉钉机器人Webhook地址', type: 'text', value: 'https://oapi.dingtalk.com/robot/send?access_token=xxx' },
  { id: '14', section: 'notification', key: 'wechat.enabled', label: '启用企业微信', description: '是否通过企业微信发送告警', type: 'boolean', value: false },
  { id: '15', section: 'notification', key: 'sms.enabled', label: '启用短信通知', description: '是否通过短信发送紧急告警', type: 'boolean', value: true },

  // 安全设置
  { id: '16', section: 'security', key: 'auth.mfa_enabled', label: '启用MFA', description: '是否强制开启多因素认证', type: 'boolean', value: false },
  { id: '17', section: 'security', key: 'auth.password_min_length', label: '密码最小长度', description: '用户密码最小字符数', type: 'number', value: 8 },
  { id: '18', section: 'security', key: 'auth.password_complexity', label: '密码复杂度', description: '密码复杂度要求', type: 'select', value: 'medium', options: [{ label: '低', value: 'low' }, { label: '中', value: 'medium' }, { label: '高', value: 'high' }] },
  { id: '19', section: 'security', key: 'auth.token_expire', label: 'Token有效期(小时)', description: 'API Token有效期', type: 'number', value: 24 },
  { id: '20', section: 'security', key: 'audit.enabled', label: '启用审计日志', description: '是否记录所有操作日志', type: 'boolean', value: true },
  { id: '21', section: 'security', key: 'audit.retention_days', label: '审计日志保留(天)', description: '审计日志保留天数', type: 'number', value: 90 },
  { id: '22', section: 'security', key: 'ip_whitelist.enabled', label: '启用IP白名单', description: '是否限制访问IP', type: 'boolean', value: false },
  { id: '23', section: 'security', key: 'ip_whitelist.ips', label: '白名单IP', description: '允许的IP地址，多个用逗号分隔', type: 'textarea', value: '', placeholder: '192.168.1.0/24, 10.0.0.0/8' },

  // 集成配置
  { id: '24', section: 'integration', key: 'itsm.enabled', label: '启用ITSM集成', description: '是否集成ITSM工单系统', type: 'boolean', value: true },
  { id: '25', section: 'integration', key: 'itsm.url', label: 'ITSM地址', description: 'ITSM系统API地址', type: 'text', value: 'https://itsm.company.com/api/v1' },
  { id: '26', section: 'integration', key: 'itsm.api_key', label: 'ITSM API Key', description: 'ITSM系统API密钥', type: 'password', value: '********' },
  { id: '27', section: 'integration', key: 'cmdb.enabled', label: '启用CMDB集成', description: '是否集成CMDB资产系统', type: 'boolean', value: true },
  { id: '28', section: 'integration', key: 'cmdb.url', label: 'CMDB地址', description: 'CMDB系统API地址', type: 'text', value: 'https://cmdb.company.com/api/v2' },
  { id: '29', section: 'integration', key: 'threat_intel.enabled', label: '启用威胁情报', description: '是否集成威胁情报源', type: 'boolean', value: true },
  { id: '30', section: 'integration', key: 'threat_intel.sources', label: '情报源', description: '启用的威胁情报源', type: 'textarea', value: 'alienvault, virustotal, abuse.ch', placeholder: '多个源用逗号分隔' },

  // 存储配置
  { id: '31', section: 'storage', key: 'es.host', label: 'Elasticsearch地址', description: 'ES集群地址', type: 'text', value: 'es.company.com:9200' },
  { id: '32', section: 'storage', key: 'es.index_prefix', label: '索引前缀', description: 'ES索引名称前缀', type: 'text', value: 'usop-' },
  { id: '33', section: 'storage', key: 'es.retention_days', label: '数据保留(天)', description: '安全数据保留天数', type: 'number', value: 180 },
  { id: '34', section: 'storage', key: 'backup.enabled', label: '启用自动备份', description: '是否自动备份配置数据', type: 'boolean', value: true },
  { id: '35', section: 'storage', key: 'backup.cron', label: '备份周期', description: '自动备份Cron表达式', type: 'text', value: '0 2 * * *', placeholder: '0 2 * * *' },
  { id: '36', section: 'storage', key: 'backup.retention', label: '备份保留(份)', description: '保留的备份数量', type: 'number', value: 7 },

  // 高级设置
  { id: '37', section: 'advanced', key: 'performance.cache_enabled', label: '启用缓存', description: '是否启用数据缓存', type: 'boolean', value: true },
  { id: '38', section: 'advanced', key: 'performance.cache_ttl', label: '缓存TTL(秒)', description: '缓存过期时间', type: 'number', value: 300 },
  { id: '39', section: 'advanced', key: 'performance.max_query_limit', label: '最大查询条数', description: '单次查询返回最大条数', type: 'number', value: 10000 },
  { id: '40', section: 'advanced', key: 'debug.enabled', label: '调试模式', description: '是否开启调试日志', type: 'boolean', value: false },
  { id: '41', section: 'advanced', key: 'debug.level', label: '日志级别', description: '系统日志级别', type: 'select', value: 'info', options: [{ label: 'DEBUG', value: 'debug' }, { label: 'INFO', value: 'info' }, { label: 'WARN', value: 'warn' }, { label: 'ERROR', value: 'error' }] }
];

export default function GlobalConfig() {
  const [activeSection, setActiveSection] = useState('general');
  const [configs, setConfigs] = useState<ConfigItem[]>(mockConfigs);
  const [saving, setSaving] = useState(false);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testType, setTestType] = useState('');

  const activeSectionData = sections.find(s => s.id === activeSection);
  const sectionConfigs = configs.filter(c => c.section === activeSection);

  const updateConfig = (id: string, value: any) => {
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, value } : c));
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    setSaving(false);
    setSavedSection(activeSection);
    setTimeout(() => setSavedSection(null), 2000);
  };

  const handleTest = (type: string) => {
    setTestType(type);
    setShowTestModal(true);
  };

  const renderConfigInput = (config: ConfigItem) => {
    switch (config.type) {
      case 'text':
        return (
          <input
            type="text"
            value={config.value}
            onChange={(e) => updateConfig(config.id, e.target.value)}
            placeholder={config.placeholder}
            className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
          />
        );
      case 'number':
        return (
          <input
            type="number"
            value={config.value}
            onChange={(e) => updateConfig(config.id, Number(e.target.value))}
            className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
          />
        );
      case 'password':
        return (
          <div className="relative">
            <input
              type="password"
              value={config.value}
              onChange={(e) => updateConfig(config.id, e.target.value)}
              className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
            />
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        );
      case 'textarea':
        return (
          <textarea
            value={config.value}
            onChange={(e) => updateConfig(config.id, e.target.value)}
            placeholder={config.placeholder}
            rows={3}
            className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none resize-none"
          />
        );
      case 'select':
        return (
          <select
            value={config.value}
            onChange={(e) => updateConfig(config.id, e.target.value)}
            className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
          >
            {config.options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );
      case 'boolean':
        return (
          <button
            onClick={() => updateConfig(config.id, !config.value)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.value ? 'bg-primary' : 'bg-text-muted'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config.value ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">全局配置</h1>
          <p className="text-text-secondary mt-1">管理系统参数和集成配置</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : savedSection === activeSection ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? '保存中...' : savedSection === activeSection ? '已保存' : '保存配置'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <div className="space-y-2">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-start gap-3 p-4 rounded-xl transition-all text-left ${
                  isActive
                    ? 'bg-primary/10 border border-primary/30'
                    : 'bg-card-bg border border-border-color hover:border-primary/50'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isActive ? 'bg-primary/20' : 'bg-page-bg'
                }`}>
                  <Icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-text-secondary'}`} />
                </div>
                <div>
                  <h3 className={`font-medium ${isActive ? 'text-primary' : 'text-text-primary'}`}>
                    {section.name}
                  </h3>
                  <p className="text-text-secondary text-sm">{section.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="col-span-3">
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
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
              {activeSection === 'notification' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTest('email')}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-primary border border-border-color rounded-lg hover:border-primary"
                  >
                    <Mail className="w-4 h-4" />
                    测试邮件
                  </button>
                  <button
                    onClick={() => handleTest('dingtalk')}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-primary border border-border-color rounded-lg hover:border-primary"
                  >
                    <MessageSquare className="w-4 h-4" />
                    测试钉钉
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {sectionConfigs.map((config) => (
                <div key={config.id} className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <label className="font-medium text-text-primary">{config.label}</label>
                      {config.type === 'password' && (
                        <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-xs rounded">敏感</span>
                      )}
                    </div>
                    <p className="text-text-secondary text-sm mb-2">{config.description}</p>
                    {renderConfigInput(config)}
                  </div>
                </div>
              ))}
            </div>

            {activeSection === 'storage' && (
              <div className="mt-6 pt-6 border-t border-border-color">
                <h3 className="font-medium text-text-primary mb-4">存储状态</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-page-bg rounded-lg p-4">
                    <div className="flex items-center gap-2 text-text-secondary text-sm mb-2">
                      <Database className="w-4 h-4" />
                      ES存储
                    </div>
                    <p className="text-2xl font-bold text-text-primary">2.3TB</p>
                    <p className="text-text-muted text-xs">156M 文档</p>
                  </div>
                  <div className="bg-page-bg rounded-lg p-4">
                    <div className="flex items-center gap-2 text-text-secondary text-sm mb-2">
                      <FileText className="w-4 h-4" />
                      日志存储
                    </div>
                    <p className="text-2xl font-bold text-text-primary">856GB</p>
                    <p className="text-text-muted text-xs">30天数据</p>
                  </div>
                  <div className="bg-page-bg rounded-lg p-4">
                    <div className="flex items-center gap-2 text-text-secondary text-sm mb-2">
                      <Activity className="w-4 h-4" />
                      存储健康
                    </div>
                    <p className="text-2xl font-bold text-green-400">健康</p>
                    <p className="text-text-muted text-xs">所有节点正常</p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'integration' && (
              <div className="mt-6 pt-6 border-t border-border-color">
                <h3 className="font-medium text-text-primary mb-4">集成状态</h3>
                <div className="space-y-3">
                  {[
                    { name: 'ITSM工单系统', status: 'connected', lastSync: '2分钟前' },
                    { name: 'CMDB资产系统', status: 'connected', lastSync: '5分钟前' },
                    { name: '威胁情报源', status: 'connected', lastSync: '1小时前' },
                    { name: 'LDAP认证', status: 'disconnected', lastSync: 'N/A' }
                  ].map((item) => (
                    <div key={item.name} className="flex items-center justify-between p-3 bg-page-bg rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${item.status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-text-primary">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-text-secondary text-sm">{item.lastSync}</span>
                        <button className="text-text-secondary hover:text-primary">
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showTestModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowTestModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <div className="glass-card rounded-xl p-6 w-[400px] pointer-events-auto">
                <h3 className="text-lg font-semibold text-text-primary mb-4">
                  测试{testType === 'email' ? '邮件' : '钉钉'}通知
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">接收地址</label>
                    <input
                      type="text"
                      placeholder={testType === 'email' ? 'test@company.com' : '钉钉用户ID'}
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">测试内容</label>
                    <textarea
                      rows={3}
                      defaultValue="这是一条来自USOP安全运营平台的测试消息。"
                      className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none resize-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowTestModal(false)}
                    className="px-4 py-2 text-text-secondary hover:text-text-primary"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => setShowTestModal(false)}
                    className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg"
                  >
                    发送测试
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
