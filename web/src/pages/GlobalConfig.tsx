import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings, Bell, Shield, Database, Zap,
  Save, Check, RefreshCw, Server, Activity, Sliders,
  Network, Layers, KeyRound, PlugZap, Mail,
  type LucideIcon
} from 'lucide-react';
import { systemConfigApi, systemStatusApi, request as apiRequest } from '../services/api';
import {
  Button,
  ContentContainer,
  Field,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
  Switch,
} from '../components/ui';

/** AD 域配置表单结构 */
interface AdConfig {
  enabled: boolean;
  server_uri: string;
  port: number;
  use_ssl: boolean;
  bind_dn: string;
  bind_password: string;
  base_dn: string;
  user_filter: string;
}

const DEFAULT_AD_CONFIG: AdConfig = {
  enabled: false,
  server_uri: 'ldap://',
  port: 389,
  use_ssl: false,
  bind_dn: '',
  bind_password: '',
  base_dn: '',
  user_filter: '(sAMAccountName={username})',
};

interface ConfigSection {
  id: string;
  name: string;
  icon: LucideIcon;
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

/** SMTP 邮件服务配置表单结构（授权码 '******' 为后端打码值） */
interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  use_ssl: boolean;
  username: string;
  password: string;
  sender_name: string;
  sender_email: string;
  timeout: number;
}

const DEFAULT_SMTP_CONFIG: SmtpConfig = {
  enabled: false,
  host: 'smtp.qq.com',
  port: 465,
  use_ssl: true,
  username: '',
  password: '',
  sender_name: 'USOP安全运营平台',
  sender_email: '',
  timeout: 20,
};

/** 通知渠道配置结构（webhook 中敏感参数 '******' 为后端打码值） */
interface NotifyChannelItem {
  enabled: boolean;
  webhook_url: string;
}

interface NotifyChannelsConfig {
  wecom: NotifyChannelItem;
  dingtalk: NotifyChannelItem;
  feishu: NotifyChannelItem;
  slack: NotifyChannelItem;
  webhook: NotifyChannelItem;
  email: { enabled: boolean; default_recipients: string };
}

const emptyChannel = (): NotifyChannelItem => ({ enabled: false, webhook_url: '' });

const DEFAULT_NOTIFY_CONFIG: NotifyChannelsConfig = {
  wecom: emptyChannel(),
  dingtalk: emptyChannel(),
  feishu: emptyChannel(),
  slack: emptyChannel(),
  webhook: emptyChannel(),
  email: { enabled: false, default_recipients: '' },
};

/** 通知渠道展示元数据（顺序即渲染顺序） */
const NOTIFY_CHANNEL_META: {
  key: keyof Omit<NotifyChannelsConfig, 'email'>;
  name: string;
  desc: string;
  placeholder: string;
}[] = [
  { key: 'wecom', name: '企业微信', desc: '群机器人 Webhook（安全设置选关键词或 IP 白名单，禁加签）', placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx' },
  { key: 'dingtalk', name: '钉钉', desc: '群机器人 Webhook（安全设置选关键词或 IP 白名单，禁加签）', placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=xxx' },
  { key: 'feishu', name: '飞书', desc: '群机器人 Webhook（Lark 同源）', placeholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx' },
  { key: 'slack', name: 'Slack', desc: 'Incoming Webhook', placeholder: 'https://hooks.slack.com/services/T000/B000/xxx' },
  { key: 'webhook', name: '通用 Webhook', desc: '自定义接收端，POST {title, content} JSON', placeholder: 'https://your.internal/api/notify' },
];

const sections: ConfigSection[] = [
  { id: 'general', name: '基础设置', icon: Settings, description: '系统基础参数' },
  { id: 'auth_ad', name: 'AD 域认证', icon: KeyRound, description: 'Active Directory LDAP 登录' },
  { id: 'smtp_email', name: '邮件服务', icon: Mail, description: 'SMTP 发信（报告推送）' },
  { id: 'notify_channels', name: '通知渠道', icon: Bell, description: '企微/钉钉/飞书/Slack · 邮件' },
  { id: 'security', name: '安全设置', icon: Shield, description: '安全策略与认证' },
  { id: 'storage', name: '存储配置', icon: Database, description: 'Kafka · Redis · PostgreSQL · ES' },
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

  // 通知渠道：走独立接口 /users-api/notify-config（见 notify_channels 分区），不再使用假键值

  // 安全设置
  { key: 'auth.password_min_length', section: 'security', label: '密码最小长度', description: '用户密码最小字符数', type: 'number', value: 8 },
  { key: 'auth.token_expire', section: 'security', label: 'Token有效期(h)', description: 'API Token过期时间', type: 'number', value: 24 },
  { key: 'audit.retention_days', section: 'security', label: '审计日志保留(天)', description: '操作审计日志保留天数', type: 'number', value: 90 },
  { key: 'alert.retention_days', section: 'security', label: '告警数据保留(天)', description: '历史告警数据保留天数', type: 'number', value: 365 },

  // 存储配置 - 与现网架构一致：Kafka(消息总线) / Redis(去重缓存) / PostgreSQL(业务)
  // Elasticsearch(告警存储，唯一真相源)
  { key: 'kafka.bootstrap', section: 'storage', label: 'Kafka地址', description: '消息总线（告警流转：设备topic→标准化→分流出口）', type: 'text', value: 'kafka:29092', placeholder: 'kafka:29092' },
  { key: 'redis.url', section: 'storage', label: 'Redis地址', description: '去重窗口与缓存（重启不丢）', type: 'text', value: 'redis://redis:6379/0', placeholder: 'redis://redis:6379/0' },
  { key: 'pg.host', section: 'storage', label: 'PostgreSQL地址', description: '业务数据库（用户/事件/规则/审计）', type: 'text', value: 'usop_postgres', placeholder: 'usop_postgres' },
  { key: 'pg.port', section: 'storage', label: 'PostgreSQL端口', description: '业务数据库端口', type: 'number', value: 5432 },
  { key: 'pg.database', section: 'storage', label: 'PostgreSQL数据库', description: '业务数据库名称', type: 'text', value: 'usop_security' },
  { key: 'es.host', section: 'storage', label: 'Elasticsearch地址', description: '告警存储（alerts-valid / alerts-invalid，唯一真相源）', type: 'text', value: 'elasticsearch', placeholder: 'elasticsearch' },
  { key: 'es.port', section: 'storage', label: 'Elasticsearch端口', description: '告警检索端口', type: 'number', value: 9200 },
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
  const [storageStatus, setStorageStatus] = useState<any>(null);

  // ── AD 域认证配置（独立于通用键值配置，走 /users-api/ad-config）──
  const [adConfig, setAdConfig] = useState<AdConfig>(DEFAULT_AD_CONFIG);
  const [adLoaded, setAdLoaded] = useState(false);
  const [adSaving, setAdSaving] = useState(false);
  const [adTesting, setAdTesting] = useState(false);
  const [adTestResult, setAdTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [adError, setAdError] = useState('');

  // ── SMTP 邮件服务配置（独立分区，走 /users-api/smtp-config）──
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>(DEFAULT_SMTP_CONFIG);
  const [smtpLoaded, setSmtpLoaded] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [smtpError, setSmtpError] = useState('');

  // ── 通知渠道配置（独立分区，走 /users-api/notify-config）──
  const [notifyConfig, setNotifyConfig] = useState<NotifyChannelsConfig>(DEFAULT_NOTIFY_CONFIG);
  const [notifyLoaded, setNotifyLoaded] = useState(false);
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifyTesting, setNotifyTesting] = useState<string | null>(null); // 正在测试的渠道 key
  const [notifyTestResult, setNotifyTestResult] = useState<{ channel: string; ok: boolean; msg: string } | null>(null);
  const [notifyError, setNotifyError] = useState('');

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

  // 存储状态：使用真实接口，取不到时显示「未知」而不是写死「正常」
  useEffect(() => {
    systemStatusApi.getStorageStatus()
      .then((res: any) => { if (res?.success) setStorageStatus(res.data); })
      .catch(() => setStorageStatus(null));
  }, []);

  // 切到 AD 域认证分区时加载配置（'******' 为后端打码的服务账号密码）
  useEffect(() => {
    if (activeSection !== 'auth_ad' || adLoaded) return;
    apiRequest('/users-api/ad-config')
      .then((r: any) => { if (r?.success && r.data) setAdConfig({ ...DEFAULT_AD_CONFIG, ...r.data }); })
      .catch(() => {})
      .finally(() => setAdLoaded(true));
  }, [activeSection, adLoaded]);

  // 切到邮件服务分区时加载配置（'******' 为后端打码的 SMTP 授权码）
  useEffect(() => {
    if (activeSection !== 'smtp_email' || smtpLoaded) return;
    apiRequest('/users-api/smtp-config')
      .then((r: any) => { if (r?.success && r.data) setSmtpConfig({ ...DEFAULT_SMTP_CONFIG, ...r.data }); })
      .catch(() => {})
      .finally(() => setSmtpLoaded(true));
  }, [activeSection, smtpLoaded]);

  // 切到通知渠道分区时加载配置（'******' 为后端打码的 webhook 参数）
  useEffect(() => {
    if (activeSection !== 'notify_channels' || notifyLoaded) return;
    apiRequest('/users-api/notify-config')
      .then((r: any) => {
        if (r?.success && r.data) {
          const d = r.data;
          setNotifyConfig({
            wecom: { ...emptyChannel(), ...d.wecom },
            dingtalk: { ...emptyChannel(), ...d.dingtalk },
            feishu: { ...emptyChannel(), ...d.feishu },
            slack: { ...emptyChannel(), ...d.slack },
            webhook: { ...emptyChannel(), ...d.webhook },
            email: { ...DEFAULT_NOTIFY_CONFIG.email, ...d.email },
          });
        }
      })
      .catch(() => {})
      .finally(() => setNotifyLoaded(true));
  }, [activeSection, notifyLoaded]);

  const handleAdTest = async () => {
    setAdTestResult(null);
    setAdError('');
    setAdTesting(true);
    try {
      const r: any = await apiRequest('/users-api/ad-test', { method: 'POST', body: adConfig });
      setAdTestResult({ ok: Boolean(r?.success), msg: r?.message || r?.error || (r?.success ? '连接成功' : '连接失败') });
    } catch (e: any) {
      setAdTestResult({ ok: false, msg: e?.message || '连接失败' });
    } finally {
      setAdTesting(false);
    }
  };

  const handleAdSave = async () => {
    if (!adConfig.server_uri.trim().startsWith('ldap')) {
      setAdError('服务器地址必须以 ldap:// 或 ldaps:// 开头');
      return;
    }
    if (!adConfig.base_dn.trim()) {
      setAdError('Base DN 不能为空');
      return;
    }
    setAdError('');
    setAdSaving(true);
    try {
      const r: any = await apiRequest('/users-api/ad-config', { method: 'POST', body: adConfig });
      if (r?.success) {
        setSavedSection('auth_ad');
        setTimeout(() => setSavedSection(null), 2000);
      } else {
        setAdError(r?.error || '保存失败');
      }
    } catch (e: any) {
      setAdError(e?.message || '保存失败');
    } finally {
      setAdSaving(false);
    }
  };

  const handleSmtpTest = async () => {
    setSmtpTestResult(null);
    setSmtpError('');
    setSmtpTesting(true);
    try {
      const r: any = await apiRequest('/users-api/smtp-test', { method: 'POST', body: smtpConfig });
      setSmtpTestResult({ ok: Boolean(r?.success), msg: r?.message || r?.error || (r?.success ? '连接成功' : '连接失败') });
    } catch (e: any) {
      setSmtpTestResult({ ok: false, msg: e?.message || '连接失败' });
    } finally {
      setSmtpTesting(false);
    }
  };

  const handleSmtpSave = async () => {
    if (!smtpConfig.host.trim() || !smtpConfig.username.trim()) {
      setSmtpError('SMTP 服务器与发件账号不能为空');
      return;
    }
    setSmtpError('');
    setSmtpSaving(true);
    try {
      const r: any = await apiRequest('/users-api/smtp-config', { method: 'POST', body: smtpConfig });
      if (r?.success) {
        setSavedSection('smtp_email');
        setTimeout(() => setSavedSection(null), 2000);
      } else {
        setSmtpError(r?.error || '保存失败');
      }
    } catch (e: any) {
      setSmtpError(e?.message || '保存失败');
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleNotifyTest = async (channelKey: string) => {
    setNotifyTestResult(null);
    setNotifyError('');
    setNotifyTesting(channelKey);
    try {
      const r: any = await apiRequest('/users-api/notify-test', {
        method: 'POST',
        body: { channel: channelKey, webhook_url: notifyConfig[channelKey]?.webhook_url || '' },
      });
      setNotifyTestResult({ channel: channelKey, ok: Boolean(r?.success), msg: r?.message || r?.error || (r?.success ? '测试通过' : '测试失败') });
    } catch (e: any) {
      setNotifyTestResult({ channel: channelKey, ok: false, msg: e?.message || '测试失败' });
    } finally {
      setNotifyTesting(null);
    }
  };

  const handleNotifySave = async () => {
    setNotifyError('');
    setNotifySaving(true);
    try {
      const r: any = await apiRequest('/users-api/notify-config', { method: 'POST', body: notifyConfig });
      if (r?.success && r.data) {
        // 回填打码后的值，保持与后端展示一致
        const d = r.data;
        setNotifyConfig({
          wecom: { ...emptyChannel(), ...d.wecom },
          dingtalk: { ...emptyChannel(), ...d.dingtalk },
          feishu: { ...emptyChannel(), ...d.feishu },
          slack: { ...emptyChannel(), ...d.slack },
          webhook: { ...emptyChannel(), ...d.webhook },
          email: { ...DEFAULT_NOTIFY_CONFIG.email, ...d.email },
        });
        setSavedSection('notify_channels');
        setTimeout(() => setSavedSection(null), 2000);
      } else {
        setNotifyError(r?.error || '保存失败');
      }
    } catch (e: any) {
      setNotifyError(e?.message || '保存失败');
    } finally {
      setNotifySaving(false);
    }
  };

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
    switch (config.type) {
      case 'text':
        return <input type="text" value={config.value} onChange={e => updateConfig(config.key, e.target.value)} placeholder={config.placeholder} className="app-input" />;
      case 'number':
        return <input type="number" value={config.value} onChange={e => updateConfig(config.key, Number(e.target.value))} className="app-input" />;
      case 'password':
        return <input type="password" value={config.value} onChange={e => updateConfig(config.key, e.target.value)} className="app-input" />;
      case 'select':
        return (
          <select value={config.value} onChange={e => updateConfig(config.key, e.target.value)} className="app-select">
            {config.options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        );
      case 'boolean':
        return (
          <button
            type="button"
            role="switch"
            aria-checked={!!config.value}
            onClick={() => updateConfig(config.key, !config.value)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.value ? 'bg-primary' : 'bg-surface-3'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${config.value ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        );
      default: return null;
    }
  };

  if (loading) {
    return (
      <ContentContainer>
        <LoadingState label="正在加载系统配置…" skeletonRows={6} />
      </ContentContainer>
    );
  }

  const healthy = (v: any) => (v?.status === 'healthy' || v?.status === 'ok' || v?.connected === true);

  return (
    <ContentContainer>
      <PageHeader
        title="全局配置"
        icon={Sliders}
        actions={
          activeSection === 'auth_ad' ? (
            <>
              <Button variant="secondary" icon={PlugZap} loading={adTesting} onClick={handleAdTest}>
                测试连接
              </Button>
              <Button variant="primary" icon={savedSection === 'auth_ad' ? Check : Save} loading={adSaving} onClick={handleAdSave}>
                {adSaving ? '保存中…' : savedSection === 'auth_ad' ? '已保存' : '保存配置'}
              </Button>
            </>
          ) : activeSection === 'smtp_email' ? (
            <>
              <Button variant="secondary" icon={PlugZap} loading={smtpTesting} onClick={handleSmtpTest}>
                测试连接
              </Button>
              <Button variant="primary" icon={savedSection === 'smtp_email' ? Check : Save} loading={smtpSaving} onClick={handleSmtpSave}>
                {smtpSaving ? '保存中…' : savedSection === 'smtp_email' ? '已保存' : '保存配置'}
              </Button>
            </>
          ) : activeSection === 'notify_channels' ? (
            <Button variant="primary" icon={savedSection === 'notify_channels' ? Check : Save} loading={notifySaving} onClick={handleNotifySave}>
              {notifySaving ? '保存中…' : savedSection === 'notify_channels' ? '已保存' : '保存配置'}
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={savedSection === activeSection ? Check : Save}
              loading={saving}
              onClick={handleSave}
            >
              {saving ? '保存中…' : savedSection === activeSection ? '已保存' : '保存配置'}
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[236px_minmax(0,1fr)]">
        {/* 左侧分区导航 */}
        <nav className="flex flex-col gap-2" aria-label="配置分区">
          {sections.map(section => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`flex items-start gap-3 rounded-card border p-3 text-left transition-colors ${
                  isActive
                    ? 'border-primary/35 bg-primary/10'
                    : 'border-border-color bg-card-bg hover:border-border-color-hover hover:bg-card-bg-hover'
                }`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-primary/20 text-primary' : 'bg-surface-2 text-text-secondary'}`}>
                  <Icon size={16} />
                </span>
                <span className="min-w-0">
                  <span className={`block text-[13px] font-medium ${isActive ? 'text-primary' : 'text-text-primary'}`}>
                    {section.name}
                  </span>
                  <span className="block truncate-1 text-[11px] text-text-muted">{section.description}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* 右侧配置表单 */}
        {activeSection === 'notify_channels' ? (
          <SectionCard
            title="通知渠道"
            description="剧本「发送通知」节点与平台通知的基础配置：各渠道 Webhook 在此集中维护，节点未单独填写 Webhook 时自动使用此处默认值；邮件渠道使用「邮件服务」的 SMTP 配置发信"
            icon={Bell}
          >
            <div className="flex flex-col gap-4">
              {NOTIFY_CHANNEL_META.map(ch => {
                const item = notifyConfig[ch.key];
                return (
                  <div key={ch.key} className="rounded-card border border-border-color p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[13px] font-medium text-text-primary">{ch.name}</span>
                        <p className="mt-0.5 text-[11px] text-text-muted">{ch.desc}</p>
                      </div>
                      <Switch
                        checked={item.enabled}
                        onChange={(v) => setNotifyConfig({ ...notifyConfig, [ch.key]: { ...item, enabled: v } })}
                        label={item.enabled ? '启用' : '停用'}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={item.webhook_url}
                        onChange={(e) => setNotifyConfig({ ...notifyConfig, [ch.key]: { ...item, webhook_url: e.target.value } })}
                        placeholder={ch.placeholder}
                        className="app-input flex-1 font-mono"
                      />
                      <Button
                        variant="secondary"
                        icon={PlugZap}
                        loading={notifyTesting === ch.key}
                        onClick={() => handleNotifyTest(ch.key)}
                      >
                        测试
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* 邮件渠道默认收件人 */}
              <div className="rounded-card border border-border-color p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[13px] font-medium text-text-primary">邮件</span>
                    <p className="mt-0.5 text-[11px] text-text-muted">通过「邮件服务」的 SMTP 发信；此收件人为剧本「发送通知」邮件渠道的默认收件人</p>
                  </div>
                  <Switch
                    checked={notifyConfig.email.enabled}
                    onChange={(v) => setNotifyConfig({ ...notifyConfig, email: { ...notifyConfig.email, enabled: v } })}
                    label={notifyConfig.email.enabled ? '启用' : '停用'}
                  />
                </div>
                <input
                  value={notifyConfig.email.default_recipients}
                  onChange={(e) => setNotifyConfig({ ...notifyConfig, email: { ...notifyConfig.email, default_recipients: e.target.value } })}
                  placeholder="默认收件人，多个用逗号分隔，如 soc@company.com,15596678020@163.com"
                  className="app-input font-mono"
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    variant="secondary"
                    icon={PlugZap}
                    loading={notifyTesting === 'email'}
                    onClick={() => handleNotifyTest('email')}
                  >
                    发送测试邮件
                  </Button>
                  <span className="text-[11px] text-text-muted">向默认收件人真实发信（需先在「邮件服务」开启 SMTP）</span>
                </div>
              </div>

              {notifyTestResult && (
                <div className={`callout ${notifyTestResult.ok ? 'callout-success' : 'callout-danger'}`}>
                  <span>{notifyTestResult.msg}</span>
                </div>
              )}
              {notifyError && <div className="callout callout-danger">{notifyError}</div>}

              <div className="callout callout-info">
                <span>企业微信/钉钉/飞书机器人加签模式不支持（引擎只做静态 POST），安全设置请选择「自定义关键词」或「IP 白名单」</span>
              </div>
            </div>
          </SectionCard>
        ) : activeSection === 'smtp_email' ? (
          <SectionCard
            title="邮件服务（SMTP）"
            description="配置 SMTP 发信通道。剧本「发送邮件」节点（如安全运营报告推送）使用此配置；QQ 邮箱请在「设置→账户」开启 IMAP/SMTP 并使用授权码（非登录密码）"
            icon={Mail}
          >
            <div className="flex flex-col gap-4">
              <Field label="启用邮件服务">
                <div className="flex items-center gap-2.5">
                  <Switch
                    checked={smtpConfig.enabled}
                    onChange={(v) => setSmtpConfig({ ...smtpConfig, enabled: v })}
                    label={smtpConfig.enabled ? '已启用' : '未启用'}
                  />
                  <span className="text-[11px] text-text-muted">
                    {smtpConfig.enabled ? '剧本邮件节点将真实发信' : '未启用时邮件节点会返回未启用错误'}
                  </span>
                </div>
              </Field>

              <div className="grid grid-cols-[1fr_110px] gap-3">
                <Field label="SMTP 服务器" required>
                  <input
                    value={smtpConfig.host}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                    placeholder="smtp.qq.com"
                    className="app-input font-mono"
                  />
                </Field>
                <Field label="端口">
                  <input
                    type="number"
                    value={smtpConfig.port}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, port: Number(e.target.value) || 465 })}
                    className="app-input num"
                  />
                </Field>
              </div>

              <Field label="连接方式" help="465 → SSL 直连；587 → STARTTLS">
                <Switch
                  checked={smtpConfig.use_ssl}
                  onChange={(v) => setSmtpConfig({ ...smtpConfig, use_ssl: v, port: v ? 465 : 587 })}
                  label={smtpConfig.use_ssl ? 'SSL (465)' : 'STARTTLS (587)'}
                />
              </Field>

              <Field label="发件账号" required help="发件邮箱完整地址，如 2702006890@qq.com">
                <input
                  value={smtpConfig.username}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, username: e.target.value.trim() })}
                  placeholder="2702006890@qq.com"
                  className="app-input font-mono"
                />
              </Field>

              <Field label="授权码" help={smtpConfig.password === '******' ? '已保存（输入新值可覆盖）' : 'QQ 邮箱请使用 SMTP 授权码，不是登录密码'}>
                <input
                  type="password"
                  value={smtpConfig.password}
                  onChange={(e) => setSmtpConfig({ ...smtpConfig, password: e.target.value })}
                  placeholder="SMTP 授权码"
                  className="app-input"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="发件人名称">
                  <input
                    value={smtpConfig.sender_name}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, sender_name: e.target.value })}
                    placeholder="USOP安全运营平台"
                    className="app-input"
                  />
                </Field>
                <Field label="发件人地址" help="留空则同发件账号">
                  <input
                    value={smtpConfig.sender_email}
                    onChange={(e) => setSmtpConfig({ ...smtpConfig, sender_email: e.target.value.trim() })}
                    placeholder="留空 = 发件账号"
                    className="app-input font-mono"
                  />
                </Field>
              </div>

              {smtpTestResult && (
                <div className={`callout ${smtpTestResult.ok ? 'callout-success' : 'callout-danger'}`}>
                  <span>{smtpTestResult.msg}</span>
                </div>
              )}
              {smtpError && <div className="callout callout-danger">{smtpError}</div>}
            </div>
          </SectionCard>
        ) : activeSection === 'auth_ad' ? (          <SectionCard
            title="AD 域认证"
            description="配置 Active Directory LDAP 登录。启用后，AD 域账号登录时由域控制器校验口令，本地账号不受影响"
            icon={KeyRound}
          >
            <div className="flex flex-col gap-4">
              <Field label="启用 AD 域认证">
                <div className="flex items-center gap-2.5">
                  <Switch
                    checked={adConfig.enabled}
                    onChange={(v) => setAdConfig({ ...adConfig, enabled: v })}
                    label={adConfig.enabled ? '已启用' : '未启用'}
                  />
                  <span className="text-[11px] text-text-muted">
                    {adConfig.enabled ? 'AD 域账号将走 LDAP 校验' : '域账号登录将提示「AD 域认证未启用」'}
                  </span>
                </div>
              </Field>

              <div className="grid grid-cols-[1fr_110px] gap-3">
                <Field label="服务器地址" required>
                  <input
                    value={adConfig.server_uri}
                    onChange={(e) => setAdConfig({ ...adConfig, server_uri: e.target.value })}
                    placeholder="ldap://dc01.corp.com 或 ldaps://…"
                    className="app-input font-mono"
                  />
                </Field>
                <Field label="端口">
                  <input
                    type="number"
                    value={adConfig.port}
                    onChange={(e) => setAdConfig({ ...adConfig, port: Number(e.target.value) || 389 })}
                    className="app-input num"
                  />
                </Field>
              </div>

              <Field label="Base DN" required help="用户搜索起点，如 DC=corp,DC=com">
                <input
                  value={adConfig.base_dn}
                  onChange={(e) => setAdConfig({ ...adConfig, base_dn: e.target.value })}
                  placeholder="DC=corp,DC=com"
                  className="app-input font-mono"
                />
              </Field>

              <Field label="服务账号 DN" help="可选；用于先搜索用户 DN 再验证。留空则直接用登录名绑定">
                <input
                  value={adConfig.bind_dn}
                  onChange={(e) => setAdConfig({ ...adConfig, bind_dn: e.target.value })}
                  placeholder="CN=svc-usop,OU=Service,DC=corp,DC=com"
                  className="app-input font-mono"
                />
              </Field>

              <Field label="服务账号密码" help={adConfig.bind_password === '******' ? '已保存（输入新值可覆盖）' : undefined}>
                <input
                  type="password"
                  value={adConfig.bind_password}
                  onChange={(e) => setAdConfig({ ...adConfig, bind_password: e.target.value })}
                  placeholder="服务账号密码"
                  className="app-input"
                />
              </Field>

              <Field label="用户搜索过滤器" help="{username} 为占位符，登录时替换为用户输入的用户名">
                <input
                  value={adConfig.user_filter}
                  onChange={(e) => setAdConfig({ ...adConfig, user_filter: e.target.value })}
                  placeholder="(sAMAccountName={username})"
                  className="app-input font-mono"
                />
              </Field>

              <Field label="SSL">
                <Switch
                  checked={adConfig.use_ssl}
                  onChange={(v) => setAdConfig({ ...adConfig, use_ssl: v, port: v ? 636 : 389 })}
                  label={adConfig.use_ssl ? 'ldaps (636)' : 'ldap (389)'}
                />
              </Field>

              {adTestResult && (
                <div className={`callout ${adTestResult.ok ? 'callout-success' : 'callout-danger'}`}>
                  <span>
                    {adTestResult.msg}
                    {adTestResult.ok && adTestResult.msg.includes('可搜索') && ' — Base DN 搜索验证通过'}
                  </span>
                </div>
              )}
              {adError && <div className="callout callout-danger">{adError}</div>}
            </div>
          </SectionCard>
        ) : (
        <SectionCard
          title={activeSectionData?.name}
          description={activeSectionData?.description}
          icon={activeSectionData?.icon}
        >
          <div className="divide-y divide-border-color">
            {sectionConfigs.map(config => (
              <div key={config.key} className="flex flex-col gap-2 py-4 first:pt-0 md:flex-row md:items-start md:gap-8">
                <div className="md:w-[240px] md:shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-text-primary">{config.label}</span>
                    {config.type === 'password' && <StatusBadge tone="warning">敏感</StatusBadge>}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">{config.description}</p>
                </div>
                <div className="min-w-0 flex-1">{renderInput(config)}</div>
              </div>
            ))}
          </div>

          {/* 存储状态：真实接口数据 */}
          {activeSection === 'storage' && (
            <div className="mt-5 border-t border-border-color pt-5">
              <h3 className="section-title mb-3">
                <Activity size={14} className="text-primary" />
                存储连接状态
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { key: 'kafka', name: 'Kafka', icon: Network, desc: '消息总线 · 告警流转' },
                  { key: 'redis', name: 'Redis', icon: Layers, desc: '去重窗口 / 缓存' },
                  { key: 'postgres', name: 'PostgreSQL', icon: Server, desc: '业务数据 / 事件 / 审计' },
                  { key: 'elasticsearch', name: 'Elasticsearch', icon: Database, desc: '告警存储（唯一真相源）' },
                ].map((item) => {
                  const st = storageStatus?.[item.key];
                  const ok = healthy(st);
                  const known = !!st;
                  return (
                    <div key={item.key} className="app-panel">
                      <div className="mb-2 flex items-center gap-2 text-[12px] text-text-secondary">
                        <item.icon size={13} />
                        {item.name}
                      </div>
                      <div className="flex items-center gap-2">
                        {known ? (
                          <StatusBadge tone={ok ? 'success' : 'danger'} dot>
                            {ok ? '正常' : (st?.status || '异常')}
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral" dot>未知</StatusBadge>
                        )}
                      </div>
                      <p className="mt-2 text-[11px] text-text-muted">{item.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </SectionCard>
        )}
      </div>
    </ContentContainer>
  );
}
