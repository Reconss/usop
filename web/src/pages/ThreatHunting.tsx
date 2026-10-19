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
import { Button, ContentContainer, PageHeader, SectionCard, StatCard } from '../components/ui';

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
  critical: { color: 'text-danger', bg: 'bg-danger/15', label: '危急' },
  high: { color: 'text-warning', bg: 'bg-warning/15', label: '高危' },
  medium: { color: 'text-warning', bg: 'bg-warning/15', label: '中危' },
  low: { color: 'text-info', bg: 'bg-info/15', label: '低危' },
};

const categoryIcons: Record<string, { icon: React.ElementType; color: string }> = {
  '网络入侵': { icon: Globe, color: 'text-info' },
  '暴力破解': { icon: Shield, color: 'text-danger' },
  '恶意软件': { icon: Zap, color: 'text-warning' },
  'Web攻击': { icon: Globe, color: 'text-accent' },
  '数据泄露': { icon: Server, color: 'text-warning' },
  '权限异常': { icon: Shield, color: 'text-danger' },
  '拒绝服务': { icon: AlertCircle, color: 'text-danger' },
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
    <ContentContainer>
      <PageHeader
        icon={Target}
        title="威胁狩猎"        actions={
          <Button variant="secondary" icon={RefreshCw} onClick={() => { fetchStats(); fetchIndicators(); }}>
            刷新
          </Button>
        }
      />

      {/* 统计卡片 */}
      {stats && (
        <div className="app-grid">
          <StatCard label="告警总数" value={Number(stats.total_alerts ?? 0).toLocaleString()} icon={Activity} tone="primary" />
          <StatCard label="危急告警" value={Number(stats.critical_alerts ?? 0).toLocaleString()} icon={AlertCircle} tone="danger" />
          <StatCard label="高危告警" value={Number(stats.high_alerts ?? 0).toLocaleString()} icon={Zap} tone="warning" />
          <StatCard label="24h 新增" value={Number(stats.recent_24h ?? 0).toLocaleString()} icon={Clock} tone="info" />
        </div>
      )}

      {/* 搜索栏 */}
      <SectionCard
        icon={Search}
        title="查询控制台"
        description="支持 field:value 组合条件，多个条件以逗号分隔"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative min-w-[240px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQuickSearch()}
              placeholder="如：severity:critical, category:暴力破解, src_ip:10.0.1.*"
              className="app-input pl-8"
            />
          </div>
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            className="app-select w-[150px]"
          >
            <option value="">全部严重程度</option>
            <option value="critical">危急</option>
            <option value="high">高危</option>
            <option value="medium">中危</option>
            <option value="low">低危</option>
          </select>
          <Button
            variant="primary"
            icon={Play}
            loading={loading}
            disabled={!searchQuery.trim()}
            onClick={handleQuickSearch}
          >
            执行搜索
          </Button>
        </div>
        {activeQuery && (
          <div className="mt-3 flex items-center gap-2 flex-wrap text-[11.5px] text-text-muted">
            <span>当前查询</span>
            <code className="rounded border border-border-color bg-surface-2 px-2 py-0.5 font-mono text-text-secondary">{activeQuery}</code>
            <span className="num">命中 {totalResults} 条结果</span>
          </div>
        )}
      </SectionCard>

      {/* Tab 切换 */}
      <div className="tabs-line w-fit">
        {[
          { id: 'templates' as const, label: '狩猎模板', icon: Shield, count: templates.length },
          { id: 'results' as const, label: '搜索结果', icon: Search, count: totalResults },
          { id: 'indicators' as const, label: '威胁指标', icon: Target, count: 0 },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`tab-line-item ${activeTab === tab.id ? 'is-active' : ''}`}>
            <tab.icon size={13} />{tab.label}
            {tab.count > 0 && <span className="rounded-pill bg-primary/15 px-1.5 text-[10px] text-primary num">{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      {/* ===== 狩猎模板 ===== */}
      {activeTab === 'templates' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 mb-2">
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="搜索模板…" className="app-input w-64" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map(t => {
              const cfg = categoryIcons[t.category] || { icon: Shield, color: 'text-text-muted' };
              const Icon = cfg.icon;
              const sev = severityConfig[t.severity] || severityConfig.medium;
              return (
                <div key={t.id} className="bg-card-bg border border-border-color rounded-card p-4 hover:border-primary/30 transition-all group">
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
                      {copiedId === t.id ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
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
                      {r.src_ip && <span className="text-xs font-mono text-info">{r.src_ip}</span>}
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
                            <div><span className="text-text-muted">源IP:</span> <span className="text-info font-mono">{r.src_ip || '-'}</span></div>
                            <div><span className="text-text-muted">目标IP:</span> <span className="text-success font-mono">{r.dst_ip || '-'}</span></div>
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
          <div className="bg-card-bg border border-border-color rounded-card p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-info" /> 高危源 IP
            </h3>
            <div className="space-y-1.5">
              {(indicators?.src_ips || []).map((ip, i) => (
                <div key={i} onClick={() => executeSearch(`src_ip:${ip.value}`)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-page-bg cursor-pointer transition-colors">
                  <span className="text-xs font-mono text-info">{ip.value}</span>
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
          <div className="bg-card-bg border border-border-color rounded-card p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Server className="w-4 h-4 text-success" /> 高危目标 IP
            </h3>
            <div className="space-y-1.5">
              {(indicators?.dst_ips || []).map((ip, i) => (
                <div key={i} onClick={() => executeSearch(`dst_ip:${ip.value}`)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-page-bg cursor-pointer transition-colors">
                  <span className="text-xs font-mono text-success">{ip.value}</span>
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
          <div className="bg-card-bg border border-border-color rounded-card p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4 text-warning" /> 高危主机
            </h3>
            <div className="space-y-1.5">
              {(indicators?.hosts || []).map((h, i) => (
                <div key={i} onClick={() => executeSearch(`hostname:${h.value}`)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-page-bg cursor-pointer transition-colors">
                  <span className="text-xs font-mono text-warning truncate">{h.value}</span>
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
    </ContentContainer>
  );
}
