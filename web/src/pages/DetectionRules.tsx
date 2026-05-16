import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Edit2, Trash2, Play, X, Code, FileText, Clock, AlertTriangle, Database, Server, CheckCircle, ChevronRight, Globe, MessageSquare, Terminal, Cloud, Lock, FolderOpen, Wifi, Workflow, Loader2, CheckCircle2 } from 'lucide-react';
import { rulesApi, dataSourcesApi, playbooksApi } from '../services/api';
import RuleFormModal from '../components/detection-rules/RuleFormModal';
import { DetectionRule, RuleType } from '../types/detection-rules';

interface DataSource {
  id: number | string;
  name: string;
  type: string;
  status: string;
  protocol?: string;
}

interface Playbook {
  id: string | number;
  name: string;
  description?: string;
  status: string;
  triggerType?: string;
}

const getTypeLabel = (type: string) => {
  const labels: Record<string, string> = { single: '单事件', correlation: '关联', sequence: '时序' };
  return labels[type] || type;
};

const getTypeColor = (type: string) => {
  const colors: Record<string, string> = { single: 'bg-blue-500/20 text-blue-400', correlation: 'bg-purple-500/20 text-purple-400', sequence: 'bg-orange-500/20 text-orange-400' };
  return colors[type] || 'bg-gray-500/20 text-gray-400';
};

const OPERATOR_LABELS: Record<string, string> = {
  equals: '等于', not_equals: '不等于', contains: '包含',
  not_contains: '不包含', starts_with: '开头是', ends_with: '结尾是',
  greater_than: '大于', less_than: '小于', in_list: '属于',
  not_in_list: '不属于', is_empty: '为空', is_not_empty: '不为空',
  regex_match: '正则匹配'
};

const FIELD_LABELS: Record<string, string> = {
  src_ip: '源IP', dst_ip: '目标IP', src_port: '源端口', dst_port: '目标端口',
  protocol: '协议', hostname: '主机名', username: '用户名', action: '动作',
  result: '结果', log_type: '日志类型', source_id: '数据源ID'
};

function conditionsToText(conditions: any[]): string {
  if (!conditions || conditions.length === 0) return '无条件';
  return conditions.map((c: any) => {
    const opLabel = OPERATOR_LABELS[c.operator] || c.operator;
    const fieldLabel = FIELD_LABELS[c.field] || c.field;
    return `${fieldLabel} ${opLabel} "${c.value}"`;
  }).join(' AND ');
}

export default function DetectionRules() {
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<DetectionRule | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ruleId: string | number; data: any } | null>(null);

  const fetchData = async () => {
    try {
      const [rulesRes, dsRes, pbRes] = await Promise.allSettled([
        rulesApi.getRules({ page_size: 100 }),
        dataSourcesApi.getDataSources({ page_size: 100 }),
        playbooksApi.getPlaybooks({ page_size: 100 })
      ]);

      if (rulesRes.status === 'fulfilled' && rulesRes.value.success) {
        const items = Array.isArray(rulesRes.value.data) ? rulesRes.value.data : rulesRes.value.data?.items || [];
        setRules(items.map((item: any) => ({
          id: item.id,
          name: item.name || item.rule_name,
          type: item.type || 'single',
          status: item.status === 'active' ? 'enabled' : item.status,
          severity: item.severity || 'medium',
          hitCount: item.hit_count || 0,
          lastHitTime: item.last_hit_time || item.updated_at,
          description: item.description || item.detail,
          ruleContent: item.rule_content || '',
          ruleLanguage: item.rule_language || 'sigma',
          dataSourceIds: item.data_source_ids || [],
          playbookId: item.playbook_id || item.playbookId
        })));
      }

      if (dsRes.status === 'fulfilled' && dsRes.value.success) {
        const items = Array.isArray(dsRes.value.data) ? dsRes.value.data : dsRes.value.data?.items || [];
        setDataSources(items.map((item: any) => ({
          id: item.id,
          name: item.name || item.source_name,
          type: item.type || item.source_type,
          status: item.status || 'active'
        })));
      }

      if (pbRes.status === 'fulfilled' && pbRes.value.success) {
        const items = Array.isArray(pbRes.value.data) ? pbRes.value.data : pbRes.value.data?.items || [];
        setPlaybooks(items.filter((p: any) => p.status === 'published' || p.status === 'enabled').map((item: any) => ({
          id: item.id,
          name: item.name || item.playbook_name,
          description: item.description,
          status: item.status,
          triggerType: item.trigger_type || item.triggerType
        })));
      }
    } catch (error) {
      console.error('获取数据失败:', error);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const filteredRules = rules.filter(rule => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    const typeKeywords: Record<string, string> = {
      '单事件': 'single', '单': 'single',
      '关联': 'correlation', '关联规则': 'correlation',
      '时序': 'sequence', '时序规则': 'sequence'
    };
    let searchText = term;
    let matchedType = '';
    for (const [keyword, type] of Object.entries(typeKeywords)) {
      if (term.includes(keyword)) { searchText = term.replace(keyword, '').trim(); matchedType = type; break; }
    }
    return (!searchText || rule.name.toLowerCase().includes(searchText) || String(rule.id).toLowerCase().includes(searchText)) &&
      (!matchedType || rule.type === matchedType);
  });

  const handleAdd = () => {
    setEditingRule(null);
    setTestResult(null);
    setShowForm(true);
  };

  const handleEdit = (rule: DetectionRule) => {
    setEditingRule(rule);
    setTestResult(null);
    setShowForm(true);
  };

  const handleSave = async (ruleData: Record<string, any>) => {
    try {
      if (editingRule) {
        await rulesApi.updateRule(editingRule.id, ruleData);
        setRules(prev => prev.map(rule =>
          rule.id === editingRule.id
            ? { ...rule, ...ruleData, ruleContent: ruleData.rule_content, dataSourceIds: ruleData.data_source_ids, severity: ruleData.severity, playbookId: ruleData.playbook_id } as DetectionRule
            : rule
        ));
        showToast('规则已更新');
      } else {
        const res = await rulesApi.createRule(ruleData) as any;
        if (res.success && res.data) {
          const newRule: DetectionRule = {
            id: res.data.id || res.data.rule_id || `RULE-${new Date().getFullYear()}-${String(rules.length + 1).padStart(3, '0')}`,
            name: ruleData.name,
            type: ruleData.type as RuleType,
            status: 'disabled',
            severity: ruleData.severity,
            hitCount: 0,
            description: ruleData.description,
            ruleContent: ruleData.rule_content,
            ruleLanguage: 'sigma',
            dataSourceIds: ruleData.data_source_ids,
            playbookId: ruleData.playbook_id || undefined
          };
          setRules(prev => [...prev, newRule]);
          showToast('规则已创建');
        }
      }
      setShowForm(false);
    } catch (error: any) {
      console.error('保存规则失败:', error);
      showToast(error?.message || '保存失败', 'error');
    }
  };

  const handleDelete = async (id: string | number) => {
    if (!confirm('确定要删除此规则吗？')) return;
    try {
      await rulesApi.deleteRule(id);
      setRules(prev => prev.filter(rule => rule.id !== id));
      showToast('规则已删除');
    } catch (error) {
      showToast('删除失败', 'error');
    }
  };

  const handleTest = async (rule: DetectionRule) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await rulesApi.testRule(rule.id) as any;
      if (res.success && res.data) {
        setTestResult({ ruleId: rule.id, data: res.data });
        showToast(`测试完成，匹配 ${res.data.matched_count || 0} 条日志`);
      } else {
        setTestResult({ ruleId: rule.id, data: { matched: false, matched_count: 0, matched_logs: [] } });
        showToast(res.error || '测试失败', 'error');
      }
    } catch (error: any) {
      setTestResult({ ruleId: rule.id, data: { matched: false, matched_count: 0, matched_logs: [] } });
      showToast(error?.message || '测试失败', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const toggleStatus = async (id: string | number) => {
    const original = rules.find(r => r.id === id);
    const newStatus = original?.status === 'enabled' ? 'disabled' : 'enabled';
    // 乐观更新
    setRules(prev => prev.map(rule => rule.id === id ? { ...rule, status: newStatus } : rule));
    try {
      await rulesApi.toggleRule(id);
    } catch (error) {
      // 回滚
      setRules(prev => prev.map(rule => rule.id === id ? { ...rule, status: original?.status || 'disabled' } : rule));
      showToast('状态切换失败', 'error');
    }
  };

  const getSeverityBadge = (severity?: string) => {
    const config: Record<string, { color: string; label: string; bg: string }> = {
      critical: { color: '#F2545B', label: '危急', bg: 'bg-rose-500/20' },
      high: { color: '#FF9A3C', label: '高危', bg: 'bg-orange-500/20' },
      medium: { color: '#FFD166', label: '中危', bg: 'bg-yellow-500/20' },
      low: { color: '#3B82F6', label: '低危', bg: 'bg-blue-500/20' }
    };
    const c = config[severity || 'medium'] || config.medium;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${c.bg}`} style={{ color: c.color }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
        {c.label}
      </span>
    );
  };

  const getRuleContentPreview = (content?: string) => {
    if (!content) return '-';
    try {
      const parsed = JSON.parse(content);
      if (parsed.steps) {
        return `时序: ${parsed.steps.length} 步`;
      }
      if (parsed.groups) {
        return `关联: ${parsed.groups.length} 组, ${parsed.group_logic || 'AND'} 逻辑`;
      }
      const conds = parsed.conditions;
      if (conds && Array.isArray(conds) && conds.length > 0) {
        const text = conditionsToText(conds);
        return text.length > 60 ? text.substring(0, 60) + '...' : text;
      }
      if (parsed.time_window || parsed.threshold) {
        return `窗口: ${parsed.time_window || '-'} 阈值: ${parsed.threshold || '-'}`;
      }
      return 'JSON 规则';
    } catch {
      return content.length > 60 ? content.substring(0, 60) + '...' : content;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg ${
              toast.type === 'success' ? 'bg-emerald-500/90' : 'bg-rose-500/90'
            } text-white flex items-center gap-2`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">规则管理</h1>
          <p className="text-text-secondary mt-1">创建和管理安全检测规则</p>
        </div>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors">
          <Plus className="w-4 h-4" /> 新建规则
        </motion.button>
      </div>

      {/* 搜索 */}
      <div className="glass-card rounded-xl p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input type="text" placeholder="搜索规则名称或ID，支持：单事件、关联、时序..."
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-primary" />
        </div>
      </div>

      {/* 规则列表 */}
      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-card-bg border-b border-border-color">
            <tr>
              <th className="px-4 py-4 text-left text-sm font-medium text-text-secondary">规则ID</th>
              <th className="px-4 py-4 text-left text-sm font-medium text-text-secondary">规则名称</th>
              <th className="px-4 py-4 text-left text-sm font-medium text-text-secondary">类型</th>
              <th className="px-4 py-4 text-left text-sm font-medium text-text-secondary">严重等级</th>
              <th className="px-4 py-4 text-left text-sm font-medium text-text-secondary">规则内容</th>
              <th className="px-4 py-4 text-left text-sm font-medium text-text-secondary">关联数据源</th>
              <th className="px-4 py-4 text-left text-sm font-medium text-text-secondary">状态</th>
              <th className="px-4 py-4 text-left text-sm font-medium text-text-secondary">命中</th>
              <th className="px-4 py-4 text-left text-sm font-medium text-text-secondary">最后命中</th>
              <th className="px-4 py-4 text-left text-sm font-medium text-text-secondary">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.map((rule, index) => {
              const dsCount = (rule.dataSourceIds || []).filter(Boolean).length;
              return (
                <motion.tr key={rule.id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="table-row border-b border-border-color/50 last:border-0">
                  <td className="px-4 py-4 text-sm text-text-secondary font-mono">{rule.id}</td>
                  <td className="px-4 py-4">
                    <div className="text-sm font-medium text-text-primary">{rule.name}</div>
                    <div className="text-xs text-text-muted mt-0.5">{rule.description}</div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(rule.type)}`}>{getTypeLabel(rule.type)}</span>
                  </td>
                  <td className="px-4 py-4">{getSeverityBadge(rule.severity)}</td>
                  <td className="px-4 py-4">
                    <div className="text-xs font-mono text-text-secondary max-w-[200px] truncate" title={rule.ruleContent}>
                      <Code className="w-3 h-3 inline mr-1 text-text-muted" />
                      {getRuleContentPreview(rule.ruleContent)}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center gap-1 text-sm text-text-secondary">
                      <Database className="w-3.5 h-3.5 text-text-muted" />{dsCount}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <button onClick={() => toggleStatus(rule.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${rule.status === 'enabled' ? 'bg-primary' : 'bg-text-muted'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${rule.status === 'enabled' ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-4 text-sm text-text-primary font-mono">{rule.hitCount}</td>
                  <td className="px-4 py-4 text-sm text-text-secondary">{rule.lastHitTime ? new Date(rule.lastHitTime).toLocaleString('zh-CN') : '-'}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1">
                      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                        onClick={() => handleEdit(rule)}
                        className="p-1.5 text-text-secondary hover:text-primary transition-colors" title="编辑规则">
                        <Edit2 className="w-4 h-4" />
                      </motion.button>
                      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                        onClick={() => handleTest(rule)} disabled={isTesting}
                        className="p-1.5 text-text-secondary hover:text-success transition-colors disabled:opacity-50" title="测试规则">
                        {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      </motion.button>
                      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                        onClick={() => handleDelete(rule.id)}
                        className="p-1.5 text-text-secondary hover:text-critical transition-colors" title="删除规则">
                        <Trash2 className="w-4 h-4" />
                      </motion.button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 行内测试结果 */}
      <AnimatePresence>
        {testResult && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="glass-card rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-text-primary">测试结果</span>
              <button onClick={() => setTestResult(null)} className="text-text-muted hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={`p-3 rounded-lg border ${testResult.data.matched ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'}`}>
              <div className="flex items-center gap-2">
                {testResult.data.matched ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                <span className={`text-sm font-medium ${testResult.data.matched ? 'text-emerald-400' : 'text-rose-400'}`}>
                  匹配 {testResult.data.matched_count || 0} 条日志
                </span>
              </div>
              {testResult.data.matched_logs && testResult.data.matched_logs.length > 0 && (
                <div className="mt-2 space-y-1 max-h-32 overflow-auto">
                  {testResult.data.matched_logs.slice(0, 5).map((log: any, idx: number) => (
                    <pre key={idx} className="text-xs font-mono text-text-muted bg-page-bg p-2 rounded truncate">
                      {log.message || log.raw_message || JSON.stringify(log)}
                    </pre>
                  ))}
                </div>
              )}
              {testResult.data.sources && Object.keys(testResult.data.sources).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(testResult.data.sources).map(([id, src]: [string, any]) => (
                    <span key={id} className="text-xs px-2 py-1 rounded bg-card-bg border border-border-color text-text-muted">
                      {src.data_source_name}: {src.matched_count} 条
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 表单模态框 */}
      <AnimatePresence>
        {showForm && (
          <RuleFormModal
            editingRule={editingRule}
            dataSources={dataSources}
            playbooks={playbooks}
            onSave={handleSave}
            onClose={() => setShowForm(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
