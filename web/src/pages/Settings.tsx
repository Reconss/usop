import React, { useState } from 'react';
import { Settings, Bell, Shield, Database, Palette, Save, CheckCircle, AlertCircle } from 'lucide-react';

interface SystemConfig {
  systemName: string;
  logLevel: string;
  dataRetention: string;
  theme: string;
  language: string;
  emailNotification: boolean;
  webhookNotification: boolean;
}

const SettingsPage: React.FC = () => {
  const [config, setConfig] = useState<SystemConfig>({
    systemName: 'USOP统一安全运营平台',
    logLevel: 'info',
    dataRetention: '90',
    theme: 'dark',
    language: 'zh-CN',
    emailNotification: true,
    webhookNotification: false,
  });
  
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    setSuccess('设置已保存');
    setError('');
    setTimeout(() => setSuccess(''), 3000);
  };

  const tabs = [
    { id: 'general', label: '通用设置', icon: Settings },
    { id: 'notification', label: '通知设置', icon: Bell },
    { id: 'security', label: '安全设置', icon: Shield },
    { id: 'data', label: '数据设置', icon: Database },
  ];

  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-text-primary mb-6">系统设置</h1>

      {success && (
        <div className="mb-4 p-4 bg-success/10 border border-success/30 rounded-lg flex items-center gap-2 text-success">
          <CheckCircle className="w-5 h-5" />
          {success}
        </div>
      )}
      {error && (
        <div className="mb-4 p-4 bg-critical/10 border border-critical/30 rounded-lg flex items-center gap-2 text-critical">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <div className="flex gap-6">
        {/* 侧边栏 */}
        <div className="w-56 shrink-0">
          <div className="bg-card-bg border border-border-color rounded-card p-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-secondary hover:bg-page-bg'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-sm">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 bg-card-bg border border-border-color rounded-card p-6">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-text-primary border-b border-border-color pb-4">
                通用设置
              </h2>
              
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-sm text-text-secondary mb-2">系统名称</label>
                  <input
                    type="text"
                    value={config.systemName}
                    onChange={(e) => setConfig({ ...config, systemName: e.target.value })}
                    className="w-full px-4 py-2 bg-page-bg border border-border-color rounded-input text-text-primary focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm text-text-secondary mb-2">语言</label>
                  <select
                    value={config.language}
                    onChange={(e) => setConfig({ ...config, language: e.target.value })}
                    className="w-full px-4 py-2 bg-page-bg border border-border-color rounded-input text-text-primary focus:outline-none focus:border-primary"
                  >
                    <option value="zh-CN">简体中文</option>
                    <option value="en-US">English</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-text-secondary mb-2">主题</label>
                  <select
                    value={config.theme}
                    onChange={(e) => setConfig({ ...config, theme: e.target.value })}
                    className="w-full px-4 py-2 bg-page-bg border border-border-color rounded-input text-text-primary focus:outline-none focus:border-primary"
                  >
                    <option value="dark">深色</option>
                    <option value="light">浅色</option>
                    <option value="auto">自动</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notification' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-text-primary border-b border-border-color pb-4">
                通知设置
              </h2>
              
              <div className="space-y-4">
                <label className="flex items-center justify-between p-4 bg-page-bg rounded-lg cursor-pointer">
                  <div>
                    <div className="text-text-primary font-medium">邮件通知</div>
                    <div className="text-sm text-text-muted">接收重要告警邮件通知</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.emailNotification}
                    onChange={(e) => setConfig({ ...config, emailNotification: e.target.checked })}
                    className="w-5 h-5 accent-primary"
                  />
                </label>

                <label className="flex items-center justify-between p-4 bg-page-bg rounded-lg cursor-pointer">
                  <div>
                    <div className="text-text-primary font-medium">Webhook通知</div>
                    <div className="text-sm text-text-muted">将告警信息推送至外部系统</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.webhookNotification}
                    onChange={(e) => setConfig({ ...config, webhookNotification: e.target.checked })}
                    className="w-5 h-5 accent-primary"
                  />
                </label>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-text-primary border-b border-border-color pb-4">
                安全设置
              </h2>
              
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-sm text-text-secondary mb-2">日志级别</label>
                  <select
                    value={config.logLevel}
                    onChange={(e) => setConfig({ ...config, logLevel: e.target.value })}
                    className="w-full px-4 py-2 bg-page-bg border border-border-color rounded-input text-text-primary focus:outline-none focus:border-primary"
                  >
                    <option value="debug">调试 (Debug)</option>
                    <option value="info">信息 (Info)</option>
                    <option value="warning">警告 (Warning)</option>
                    <option value="error">错误 (Error)</option>
                  </select>
                </div>

                <div className="p-4 bg-page-bg rounded-lg">
                  <div className="text-text-primary font-medium mb-2">会话超时</div>
                  <div className="text-sm text-text-muted">设置用户无操作后自动登出时间</div>
                  <select className="mt-2 w-full px-4 py-2 bg-card-bg border border-border-color rounded-input text-text-primary">
                    <option value="30">30分钟</option>
                    <option value="60">1小时</option>
                    <option value="120">2小时</option>
                    <option value="480">8小时</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-text-primary border-b border-border-color pb-4">
                数据设置
              </h2>
              
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-sm text-text-secondary mb-2">数据保留天数</label>
                  <input
                    type="number"
                    value={config.dataRetention}
                    onChange={(e) => setConfig({ ...config, dataRetention: e.target.value })}
                    className="w-full px-4 py-2 bg-page-bg border border-border-color rounded-input text-text-primary focus:outline-none focus:border-primary"
                  />
                  <p className="text-sm text-text-muted mt-1">超出保留期限的数据将被自动清理</p>
                </div>

                <div className="p-4 bg-page-bg rounded-lg">
                  <div className="text-text-primary font-medium">数据备份</div>
                  <p className="text-sm text-text-muted mt-1 mb-4">手动备份当前系统数据</p>
                  <button className="px-4 py-2 bg-primary text-white rounded-input hover:bg-primary/90 transition-colors">
                    立即备份
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-border-color flex justify-end">
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-primary text-white rounded-input hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
