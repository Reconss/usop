import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Mail,
  MessageSquare,
  Bell,
  Send,
  Check,
  X,
  Plus,
  Trash2,
  Edit2,
  TestTube,
  Loader2,
  Clock,
  ShieldCheck,
  RefreshCw,
  History
} from 'lucide-react';

// 通知渠道配置
interface NotificationChannel {
  id: string;
  type: 'email' | 'wechat' | 'dingtalk' | 'webhook';
  name: string;
  enabled: boolean;
  config: Record<string, string>;
  testStatus?: 'pending' | 'success' | 'failed';
}

// 通知规则配置
interface NotificationRule {
  id: string;
  name: string;
  channel: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'all';
  eventType?: string;
  enabled: boolean;
}

const channelIcons: Record<string, React.ElementType> = {
  email: Mail,
  wechat: MessageSquare,
  dingtalk: Send,
  webhook: Bell
};

const channelColors: Record<string, string> = {
  email: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  wechat: 'bg-green-500/10 text-green-400 border-green-500/20',
  dingtalk: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  webhook: 'bg-purple-500/10 text-purple-400 border-purple-500/20'
};


// 审批请求接口
interface ApprovalRequest {
  id: string;
  action_type: string;
  reason: string;
  params: Record<string, any>;
  approval_level: number;
  status: 'pending' | 'approved' | 'rejected';
  requester_id: number;
  requester_name: string;
  approver_id?: number;
  approver_name?: string;
  approved_at?: string;
  created_at: string;
  related_event_id?: string;
}

const actionLabels: Record<string, string> = {
  block_ip: 'IP封禁',
  isolate_host: '主机隔离',
  reset_password: '密码重置',
  modify_firewall: '防火墙修改',
  delete_host: '主机删除'
};
const severityColors: Record<string, string> = {
  critical: 'bg-rose-500/10 text-rose-400',
  high: 'bg-orange-500/10 text-orange-400',
  medium: 'bg-amber-500/10 text-amber-400',
  low: 'bg-blue-500/10 text-blue-400',
  all: 'bg-gray-500/10 text-gray-400'
};

export default function NotificationSettings() {
  const [channels, setChannels] = useState<NotificationChannel[]>([
    {
      id: '1',
      type: 'email',
      name: '安全运营邮箱',
      enabled: true,
      config: {
        smtp_server: 'smtp.company.com',
        smtp_port: '465',
        username: 'security@company.com',
        recipients: 'security-team@company.com, soc@company.com'
      }
    },
    {
      id: '2',
      type: 'wechat',
      name: '企业微信机器人',
      enabled: true,
      config: {
        webhook_url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx'
      }
    },
    {
      id: '3',
      type: 'dingtalk',
      name: '钉钉群机器人',
      enabled: false,
      config: {
        webhook_url: 'https://oapi.dingtalk.com/robot/send?access_token=xxx'
      }
    }
  ]);

  const [rules, setRules] = useState<NotificationRule[]>([
    { id: '1', name: '危急告警通知', channel: '1', severity: 'critical', enabled: true },
    { id: '2', name: '高危告警通知', channel: '1', severity: 'high', enabled: true },
    { id: '3', name: '所有告警企微推送', channel: '2', severity: 'all', enabled: true },
    { id: '4', name: '重大事件钉钉通知', channel: '3', severity: 'critical', enabled: false }
  ]);

    const [activeTab, setActiveTab] = useState<'channels' | 'rules' | 'templates' | 'approvals'>('channels');
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);

  // 审批相关状态
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [approvalTab, setApprovalTab] = useState<'pending' | 'history'>('pending');
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);

  // 测试通知渠道
  const handleTestChannel = async (channel: NotificationChannel) => {
    setTestingChannel(channel.id);
    // 模拟测试请求
    await new Promise(resolve => setTimeout(resolve, 1500));
    setTestingChannel(null);
    alert(`已向 ${channel.name} 发送测试消息`);
  };

  // 切换渠道启用状态
  const toggleChannel = (id: string) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  };


  // 审批相关函数
  const loadApprovals = async () => {
    setApprovalLoading(true);
    try {
      const url = approvalTab === 'pending' 
        ? '/notifications-api/approvals?status=pending'
        : '/notifications-api/approvals?status=approved,rejected';
      const [res] = await Promise.all([
        fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(r => r.json())
      ]);
      if (res.success) {
        setApprovals(res.data.items || []);
      }
    } catch (error) {
      console.error('Failed to load approvals:', error);
    }
    setApprovalLoading(false);
  };

  const handleApproval = async (approved: boolean) => {
    if (!selectedApproval) return;

    try {
      const res = await fetch(`/notifications-api/approvals/${selectedApproval.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ approved })
      });
      const data = await res.json();

      if (data.success) {
        setShowApprovalDialog(false);
        setSelectedApproval(null);
        loadApprovals();
      } else {
        alert('操作失败: ' + (data.error || '未知错误'));
      }
    } catch (error) {
      alert('请求失败: ' + (error as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-page-title text-text-primary">通知设置</h1>
          <p className="text-sm text-text-secondary mt-1">配置告警通知渠道和规则</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors">
            <Plus className="w-4 h-4" />
            添加渠道
          </button>
        </div>
      </div>

      {/* 标签页切换 */}
      <div className="flex items-center gap-1 p-1 bg-card-bg rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('channels')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'channels'
              ? 'bg-primary text-white'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          通知渠道
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'rules'
              ? 'bg-primary text-white'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          通知规则
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'templates'
              ? 'bg-primary text-white'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          消息模板
        </button>
      </div>

      {/* 通知渠道列表 */}
      {activeTab === 'channels' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {channels.map(channel => {
            const Icon = channelIcons[channel.type];
            return (
              <div
                key={channel.id}
                className={`glass-card rounded-xl p-5 border ${channel.enabled ? 'border-border-color' : 'border-border-color/50 opacity-60'}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${channelColors[channel.type]}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-medium text-text-primary">{channel.name}</h3>
                      <p className="text-xs text-text-muted capitalize">{channel.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTestChannel(channel)}
                      disabled={!channel.enabled || testingChannel === channel.id}
                      className="p-2 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
                      title="发送测试消息"
                    >
                      {testingChannel === channel.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <TestTube className="w-4 h-4" />
                      )}
                    </button>
                    <button className="p-2 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={channel.enabled}
                        onChange={() => toggleChannel(channel.id)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-page-bg rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                    </label>
                  </div>
                </div>

                {/* 配置信息 */}
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(channel.config).map(([key, value]) => (
                    <div key={key} className="bg-page-bg rounded-lg p-3">
                      <div className="text-xs text-text-muted mb-1">{key.replace(/_/g, ' ')}</div>
                      <div className="text-sm text-text-primary font-mono truncate">
                        {key.includes('password') || key.includes('token') || key.includes('secret')
                          ? '••••••••'
                          : value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* 通知规则列表 */}
      {activeTab === 'rules' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {rules.map(rule => {
            const channel = channels.find(c => c.id === rule.channel);
            const Icon = channel ? channelIcons[channel.type] : Bell;
            return (
              <div
                key={rule.id}
                className="glass-card rounded-xl p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-text-muted" />
                    <span className="text-sm text-text-primary">{rule.name}</span>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded ${severityColors[rule.severity || 'all']}`}>
                    {rule.severity === 'all' ? '全部' : rule.severity}
                  </span>
                  {channel && (
                    <span className="text-xs text-text-muted">
                      → {channel.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => toggleRule(rule.id)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-page-bg rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                  </label>
                </div>
              </div>
            );
          })}

          <button className="w-full py-3 border border-dashed border-border-color rounded-lg text-text-muted hover:text-primary hover:border-primary transition-colors flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />
            添加通知规则
          </button>
        </motion.div>
      )}

      {/* 审批管理 */}
      {activeTab === 'approvals' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* 标签页切换 */}
          <div className="flex items-center gap-1 p-1 bg-card-bg rounded-lg w-fit">
            <button
              onClick={() => setApprovalTab('pending')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                approvalTab === 'pending'
                  ? 'bg-amber-500 text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Clock className="w-4 h-4" />
              待审批
              {approvals.filter(a => a.status === 'pending').length > 0 && (
                <span className="px-2 py-0.5 text-[10px] bg-white/20 rounded-full">
                  {approvals.filter(a => a.status === 'pending').length}
                </span>
              )}
            </button>
            <button
              onClick={() => setApprovalTab('history')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                approvalTab === 'history'
                  ? 'bg-blue-500 text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <History className="w-4 h-4" />
              审批历史
            </button>
          </div>

          {/* 待审批列表 */}
          {approvalTab === 'pending' && (
            <div className="space-y-3">
              {approvals.filter(a => a.status === 'pending').length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                  <CheckCircle className="w-12 h-12 mb-3 opacity-20" />
                  <div className="text-base font-medium text-text-secondary">全部已处理</div>
                  <div className="text-sm mt-1">暂无待审批的操作请求</div>
                </div>
              ) : (
                approvals.filter(a => a.status === 'pending').map(approval => (
                  <div
                    key={approval.id}
                    className="glass-card rounded-xl p-5 hover:border-amber-500/30 transition-all"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                          <ShieldCheck className="w-4 h-4 text-red-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text-primary">
                              {actionLabels[approval.action_type] || approval.action_type}
                            </span>
                          </div>
                          <span className="text-[10px] text-text-muted font-mono">
                            {approval.created_at}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                        待审批
                      </div>
                    </div>

                    <div className="text-sm text-text-secondary mb-3">
                      <div className="font-medium text-text-primary mb-2">操作描述</div>
                      <div>{approval.reason}</div>
                    </div>

                    {/* 参数展示 */}
                    {Object.keys(approval.params).length > 0 && (
                      <div className="bg-page-bg rounded-lg p-3 mb-4">
                        <div className="text-xs text-text-muted mb-2">操作参数</div>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(approval.params).map(([key, value]) => (
                            <div key={key} className="flex text-xs">
                              <span className="text-text-muted w-24 flex-shrink-0">{key}:</span>
                              <span className="text-text-primary font-mono truncate">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedApproval(approval)}
                        className="flex-1 px-5 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-500 transition-colors flex items-center justify-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        批准执行
                      </button>
                      <button
                        onClick={() => handleApproval(false)}
                        className="flex-1 px-5 py-2 bg-red-600/80 text-white text-sm rounded-lg hover:bg-red-500 transition-colors flex items-center justify-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        拒绝
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 审批历史 */}
          {approvalTab === 'history' && (
            <div className="space-y-3">
              {approvals.filter(a => a.status !== 'pending').length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                  <FileText className="w-12 h-12 mb-3 opacity-20" />
                  <div className="text-base font-medium text-text-secondary">暂无审批记录</div>
                  <div className="text-sm mt-1">审批通过的操作将显示在此处</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {approvals
                    .filter(a => a.status !== 'pending')
                    .sort((a, b) => new Date(b.approved_at || b.created_at).getTime() - new Date(a.approved_at || a.created_at).getTime())
                    .map(approval => (
                      <div
                        key={approval.id}
                        className="glass-card rounded-xl p-4"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${
                              approval.status === 'approved'
                                ? 'bg-emerald-500/10 border border-emerald-500/20'
                                : 'bg-red-500/10 border border-red-500/20'
                            }`}>
                              {approval.status === 'approved' ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <X className="w-4 h-4 text-red-400" />
                              )}
                            </div>
                            <div>
                              <div className="font-medium text-text-primary">
                                {actionLabels[approval.action_type] || approval.action_type}
                              </div>
                              <div className="text-xs text-text-muted mt-1">
                                <span>{approval.requester_name}</span>
                                <span>→</span>
                                <span>{approval.approver_name || '-'}</span>
                              </div>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            approval.status === 'approved'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-red-500/10 text-red-400'
                          }`}>
                            {approval.status === 'approved' ? '已批准' : '已拒绝'}
                          </span>
                        </div>

                        <div className="text-sm text-text-secondary mb-2">{approval.reason}</div>

                        {approval.approved_at && (
                          <div className="text-xs text-text-muted">
                            审批时间: {new Date(approval.approved_at).toLocaleString('zh-CN')}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* 消息模板 */}
      {activeTab === 'templates' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-medium text-text-primary">告警通知模板</h3>
            <button className="text-xs text-primary hover:underline">编辑模板</button>
          </div>
          <div className="bg-page-bg rounded-lg p-4 font-mono text-sm">
            <pre className="text-text-secondary whitespace-pre-wrap">
{`【{{severity}}告警】{{event_title}}

检测时间: {{timestamp}}
风险等级: {{severity}} ({{confidence}}%置信度)
事件类型: {{event_type}}
源IP: {{source_ip}}
影响资产: {{affected_assets}}

描述: {{description}}

建议操作: {{recommended_action}}

---
来自安全运营平台`}
            </pre>
          </div>
          <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="text-xs text-blue-300">
              <strong>变量说明：</strong> 可使用 {'{{severity}}'}, {'{{event_title}}'}, {'{{timestamp}}'}, 
              {'{{confidence}}'}, {'{{event_type}}'}, {'{{source_ip}}'}, 
              {'{{affected_assets}}'}, {'{{description}}'}, {'{{recommended_action}}'} 等变量
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
