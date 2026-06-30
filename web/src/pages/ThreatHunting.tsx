/**
 * ThreatHunting — 威胁狩猎页面
 *
 * 连接 alerts 表进行真实威胁检测查询
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, Search, Play, Download, Filter, Clock, CheckCircle, AlertCircle,
  Zap, ChevronRight, ChevronDown, X, BarChart3, Activity, Shield,
  Globe, Server, Tag, Info, Loader2, Copy, Check, RefreshCw
} from 'lucide-react';
import { huntingApi } from '../services/api';

interface HuntingTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: string;
  query: string;
  mitre: string;
  tags: string[];
}

interface HuntingResult {
  id: string;
  alert_code: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  source: string;
  source_product: string;
  src_ip: string;
  dst_ip: string;
  category: string;
  first_seen: string;
  created_at: string;
}

interface HuntingStats {
  total_alerts: number;
  critical_alerts: number;
  high_alerts: number;
  recent_24h: number;
  product_distribution: Record<string, number>;
  category_distribution: Record<string, number>;
}

interface Indicators {
  src_ips: { value: string; count: number }[];
  dst_ips: { value: string; count: number }[];
  hosts: { value: string; count: number }[];
}

const severityConfig: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: 'text-rose-400', bg: 'bg-rose-500/15', label: '危急' },
  high: { color: 'text-orange-400', bg: 'bg-orange-500/15', label: '高危' },
  medium: { color: 'text-amber-400', bg: 'bg-amber-500/15', label: '中危' },
  low: { color: 'text-blue-400', bg: 'bg-blue-500/15', label: '低危' },
};

const categoryIcons: Record<string, { icon: React.ElementType; color: string }> = {
  '网络入侵': { icon: Globe, color: 'text-cyan-400' },
  '暴力破解': { icon: Shield, color: 'text-rose-400' },
  '恶意软件': { icon: Zap, color: 'text-orange-400' },
  'Web攻击': { icon: Globe, color: 'text-purple-400' },
  '数据泄露': { icon: Server, color: 'text-amber-400' },
  '权限异常': { icon: Shield, color: 'text-rose-400' },
  '拒绝服务': { icon: AlertCircle, color: 'text-red-400' },
};

export default function ThreatHunting() {
  const [activeTab, setActiveTab] = useState<'templates' | 'results' | 'indicators'>('templates');
  const [templates, setTemplates] = useState<HuntingTemplate[]>([]);
  const [results, setResults] = useState<HuntingResult[]>([]);
  const [stats, setStats] = useState<HuntingStats | null>(null);
  const [indicators, setIndicators] = useState<Indicators | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [totalResults, setTotalResults] = useState(0);
  const [page, setPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  // 加载模板
  const fetchTemplates = useCallback(async () => {
    try {
      const resp = await huntingApi.getTemplates();
      if (resp?.success) setTemplates(resp.data || []);
    } catch (e) { console.error(e); }
  }, []);

  // 加载统计
  const fetchStats = useCallback(async () => {
    try {
      const resp = await huntingApi.getStats();
      if (resp?.success) setStats(resp.data);
    } catch (e) { console.error(e); }
  }, []);

  // 加载指标
  const fetchIndicators = useCallback(async () => {
    try {
      const resp = await huntingApi.getIndicators();
      if (resp?.success) setIndicators(resp.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchStats();
    fetchIndicators();
  }, [fetchTemplates, fetchStats, fetchIndicators]);

  // 执行狩猎搜索
  const executeSearch = useCallback(async (query: string, p = 1) => {
    setLoading(true);
    setActiveQuery(query);
    try {
      const resp = await huntingApi.search({
        query,
        page: p,
        page_size: 50,
        severity: severityFilter || undefined,
      });
      if (resp?.success) {
        setResults(resp.data.items || []);
        setTotalResults(resp.data.total || 0);
        setPage(p);
        setActiveTab('results');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [severityFilter]);

  // 快速搜索
  const handleQuickSearch = () => {
    if (searchQuery.trim()) {
      executeSearch(searchQuery.trim());
    }
  };

  // 复制查询
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 过滤模板
  const filteredTemplates = templates.filter(t => {
    if (!searchTerm) return true;
    return t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
           t.category.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <Target className="text-primary" size={28} />
            威胁狩猎
          </h1>
          <p className="text-text-secondary mt-1">基于安全告警数据主动搜索和识别潜在威胁</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { fetchStats(); fetchIndicators(); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-secondary hover:text-text-primary transition-all text-sm">
            <RefreshCw className="w-4 h-4" /> 刷新
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: '告警总数', value: stats.total_alerts, icon: Activity, color: 'text-primary', bg: 'bg-primary/10' },
            { label: '危急告警', value: stats.critical_alerts, icon: AlertCircle, color: 'text-rose-400', bg: 'bg-rose-500/10' },
            { label: '高危告警', value: stats.high_alerts, icon: Zap, color: 'text-orange-400', bg: 'bg-orange-500/10' },
            { label: '24h 新增', value: stats.recent_24h, icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          ].map(s => (
            <div key={s.label} className="bg-card-bg border border-border-color rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-muted">{s.label}</p>
                  <p className="text-2xl font-bold text-text-primary mt-1">{s.value.toLocaleString()}</p>
                </div>
                <div className={`w-10 h-10 ${s.bg} rounded-lg flex items-center justify-center`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 搜索栏 */}
      <div className="bg-card-bg border border-border-color rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 bg-page-bg border border-border-color rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
            <input
              type="text" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQuickSearch()}
              placeholder="输入查询条件（如：severity:critical, category:暴力破解, src_ip:10.0.1.*）"
              className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-text-muted hover:text-text-secondary">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
            className="px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary">
            <option value="">全部严重程度</option>
            <option value="critical">危急</option>
            <option value="high">高危</option>
            <option value="medium">中危</option>
            <option value="low">低危</option>
          </select>
          <button onClick={handleQuickSearch} disabled={!searchQuery.trim() || loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-all text-sm font-medium">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            执行搜索
          </button>
        </div>
        {activeQuery && (
          <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
            <span>当前查询:</span>
            <code className="px-2 py-0.5 bg-page-bg rounded font-mono text-text-secondary">{activeQuery}</code>
            <span>· 命中 {totalResults} 条结果</span>
          </div>
        )}
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 bg-page-bg p-0.5 rounded-lg border border-border-color w-fit">
        {[
          { id: 'templates' as const, label: '狩猎模板', icon: Shield, count: templates.length },
          { id: 'results' as const, label: '搜索结果', icon: Search, count: totalResults },
          { id: 'indicators' as const, label: '威胁指标', icon: Target, count: 0 },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === tab.id ? 'bg-card-bg text-text-primary shadow-sm border border-border-color' : 'text-text-muted hover:text-text-secondary'
            }`}>
            <tab.icon className="w-3.5 h-3.5" />{tab.label}
            {tab.count > 0 && <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px]">{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      {/* ===== 狩猎模板 ===== */}
      {activeTab === 'templates' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 mb-2">
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="搜索模板..." className="px-3 py-1.5 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary w-64" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map(t => {
              const cfg = categoryIcons[t.category] || { icon: Shield, color: 'text-gray-400' };
              const Icon = cfg.icon;
              const sev = severityConfig[t.severity] || severityConfig.medium;
              return (
                <div key={t.id} className="bg-card-bg border border-border-color rounded-xl p-4 hover:border-primary/30 transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg bg-page-bg flex items-center justify-center ${cfg.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-text-primary">{t.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sev.bg} ${sev.color}`}>{sev.label}</span>
                          <span className="text-[10px] text-text-muted">{t.category}</span>
                        </div>
                      </div>
                    </div>
                    {t.mitre && (
                      <span className="px-1.5 py-0.5 bg-page-bg rounded text-[10px] font-mono text-text-muted">{t.mitre}</span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted mb-3 line-clamp-2">{t.description}</p>
                  <div className="flex items-center gap-2 mb-3">
                    <code className="flex-1 px-2 py-1 bg-page-bg rounded text-[10px] font-mono text-text-secondary truncate">{t.query}</code>
                    <button onClick={() => handleCopy(t.query, t.id)} className="p-1 text-text-muted hover:text-primary">
                      {copiedId === t.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <button onClick={() => executeSearch(t.query)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all text-xs font-medium">
                    <Play className="w-3.5 h-3.5" /> 执行狩猎
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== 搜索结果 ===== */}
      {activeTab === 'results' && (
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <Search className="w-12 h-12 mb-4 opacity-30" />
              <p className="text-lg font-medium">暂无搜索结果</p>
              <p className="text-sm mt-1">在「狩猎模板」中选择一个查询执行，或在搜索栏输入自定义查询</p>
            </div>
          ) : (
            <>
              <div className="text-xs text-text-muted mb-2">
                共 {totalResults} 条结果 · 查询: <code className="font-mono">{activeQuery}</code>
              </div>
              {results.map(r => {
                const sev = severityConfig[r.severity] || severityConfig.medium;
                const isExpanded = expandedResult === r.id;
                return (
                  <div key={r.id}
                    className={`bg-card-bg border rounded-lg overflow-hidden transition-all cursor-pointer ${
                      isExpanded ? 'border-primary/30' : 'border-border-color hover:border-primary/20'
                    }`}
                    onClick={() => setExpandedResult(isExpanded ? null : r.id)}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${sev.bg} ${sev.color}`}>{sev.label}</span>
                      <span className="text-sm font-medium text-text-primary truncate flex-1">{r.title}</span>
                      {r.source_product && <span className="text-xs text-text-muted bg-page-bg px-2 py-0.5 rounded">{r.source_product}</span>}
                      {r.src_ip && <span className="text-xs font-mono text-cyan-400">{r.src_ip}</span>}
                      <span className="text-xs text-text-muted">{r.first_seen ? new Date(r.first_seen).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                      <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="border-t border-border-color overflow-hidden">
                          <div className="px-4 py-3 grid grid-cols-2 gap-3 text-xs">
                            <div><span className="text-text-muted">告警编号:</span> <span className="text-text-primary font-mono">{r.alert_code}</span></div>
                            <div><span className="text-text-muted">状态:</span> <span className="text-text-primary">{r.status}</span></div>
                            <div><span className="text-text-muted">源IP:</span> <span className="text-cyan-400 font-mono">{r.src_ip || '-'}</span></div>
                            <div><span className="text-text-muted">目标IP:</span> <span className="text-green-400 font-mono">{r.dst_ip || '-'}</span></div>
                            <div><span className="text-text-muted">分类:</span> <span className="text-text-primary">{r.category || '-'}</span></div>
                            <div><span className="text-text-muted">数据源:</span> <span className="text-text-primary">{r.source_product || r.source || '-'}</span></div>
                            {r.description && (
                              <div className="col-span-2"><span className="text-text-muted">描述:</span> <span className="text-text-secondary">{r.description}</span></div>
                            )}
                            <div className="col-span-2"><span className="text-text-muted">接入时间:</span> <span className="text-text-muted">{r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : '-'}</span></div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
              {totalResults > 50 && (
                <div className="flex items-center justify-center gap-3 py-4">
                  <button onClick={() => executeSearch(activeQuery, page - 1)} disabled={page <= 1}
                    className="px-3 py-1.5 bg-page-bg border border-border-color rounded-lg text-xs disabled:opacity-50">上一页</button>
                  <span className="text-xs text-text-muted">第 {page} 页</span>
                  <button onClick={() => executeSearch(activeQuery, page + 1)} disabled={page * 50 >= totalResults}
                    className="px-3 py-1.5 bg-page-bg border border-border-color rounded-lg text-xs disabled:opacity-50">下一页</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ===== 威胁指标 ===== */}
      {activeTab === 'indicators' && (
        <div className="grid grid-cols-3 gap-4">
          {/* 高危源IP */}
          <div className="bg-card-bg border border-border-color rounded-xl p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" /> 高危源 IP
            </h3>
            <div className="space-y-1.5">
              {(indicators?.src_ips || []).map((ip, i) => (
                <div key={i} onClick={() => executeSearch(`src_ip:${ip.value}`)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-page-bg cursor-pointer transition-colors">
                  <span className="text-xs font-mono text-cyan-400">{ip.value}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">{ip.count} 条</span>
                    <Search className="w-3 h-3 text-text-muted" />
                  </div>
                </div>
              ))}
              {(!indicators?.src_ips || indicators.src_ips.length === 0) && <p className="text-xs text-text-muted text-center py-4">暂无数据</p>}
            </div>
          </div>

          {/* 高危目标IP */}
          <div className="bg-card-bg border border-border-color rounded-xl p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Server className="w-4 h-4 text-green-400" /> 高危目标 IP
            </h3>
            <div className="space-y-1.5">
              {(indicators?.dst_ips || []).map((ip, i) => (
                <div key={i} onClick={() => executeSearch(`dst_ip:${ip.value}`)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-page-bg cursor-pointer transition-colors">
                  <span className="text-xs font-mono text-green-400">{ip.value}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">{ip.count} 条</span>
                    <Search className="w-3 h-3 text-text-muted" />
                  </div>
                </div>
              ))}
              {(!indicators?.dst_ips || indicators.dst_ips.length === 0) && <p className="text-xs text-text-muted text-center py-4">暂无数据</p>}
            </div>
          </div>

          {/* 高危主机 */}
          <div className="bg-card-bg border border-border-color rounded-xl p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4 text-orange-400" /> 高危主机
            </h3>
            <div className="space-y-1.5">
              {(indicators?.hosts || []).map((h, i) => (
                <div key={i} onClick={() => executeSearch(`hostname:${h.value}`)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-page-bg cursor-pointer transition-colors">
                  <span className="text-xs font-mono text-orange-400 truncate">{h.value}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">{h.count} 条</span>
                    <Search className="w-3 h-3 text-text-muted" />
                  </div>
                </div>
              ))}
              {(!indicators?.hosts || indicators.hosts.length === 0) && <p className="text-xs text-text-muted text-center py-4">暂无数据</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
