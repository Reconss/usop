import React, { useState, useEffect } from 'react';
import {
  X, ChevronRight, AlertTriangle, Clock, MapPin, Globe, Shield, FileText,
  Network, Monitor, Terminal, Activity, Eye, Database, Bug, Lock,
  User, Building, Server, Cloud, Wifi, Link2, ExternalLink, Copy,
  CheckCircle, XCircle, AlertCircle, Info, RefreshCw, Download, Tag,
  Layers, GitBranch, Target, Crosshair, TrendingUp, TrendingDown,
  BarChart3, PieChart, Clock3, Calendar, Bell, BellOff, ArrowLeft,
  Send, MessageSquare, Paperclip, History, Filter, Search, Zap, Skull
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SecurityAlert, AlertAnalysisContext, ThreatIntel, ATTACKTechnique, KillChainPhase } from '../types';
import { eventActionsApi } from '../services/api';

// 严重度配置
const severityConfig = {
  critical: { color: 'bg-rose-500', text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30', label: '危急' },
  high: { color: 'bg-orange-500', text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', label: '高危' },
  medium: { color: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: '中危' },
  low: { color: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', label: '低危' },
  info: { color: 'bg-gray-500', text: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30', label: '信息' }
};

// 产品类型配置
const productTypeConfig: Record<string, { icon: any; name: string; color: string }> = {
  waf: { icon: Shield, name: 'Web应用防火墙', color: 'text-blue-400' },
  hids: { icon: Monitor, name: '主机入侵检测', color: 'text-green-400' },
  ids: { icon: Network, name: '网络入侵检测', color: 'text-purple-400' },
  edr: { icon: Target, name: '终端检测响应', color: 'text-red-400' },
  firewall: { icon: Lock, name: '防火墙', color: 'text-orange-400' },
  siem: { icon: BarChart3, name: 'SIEM', color: 'text-cyan-400' },
  cloud: { icon: Cloud, name: '云安全', color: 'text-indigo-400' },
  database: { icon: Database, name: '数据库审计', color: 'text-yellow-400' },
  email: { icon: Wifi, name: '邮件安全', color: 'text-pink-400' },
  other: { icon: Activity, name: '其他', color: 'text-gray-400' }
};

// 攻击链阶段配置
const killChainConfig: Record<KillChainPhase, { order: number; name: string; color: string; bg: string }> = {
  reconnaissance: { order: 1, name: '侦察', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  weaponization: { order: 2, name: '武器化', color: 'text-purple-400', bg: 'bg-purple-500/20' },
  delivery: { order: 3, name: '投递', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  exploitation: { order: 4, name: '利用', color: 'text-orange-400', bg: 'bg-orange-500/20' },
  installation: { order: 5, name: '安装', color: 'text-red-400', bg: 'bg-red-500/20' },
  command_control: { order: 6, name: '命令控制', color: 'text-rose-400', bg: 'bg-rose-500/20' },
  actions: { order: 7, name: '目标行动', color: 'text-pink-400', bg: 'bg-pink-500/20' },
  impact: { order: 8, name: '影响', color: 'text-gray-400', bg: 'bg-gray-500/20' }
};

// IP信誉等级配置
const reputationConfig = {
  malicious: { color: 'text-rose-400', bg: 'bg-rose-500/20', label: '恶意', icon: Skull },
  suspicious: { color: 'text-orange-400', bg: 'bg-orange-500/20', label: '可疑', icon: AlertTriangle },
  neutral: { color: 'text-gray-400', bg: 'bg-gray-500/20', label: '中立', icon: Minus },
  whitelist: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: '白名单', icon: CheckCircle }
};

// 内联 Minus 组件（因为lucide可能没有）
const Minus = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
  </svg>
);

interface AlertDetailProps {
  alert: SecurityAlert;
  onClose: () => void;
  onCreateEvent?: (alertId: string) => void;
  onMarkFalsePositive?: (alertId: string) => void;
}

export default function AlertDetail({ alert, onClose, onCreateEvent, onMarkFalsePositive }: AlertDetailProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'request' | 'process' | 'network' | 'attack_chain' | 'timeline' | 'related'>('overview');
  const [analysisContext, setAnalysisContext] = useState<AlertAnalysisContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // 模拟加载分析上下文
  useEffect(() => {
    const loadAnalysisContext = async () => {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 500));
      setAnalysisContext({
        relatedAlerts: [],
        relatedEvents: [],
        assetInfo: {
          id: 'asset-001',
          name: alert.targetHostname || alert.targetIp,
          type: 'server',
          ip: alert.targetIp,
          owner: '运维组',
          riskScore: 85,
          openVulnerabilities: 3,
          lastScan: '2026-04-27T08:00:00Z'
        },
        threatIntel: {
          ipReputation: alert.sourceReputation || {
            level: 'suspicious',
            categories: ['scanning', 'brute-force'],
            firstSeen: '2026-01-01',
            lastSeen: '2026-04-27',
            threatType: 'scanner',
            confidence: 75
          }
        },
        attackChain: alert.killChainPhase ? {
          phases: [{
            phase: alert.killChainPhase,
            alerts: [alert],
            startTime: alert.timestamp,
          }],
          confidence: alert.confidence,
          summary: '检测到攻击行为'
        } : undefined,
        suggestedActions: [
          { action: '封禁IP', reason: 'IP信誉为可疑', automated: true },
          { action: '隔离主机', reason: '检测到恶意进程', automated: false },
          { action: '生成事件', reason: '高危告警需要进一步分析', automated: false }
        ]
      });
      setLoading(false);
    };
    loadAnalysisContext();
  }, [alert]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const severity = severityConfig[alert.severity];
  const productConfig = productTypeConfig[alert.productType];
  const ProductIcon = productConfig?.icon || Activity;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-7xl max-h-[90vh] bg-card-bg rounded-2xl border border-border-color overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className={`px-6 py-4 border-b border-border-color bg-gradient-to-r ${severity.bg} to-transparent`}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              {/* 告警图标 */}
              <div className={`w-14 h-14 rounded-xl ${severity.bg} flex items-center justify-center ${severity.text}`}>
                <AlertTriangle className="w-7 h-7" />
              </div>
              
              {/* 基本信息 */}
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${severity.bg} ${severity.text}`}>
                    {severity.label}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${productConfig?.color} bg-white/10`}>
                    <ProductIcon className="w-3 h-3 inline mr-1" />
                    {productConfig?.name}
                </div>
                
                <h2 className="text-xl font-semibold text-text-primary mb-1">{alert.title}</h2>
                
                <div className="flex items-center gap-4 text-sm text-text-secondary">
                  <span className="font-mono">{alert.alertCode}</span>
                  <span>•</span>
                  <span>{new Date(alert.timestamp).toLocaleString('zh-CN')}</span>
                  {alert.count && alert.count > 1 && (
                    <>
                      <span>•</span>
                      <span className="text-amber-400">×{alert.count}次</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {/* 操作按钮 */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onCreateEvent?.(alert.alertId)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
              >
                <Zap className="w-4 h-4" />
                生成事件
              </button>
              <button
                onClick={() => onMarkFalsePositive?.(alert.alertId)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                误报
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-text-muted" />
              </button>
            </div>
          </div>
          
          {/* 快速摘要 */}
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className="flex items-center gap-3 px-4 py-3 bg-page-bg/50 rounded-xl">
              <MapPin className="w-5 h-5 text-rose-400" />
              <div>
                <div className="text-xs text-text-muted">源IP</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-text-primary">{alert.sourceIp}</span>
                  <button
                    onClick={() => copyToClipboard(alert.sourceIp, 'sourceIp')}
                    className="p-1 hover:bg-white/10 rounded"
                  >
                    {copiedField === 'sourceIp' ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-text-muted" />}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 px-4 py-3 bg-page-bg/50 rounded-xl">
              <Target className="w-5 h-5 text-amber-400" />
              <div>
                <div className="text-xs text-text-muted">目标IP</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-text-primary">{alert.targetIp}</span>
                  <button
                    onClick={() => copyToClipboard(alert.targetIp, 'targetIp')}
                    className="p-1 hover:bg-white/10 rounded"
                  >
                    {copiedField === 'targetIp' ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-text-muted" />}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 px-4 py-3 bg-page-bg/50 rounded-xl">
              <Crosshair className="w-5 h-5 text-purple-400" />
              <div>
                <div className="text-xs text-text-muted">攻击类型</div>
                <div className="text-sm text-text-primary">{alert.attackType}</div>
              </div>
            </div>
            

          </div>
        </div>

        {/* 标签页 */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-border-color bg-page-bg/30">
          {[
            { id: 'overview', label: '概览', icon: Eye },
            { id: 'request', label: '请求详情', icon: FileText },
            { id: 'process', label: '进程分析', icon: Terminal },
            { id: 'network', label: '网络连接', icon: Network },
            { id: 'attack_chain', label: '攻击链', icon: GitBranch },
            { id: 'timeline', label: '时间线', icon: Clock3 },
            { id: 'related', label: '关联分析', icon: Link2 }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <OverviewTab alert={alert} analysisContext={analysisContext} loading={loading} />
          )}
          {activeTab === 'request' && <RequestTab alert={alert} />}
          {activeTab === 'process' && <ProcessTab alert={alert} />}
          {activeTab === 'network' && <NetworkTab alert={alert} />}
          {activeTab === 'attack_chain' && <AttackChainTab alert={alert} analysisContext={analysisContext} />}
          {activeTab === 'timeline' && <TimelineTab alert={alert} />}
          {activeTab === 'related' && <RelatedTab alert={alert} analysisContext={analysisContext} />}
        </div>
      </motion.div>
    </motion.div>
  );
}

// 概览标签页
function OverviewTab({ alert, analysisContext, loading }: { alert: SecurityAlert; analysisContext: AlertAnalysisContext | null; loading: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-6">
      {/* 左侧：主要信息 */}
      <div className="col-span-2 space-y-6">
        {/* 告警描述 */}
        <div className="p-6 bg-page-bg rounded-xl border border-border-color">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
            <AlertCircle className="w-5 h-5 text-primary" />
            告警描述
          </h3>
          <p className="text-text-secondary leading-relaxed">
            {alert.description || `检测到来自 ${alert.sourceIp} 对 ${alert.targetIp} 的 ${alert.attackType} 攻击。`}
          </p>
          
          {/* 标签 */}
          <div className="flex flex-wrap gap-2 mt-4">
            {alert.tags?.map((tag, i) => (
              <span key={i} className="px-3 py-1 bg-primary/10 text-primary text-xs rounded-full flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {tag}
              </span>
            ))}
            {alert.categories?.map((cat, i) => (
              <span key={i} className="px-3 py-1 bg-amber-500/10 text-amber-400 text-xs rounded-full">
                {cat}
              </span>
            ))}
          </div>
        </div>

        {/* 原始日志 */}
        <div className="p-6 bg-page-bg rounded-xl border border-border-color">
          <div className="flex items-center justify-between mb-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
              <FileText className="w-5 h-5 text-cyan-400" />
              原始日志
            </h3>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors">
              <Download className="w-4 h-4" />
              导出
            </button>
          </div>
          <pre className="p-4 bg-black/30 rounded-lg text-xs font-mono text-cyan-300 overflow-x-auto max-h-64">
            {alert.rawLog}
          </pre>
        </div>

        {/* MITRE ATT&CK 技术映射 */}
        {alert.attackTechnique && alert.attackTechnique.length > 0 && (
          <div className="p-6 bg-page-bg rounded-xl border border-border-color">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
              <Target className="w-5 h-5 text-red-400" />
              MITRE ATT&CK 技术映射
            </h3>
            <div className="space-y-3">
              {alert.attackTechnique.map((tech, i) => (
                <div key={i} className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg">
                  <div className={`px-3 py-1 rounded text-xs font-medium ${severityConfig[alert.severity].bg} ${severityConfig[alert.severity].text}`}>
                    {tech.tacticName}
                  </div>
                  <div className="flex-1">
                    <div className="font-mono text-sm text-primary">{tech.techniqueId}</div>
                    <div className="text-sm text-text-secondary">{tech.techniqueName}</div>
                  </div>
                  {tech.subTechniqueName && (
                    <div className="text-right">
                      <div className="font-mono text-xs text-text-muted">{tech.subTechniqueId}</div>
                      <div className="text-xs text-text-secondary">{tech.subTechniqueName}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 右侧：上下文信息 */}
      <div className="space-y-6">
        {/* 威胁情报 */}
        <div className="p-6 bg-page-bg rounded-xl border border-border-color">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
            <Shield className="w-5 h-5 text-emerald-400" />
            威胁情报
          </h3>
          
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-slate-800/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : analysisContext?.threatIntel?.ipReputation ? (
            <div className="space-y-4">
              {/* 源IP信誉 */}
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-text-muted">源IP信誉</span>
                  {React.createElement(reputationConfig[analysisContext.threatIntel.ipReputation.level].icon, {
                    className: `w-4 h-4 ${reputationConfig[analysisContext.threatIntel.ipReputation.level].color}`
                  })}
                </div>
                <div className={`text-sm font-medium ${reputationConfig[analysisContext.threatIntel.ipReputation.level].color}`}>
                  {reputationConfig[analysisContext.threatIntel.ipReputation.level].label}
                </div>
                <div className="text-xs text-text-muted mt-1">
                  置信度: {analysisContext.threatIntel.ipReputation.confidence}%
                </div>
              </div>
              
              {/* 威胁类型 */}
              {analysisContext.threatIntel.ipReputation.threatType && (
                <div className="flex flex-wrap gap-2">
                  {analysisContext.threatIntel.ipReputation.categories?.map((cat, i) => (
                    <span key={i} className="px-2 py-1 bg-rose-500/20 text-rose-400 text-xs rounded">
                      {cat}
                    </span>
                  ))}
                </div>
              )}
              
              {/* 首末次出现 */}
              <div className="text-xs text-text-muted">
                <div>首次出现: {analysisContext.threatIntel.ipReputation.firstSeen}</div>
                <div>最后出现: {analysisContext.threatIntel.ipReputation.lastSeen}</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-text-muted text-sm">
              暂无威胁情报
            </div>
          )}
        </div>

        {/* 目标资产 */}
        <div className="p-6 bg-page-bg rounded-xl border border-border-color">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
            <Server className="w-5 h-5 text-amber-400" />
            目标资产
          </h3>
          
          {loading ? (
            <div className="h-24 bg-slate-800/50 rounded-lg animate-pulse" />
          ) : analysisContext?.assetInfo ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">资产名称</span>
                <span className="text-sm text-text-primary">{analysisContext.assetInfo.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">资产类型</span>
                <span className="text-sm text-text-primary">{analysisContext.assetInfo.type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">负责人</span>
                <span className="text-sm text-text-primary">{analysisContext.assetInfo.owner}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">风险评分</span>
                <span className={`text-sm font-medium ${
                  analysisContext.assetInfo.riskScore >= 80 ? 'text-rose-400' :
                  analysisContext.assetInfo.riskScore >= 60 ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {analysisContext.assetInfo.riskScore}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">开放漏洞</span>
                <span className="text-sm text-rose-400">{analysisContext.assetInfo.openVulnerabilities}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-text-muted text-sm">
              暂无资产信息
            </div>
          )}
        </div>

        {/* 建议操作 */}
        <div className="p-6 bg-page-bg rounded-xl border border-border-color">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
            <Zap className="w-5 h-5 text-primary" />
            建议操作
          </h3>
          
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-12 bg-slate-800/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : analysisContext?.suggestedActions && analysisContext.suggestedActions.length > 0 ? (
            <div className="space-y-2">
              {analysisContext.suggestedActions.map((action, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                  <div>
                    <div className="text-sm font-medium text-text-primary">{action.action}</div>
                    <div className="text-xs text-text-muted">{action.reason}</div>
                  </div>
                  {action.automated && (
                    <span className="px-2 py-0.5 bg-primary/20 text-primary text-xs rounded">自动</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-text-muted text-sm">
              暂无建议操作
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 请求详情标签页（WAF）
function RequestTab({ alert }: { alert: SecurityAlert }) {
  if (alert.productType !== 'waf' || !alert.wafDetails) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>该告警类型不支持请求详情</p>
        </div>
      </div>
    );
  }

  const { wafDetails } = alert;
  const { request, response, attackInfo, ruleMatch, action, session } = wafDetails;

  return (
    <div className="space-y-6">
      {/* HTTP请求 */}
      <div className="p-6 bg-page-bg rounded-xl border border-border-color">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
          <FileText className="w-5 h-5 text-blue-400" />
          HTTP请求
        </h3>
        
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="p-3 bg-slate-800/50 rounded-lg">
            <div className="text-xs text-text-muted mb-1">请求方法</div>
            <div className={`text-lg font-bold ${
              request.method === 'POST' ? 'text-amber-400' :
              request.method === 'GET' ? 'text-emerald-400' :
              'text-blue-400'
            }`}>{request.method}</div>
          </div>
          <div className="p-3 bg-slate-800/50 rounded-lg col-span-3">
            <div className="text-xs text-text-muted mb-1">请求URL</div>
            <div className="font-mono text-sm text-text-primary truncate">{request.url}</div>
          </div>
        </div>

        {/* 请求头 */}
        <div className="mb-4">
          <h4 className="text-sm font-medium text-text-secondary mb-2">请求头</h4>
          <pre className="p-4 bg-black/30 rounded-lg text-xs font-mono text-cyan-300 overflow-x-auto">
            {Object.entries(request.headers || {}).map(([key, value]) => 
              `${key}: ${value}`
            ).join('\n')}
          </pre>
        </div>

        {/* Cookie */}
        {request.cookies && Object.keys(request.cookies).length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-text-secondary mb-2">Cookie</h4>
            <pre className="p-4 bg-black/30 rounded-lg text-xs font-mono text-cyan-300 overflow-x-auto">
              {Object.entries(request.cookies).map(([key, value]) => 
                `${key}=${value}`
              ).join('; ')}
            </pre>
          </div>
        )}

        {/* 请求体 */}
        {request.body && (
          <div>
            <h4 className="text-sm font-medium text-text-secondary mb-2">请求体</h4>
            <pre className="p-4 bg-black/30 rounded-lg text-xs font-mono text-cyan-300 overflow-x-auto max-h-48">
              {request.body}
            </pre>
          </div>
        )}
      </div>

      {/* 攻击信息 */}
      <div className="p-6 bg-rose-500/5 rounded-xl border border-rose-500/30">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-rose-400 mb-4">
          <Bug className="w-5 h-5" />
          攻击信息
        </h3>
        
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-xs text-text-muted mb-1">攻击类型</div>
            <div className="text-sm font-medium text-rose-400">{attackInfo.attackType}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-1">攻击向量</div>
            <div className="text-sm text-text-primary">{attackInfo.attackVector}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-1">编码类型</div>
            <div className="text-sm text-text-primary">{attackInfo.encoding || '无'}</div>
          </div>
        </div>

        <div className="mb-4">
          <div className="text-xs text-text-muted mb-1">攻击Payload</div>
          <div className="p-4 bg-black/30 rounded-lg font-mono text-sm text-rose-300 break-all">
            {attackInfo.attackPayload}
          </div>
        </div>

        {attackInfo.attackPattern && (
          <div>
            <div className="text-xs text-text-muted mb-1">攻击模式</div>
            <div className="text-sm text-text-secondary">{attackInfo.attackPattern}</div>
          </div>
        )}
      </div>

      {/* 规则匹配 */}
      <div className="p-6 bg-page-bg rounded-xl border border-border-color">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
          <Shield className="w-5 h-5 text-amber-400" />
          匹配规则
        </h3>
        
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-text-muted mb-1">规则ID</div>
            <div className="font-mono text-sm text-primary">{ruleMatch.ruleId}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-1">规则名称</div>
            <div className="text-sm text-text-primary">{ruleMatch.ruleName}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-1">规则类别</div>
            <div className="text-sm text-text-secondary">{ruleMatch.ruleCategory}</div>
          </div>
        </div>
        
        <div className="mt-4 flex items-center gap-4">
          <span className={`px-3 py-1 rounded text-sm font-medium ${severityConfig[ruleMatch.ruleSeverity].bg} ${severityConfig[ruleMatch.ruleSeverity].text}`}>
            {severityConfig[ruleMatch.ruleSeverity].label}
          </span>
          <span className={`px-3 py-1 rounded text-sm font-medium ${action.blocked ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {action.blocked ? '已拦截' : '已放行'}
          </span>
        </div>
      </div>

      {/* 响应信息 */}
      {response && (
        <div className="p-6 bg-page-bg rounded-xl border border-border-color">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
            <Activity className="w-5 h-5 text-emerald-400" />
            HTTP响应
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-text-muted mb-1">状态码</div>
              <div className={`text-2xl font-bold ${
                response.statusCode >= 500 ? 'text-rose-400' :
                response.statusCode >= 400 ? 'text-amber-400' :
                'text-emerald-400'
              }`}>{response.statusCode}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1">响应大小</div>
              <div className="text-lg text-text-primary">{response.contentLength || 0} bytes</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 进程分析标签页（HIDS/EDR）
function ProcessTab({ alert }: { alert: SecurityAlert }) {
  if (alert.productType !== 'hids' && alert.productType !== 'edr') {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        <div className="text-center">
          <Terminal className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>该告警类型不支持进程分析</p>
        </div>
      </div>
    );
  }

  const details = alert.productType === 'hids' ? alert.hidsDetails : alert.edrDetails;
  if (!details) return null;

  const process = details.process;
  const file = details.file;

  return (
    <div className="space-y-6">
      {/* 进程信息 */}
      {process && (
        <div className="p-6 bg-page-bg rounded-xl border border-border-color">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
            <Terminal className="w-5 h-5 text-emerald-400" />
            进程信息
          </h3>
          
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="text-xs text-text-muted mb-1">进程名称</div>
              <div className="font-mono text-sm text-emerald-400">{process.name}</div>
            </div>
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="text-xs text-text-muted mb-1">进程ID</div>
              <div className="font-mono text-lg text-text-primary">{process.pid}</div>
            </div>
            {process.ppid && (
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <div className="text-xs text-text-muted mb-1">父进程ID</div>
                <div className="font-mono text-lg text-text-primary">{process.ppid}</div>
              </div>
            )}
            {process.user && (
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <div className="text-xs text-text-muted mb-1">用户</div>
                <div className="text-sm text-text-primary">{process.user}</div>
              </div>
            )}
          </div>

          {/* 进程路径 */}
          {process.path && (
            <div className="mb-4">
              <div className="text-xs text-text-muted mb-1">进程路径</div>
              <div className="p-3 bg-black/30 rounded-lg font-mono text-sm text-cyan-300 break-all">
                {process.path}
              </div>
            </div>
          )}

          {/* 命令行 */}
          {process.commandLine && (
            <div className="mb-4">
              <div className="text-xs text-text-muted mb-1">命令行</div>
              <div className="p-3 bg-black/30 rounded-lg font-mono text-sm text-cyan-300 break-all">
                {process.commandLine}
              </div>
            </div>
          )}

          {/* 进程哈希 */}
          {process.hash && (
            <div className="grid grid-cols-3 gap-4">
              {process.hash.sha256 && (
                <div>
                  <div className="text-xs text-text-muted mb-1">SHA256</div>
                  <div className="font-mono text-xs text-text-secondary break-all">{process.hash.sha256}</div>
                </div>
              )}
              {process.hash.md5 && (
                <div>
                  <div className="text-xs text-text-muted mb-1">MD5</div>
                  <div className="font-mono text-xs text-text-secondary">{process.hash.md5}</div>
                </div>
              )}
              {process.hash.sha1 && (
                <div>
                  <div className="text-xs text-text-muted mb-1">SHA1</div>
                  <div className="font-mono text-xs text-text-secondary">{process.hash.sha1}</div>
                </div>
              )}
            </div>
          )}

          {/* 父子进程 */}
          {process.parentProcess && (
            <div className="mt-4 p-4 bg-slate-800/50 rounded-lg">
              <div className="text-xs text-text-muted mb-2">父进程</div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-text-primary">{process.parentProcess.name}</span>
                {process.parentProcess.path && (
                  <span className="text-xs text-text-muted font-mono truncate max-w-md">{process.parentProcess.path}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 文件信息 */}
      {file && (
        <div className="p-6 bg-page-bg rounded-xl border border-border-color">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
            <FileText className="w-5 h-5 text-amber-400" />
            文件信息
          </h3>
          
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="col-span-2">
              <div className="text-xs text-text-muted mb-1">文件路径</div>
              <div className="font-mono text-sm text-amber-400 break-all">{file.path}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1">文件类型</div>
              <div className="text-sm text-text-primary">{file.type || '未知'}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1">文件大小</div>
              <div className="text-sm text-text-primary">{file.size ? `${(file.size / 1024).toFixed(2)} KB` : '未知'}</div>
            </div>
          </div>

          {/* 权限和所有者 */}
          <div className="flex items-center gap-6 mb-4">
            {file.permissions && (
              <div>
                <div className="text-xs text-text-muted mb-1">权限</div>
                <div className="font-mono text-sm text-text-primary">{file.permissions}</div>
              </div>
            )}
            {file.owner && (
              <div>
                <div className="text-xs text-text-muted mb-1">所有者</div>
                <div className="text-sm text-text-primary">{file.owner}</div>
              </div>
            )}
            {file.isExecutable && (
              <span className="px-2 py-1 bg-rose-500/20 text-rose-400 text-xs rounded">可执行</span>
            )}
            {file.isSensitivePath && (
              <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs rounded">敏感路径</span>
            )}
          </div>

          {/* 文件哈希 */}
          {file.hash && (
            <div className="grid grid-cols-3 gap-4">
              {file.hash.sha256 && (
                <div>
                  <div className="text-xs text-text-muted mb-1">SHA256</div>
                  <div className="font-mono text-xs text-text-secondary break-all">{file.hash.sha256}</div>
                </div>
              )}
              {file.hash.md5 && (
                <div>
                  <div className="text-xs text-text-muted mb-1">MD5</div>
                  <div className="font-mono text-xs text-text-secondary">{file.hash.md5}</div>
                </div>
              )}
              {file.hash.sha1 && (
                <div>
                  <div className="text-xs text-text-muted mb-1">SHA1</div>
                  <div className="font-mono text-xs text-text-secondary">{file.hash.sha1}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 行为描述 */}
      {'behavior' in details && details.behavior && (
        <div className="p-6 bg-rose-500/5 rounded-xl border border-rose-500/30">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-rose-400 mb-4">
            <Activity className="w-5 h-5" />
            行为描述
          </h3>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-xs text-text-muted mb-1">行为类型</div>
              <div className="text-sm font-medium text-rose-400">{details.behavior.type}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1">具体动作</div>
              <div className="text-sm text-text-primary">{details.behavior.action}</div>
            </div>
          </div>
          
          <div className="mb-4">
            <div className="text-xs text-text-muted mb-1">详细描述</div>
            <p className="text-sm text-text-secondary leading-relaxed">{details.behavior.details}</p>
          </div>

          {'command' in details.behavior && details.behavior.command && (
            <div className="mb-4">
              <div className="text-xs text-text-muted mb-1">执行的命令</div>
              <pre className="p-4 bg-black/30 rounded-lg font-mono text-sm text-rose-300 overflow-x-auto">
                {details.behavior.command}
              </pre>
            </div>
          )}

          {'context' in details && details.context && (
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="text-xs text-text-muted mb-1">触发原因</div>
              <div className="text-sm text-text-primary">{details.context.triggerReason}</div>
              {details.context.matchedRule && (
                <div className="text-xs text-text-muted mt-2">匹配规则: {details.context.matchedRule}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 网络连接标签页
function NetworkTab({ alert }: { alert: SecurityAlert }) {
  let networkInfo: any = null;
  
  if (alert.productType === 'hids' && alert.hidsDetails?.networkConnection) {
    networkInfo = alert.hidsDetails.networkConnection;
  } else if (alert.productType === 'edr' && alert.edrDetails?.context?.networkActivities?.[0]) {
    networkInfo = alert.edrDetails.context.networkActivities[0];
  } else if (alert.productType === 'ids' && alert.idsDetails?.flow) {
    const flow = alert.idsDetails.flow;
    networkInfo = {
      protocol: alert.idsDetails.protocol,
      localIp: flow.initiatorIp,
      localPort: flow.initiatorPort,
      remoteIp: flow.responderIp,
      remotePort: flow.responderPort,
      direction: flow.initiatorIp.startsWith('192.168') || flow.initiatorIp.startsWith('10.') ? 'outbound' : 'inbound'
    };
  }

  if (!networkInfo) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        <div className="text-center">
          <Network className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>该告警类型不支持网络连接详情</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-6 bg-page-bg rounded-xl border border-border-color">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
          <Network className="w-5 h-5 text-blue-400" />
          网络连接
        </h3>
        
        {/* 连接可视化 */}
        <div className="flex items-center justify-center gap-8 mb-8">
          <div className="text-center">
            <div className="w-20 h-20 bg-slate-800 rounded-xl flex items-center justify-center mb-2">
              <Server className="w-8 h-8 text-amber-400" />
            </div>
            <div className="font-mono text-sm text-text-primary">{networkInfo.localIp}</div>
            {networkInfo.localPort && (
              <div className="text-xs text-text-muted">:{networkInfo.localPort}</div>
            )}
          </div>
          
          <div className="flex flex-col items-center">
            <div className={`px-3 py-1 rounded text-xs font-medium ${
              networkInfo.direction === 'inbound' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
            }`}>
              {networkInfo.direction === 'inbound' ? '入站' : '出站'}
            </div>
            <div className={`px-4 py-2 bg-blue-500/20 text-blue-400 rounded text-sm font-medium my-2`}>
              {networkInfo.protocol}
            </div>
            <Link2 className="w-6 h-6 text-text-muted" />
          </div>
          
          <div className="text-center">
            <div className="w-20 h-20 bg-slate-800 rounded-xl flex items-center justify-center mb-2">
              <Globe className="w-8 h-8 text-rose-400" />
            </div>
            <div className="font-mono text-sm text-text-primary">{networkInfo.remoteIp}</div>
            {networkInfo.remotePort && (
              <div className="text-xs text-text-muted">:{networkInfo.remotePort}</div>
            )}
          </div>
        </div>

        {/* 连接详情 */}
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-slate-800/50 rounded-lg">
            <div className="text-xs text-text-muted mb-1">协议</div>
            <div className="text-sm font-medium text-blue-400">{networkInfo.protocol}</div>
          </div>
          <div className="p-4 bg-slate-800/50 rounded-lg">
            <div className="text-xs text-text-muted mb-1">连接方向</div>
            <div className={`text-sm font-medium ${
              networkInfo.direction === 'inbound' ? 'text-rose-400' : 'text-emerald-400'
            }`}>
              {networkInfo.direction === 'inbound' ? '入站' : '出站'}
            </div>
          </div>
          {networkInfo.state && (
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="text-xs text-text-muted mb-1">连接状态</div>
              <div className="text-sm font-medium text-text-primary">{networkInfo.state}</div>
            </div>
          )}
          {networkInfo.processName && (
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="text-xs text-text-muted mb-1">关联进程</div>
              <div className="text-sm font-medium text-emerald-400">{networkInfo.processName}</div>
              {networkInfo.processPid && (
                <div className="text-xs text-text-muted">PID: {networkInfo.processPid}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 攻击链标签页
function AttackChainTab({ alert, analysisContext }: { alert: SecurityAlert; analysisContext: AlertAnalysisContext | null }) {
  return (
    <div className="space-y-6">
      <div className="p-6 bg-page-bg rounded-xl border border-border-color">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-6">
          <GitBranch className="w-5 h-5 text-primary" />
          攻击链分析
        </h3>
        
        {/* 攻击链阶段 */}
        <div className="relative">
          {/* 时间线 */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-rose-500 via-amber-500 to-emerald-500" />
          
          {/* 当前阶段高亮 */}
          {alert.killChainPhase && (
            <div className="relative flex items-center gap-6 mb-8">
              <div className={`w-12 h-12 rounded-xl ${killChainConfig[alert.killChainPhase].bg} flex items-center justify-center ${killChainConfig[alert.killChainPhase].color}`}>
                <span className="text-lg font-bold">{killChainConfig[alert.killChainPhase].order}</span>
              </div>
              <div className="flex-1 p-4 bg-slate-800/50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-medium ${killChainConfig[alert.killChainPhase].color}`}>
                    {killChainConfig[alert.killChainPhase].name}
                  </span>
                  <span className="text-xs text-text-muted">{alert.timestamp}</span>
                </div>
                <p className="text-sm text-text-secondary">
                  {getKillChainDescription(alert.killChainPhase)}
                </p>
              </div>
            </div>
          )}

          {/* 全部阶段概览 */}
          <div className="grid grid-cols-4 gap-4 mt-8">
            {Object.entries(killChainConfig).map(([phase, config]) => {
              const isActive = alert.killChainPhase === phase;
              const isPast = alert.killChainPhase ? 
                killChainConfig[alert.killChainPhase].order > config.order : false;
              
              return (
                <div
                  key={phase}
                  className={`p-4 rounded-xl text-center transition-all ${
                    isActive ? `${config.bg} ${config.color} ring-2 ring-current` :
                    isPast ? 'bg-slate-800/30 text-text-muted' :
                    'bg-slate-800/10 text-text-muted opacity-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full ${isActive ? 'bg-current/20' : 'bg-slate-700'} flex items-center justify-center mx-auto mb-2`}>
                    <span className="text-xs font-bold">{config.order}</span>
                  </div>
                  <div className="text-sm font-medium">{config.name}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 攻击链详情 */}
      {analysisContext?.attackChain && (
        <div className="p-6 bg-page-bg rounded-xl border border-border-color">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-text-primary">攻击链置信度</h3>
            <span className="text-2xl font-bold text-primary">{analysisContext.attackChain.confidence}%</span>
          </div>
          <p className="text-sm text-text-secondary">{analysisContext.attackChain.summary}</p>
        </div>
      )}
    </div>
  );
}

// 时间线标签页
function TimelineTab({ alert }: { alert: SecurityAlert }) {
  const timelineItems = [
    {
      time: alert.timestamp,
      title: '告警生成',
      description: `告警由 ${alert.productName} 生成`,
      icon: Bell,
      color: 'text-rose-400',
      bg: 'bg-rose-500/20'
    },
    alert.firstSeen && alert.firstSeen !== alert.timestamp ? {
      time: alert.firstSeen,
      title: '首次出现',
      description: '该攻击行为的首次记录',
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-500/20'
    } : null,
    alert.assignTime ? {
      time: alert.assignTime,
      title: '分配处理人',
      description: `分配给 ${alert.assignee}`,
      icon: User,
      color: 'text-purple-400',
      bg: 'bg-purple-500/20'
    } : null,
    alert.resolveTime ? {
      time: alert.resolveTime,
      title: '告警解决',
      description: alert.resolveReason || '告警已处理',
      icon: CheckCircle,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/20'
    } : null
  ].filter(Boolean) as any[];

  return (
    <div className="space-y-6">
      <div className="p-6 bg-page-bg rounded-xl border border-border-color">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-6">
          <Clock3 className="w-5 h-5 text-primary" />
          时间线
        </h3>
        
        <div className="relative">
          {/* 时间线 */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border-color" />
          
          <div className="space-y-6">
            {timelineItems.map((item, index) => (
              <div key={index} className="relative flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center ${item.color} z-10`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-text-primary">{item.title}</span>
                    <span className="text-xs text-text-muted">{item.time}</span>
                  </div>
                  <p className="text-sm text-text-secondary">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 时间统计 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-page-bg rounded-xl border border-border-color">
          <div className="text-xs text-text-muted mb-1">告警持续时间</div>
          <div className="text-lg font-medium text-text-primary">
            {alert.resolveTime ? 
              `${Math.round((new Date(alert.resolveTime).getTime() - new Date(alert.timestamp).getTime()) / 60000)}分钟` :
              '处理中'
            }
          </div>
        </div>
        <div className="p-4 bg-page-bg rounded-xl border border-border-color">
          <div className="text-xs text-text-muted mb-1">相同告警次数</div>
          <div className="text-lg font-medium text-text-primary">{alert.count || 1}次</div>
        </div>
        <div className="p-4 bg-page-bg rounded-xl border border-border-color">
          <div className="text-xs text-text-muted mb-1">时间窗口</div>
          <div className="text-lg font-medium text-text-primary">
            {alert.firstSeen && alert.lastSeen ? 
              `${Math.round((new Date(alert.lastSeen).getTime() - new Date(alert.firstSeen).getTime()) / 60000)}分钟` :
              '-'
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// 关联分析标签页
function RelatedTab({ alert, analysisContext }: { alert: SecurityAlert; analysisContext: AlertAnalysisContext | null }) {
  const [activeSection, setActiveSection] = useState<'alerts' | 'events' | 'assets'>('alerts');

  return (
    <div className="space-y-6">
      {/* 关联统计 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-page-bg rounded-xl border border-border-color">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">
                {analysisContext?.relatedAlerts?.length || 0}
              </div>
              <div className="text-xs text-text-muted">关联告警</div>
            </div>
          </div>
        </div>
        <div className="p-4 bg-page-bg rounded-xl border border-border-color">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">
                {analysisContext?.relatedEvents?.length || 0}
              </div>
              <div className="text-xs text-text-muted">关联事件</div>
            </div>
          </div>
        </div>
        <div className="p-4 bg-page-bg rounded-xl border border-border-color">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Server className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary">
                {analysisContext?.assetInfo ? 1 : 0}
              </div>
              <div className="text-xs text-text-muted">关联资产</div>
            </div>
          </div>
        </div>
      </div>

      {/* 关联详情 */}
      <div className="p-6 bg-page-bg rounded-xl border border-border-color">
        <div className="flex items-center gap-4 mb-6">
          {[
            { id: 'alerts', label: '关联告警' },
            { id: 'events', label: '关联事件' },
            { id: 'assets', label: '关联资产' }
          ].map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id as any)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                activeSection === section.id
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:bg-white/5'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        {activeSection === 'alerts' && (
          <div className="text-center py-12 text-text-muted">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{analysisContext?.relatedAlerts?.length || 0} 条关联告警</p>
          </div>
        )}

        {activeSection === 'events' && (
          <div className="text-center py-12 text-text-muted">
            <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{analysisContext?.relatedEvents?.length || 0} 个关联事件</p>
          </div>
        )}

        {activeSection === 'assets' && analysisContext?.assetInfo && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-text-muted mb-1">资产名称</div>
                  <div className="text-sm text-text-primary">{analysisContext.assetInfo.name}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted mb-1">IP地址</div>
                  <div className="font-mono text-sm text-text-primary">{analysisContext.assetInfo.ip}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted mb-1">资产类型</div>
                  <div className="text-sm text-text-primary">{analysisContext.assetInfo.type}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted mb-1">负责人</div>
                  <div className="text-sm text-text-primary">{analysisContext.assetInfo.owner}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 辅助函数：获取攻击链阶段描述
function getKillChainDescription(phase: KillChainPhase): string {
  const descriptions: Record<KillChainPhase, string> = {
    reconnaissance: '攻击者进行信息收集和侦察，确定攻击目标和手段',
    weaponization: '攻击者准备攻击工具和有效载荷',
    delivery: '攻击载荷通过各种方式投递到目标系统',
    exploitation: '攻击者利用漏洞或弱点获取系统访问权限',
    installation: '攻击者在目标系统安装后门或持久化工具',
    command_control: '攻击者建立远程控制通道，与受控系统通信',
    actions: '攻击者执行预期目标行动，如数据窃取、破坏等',
    impact: '攻击行为造成实际影响和损害'
  };
  return descriptions[phase] || '';
}
