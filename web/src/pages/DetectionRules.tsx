import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Edit2, Trash2, Play, X, Code, FileText, Clock, AlertTriangle, Database, Server, CheckCircle, ChevronRight, Globe, MessageSquare, Terminal, Cloud, Lock, FolderOpen, Wifi } from 'lucide-react';
import { rulesApi, dataSourcesApi } from '../services/api';

interface DetectionRule {
  id: number | string;
  name: string;
  type: string;
  status: string;
  hitCount?: number;
  lastHitTime?: string;
  description?: string;
  dataSourceIds?: (string | number)[];
}

interface DataSource {
  id: number | string;
  name: string;
  type: string;
  status: string;
  protocol?: string;
  totalEvents?: number;
  parsePipelines?: number[];
}

const protocolIcons: Record<string, React.ElementType> = {
  kafka: MessageSquare,
  rabbitmq: MessageSquare,
  http: Globe,
  https: Lock,
  s3: Cloud,
  syslog: Terminal,
  webhook: Globe,
  grpc: Wifi,
  tcp: Wifi,
  udp: Wifi,
  file: FolderOpen,
  ftp: FolderOpen,
  sftp: Lock,
  jdbc: Database,
  redis: Database,
  elasticsearch: Database
};

const getTypeLabel = (type: string) => {
  const labels: Record<string, string> = { single: '单事件', correlation: '关联', sequence: '时序' };
  return labels[type] || type;
};

const getTypeColor = (type: string) => {
  const colors: Record<string, string> = { single: 'bg-blue-500/20 text-blue-400', correlation: 'bg-purple-500/20 text-purple-400', sequence: 'bg-orange-500/20 text-orange-400' };
  return colors[type] || 'bg-gray-500/20 text-gray-400';
};

const severityOptions = [
  { value: 'critical', label: '危急', color: '#F2545B' },
  { value: 'high', label: '高危', color: '#FF9A3C' },
  { value: 'medium', label: '中危', color: '#FFD166' },
  { value: 'low', label: '低危', color: '#3B82F6' }
];

export default function DetectionRules() {
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<DetectionRule | null>(null);

  // 获取数据
  const fetchData = async () => {
    try {
      const [rulesRes, dsRes] = await Promise.allSettled([
        rulesApi.getRules({ page_size: 100 }),
        dataSourcesApi.getDataSources({ page_size: 100 })
      ]);

      if (rulesRes.status === 'fulfilled' && rulesRes.value.success) {
        const items = Array.isArray(rulesRes.value.data) ? rulesRes.value.data : rulesRes.value.data?.items || [];
        setRules(items.map((item: any) => ({
          id: item.id,
          name: item.name || item.rule_name,
          type: item.type || 'single',
          status: item.status === 'active' ? 'enabled' : item.status,
          hitCount: item.hit_count || 0,
          lastHitTime: item.last_hit_time || item.updated_at,
          description: item.description || item.detail,
          dataSourceIds: item.data_source_ids || []
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
    } catch (error) {
      console.error('获取数据失败:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);
  const [formData, setFormData] = useState<Partial<DetectionRule>>({
    name: '',
    type: 'single',
    description: '',
    status: 'disabled'
  });
  const [activeTab, setActiveTab] = useState<'basic' | 'condition' | 'action' | 'datasource'>('basic');
  const [selectedDataSources, setSelectedDataSources] = useState<string[]>([]);

  const filteredRules = rules.filter(rule => {
    const matchesSearch = rule.name.toLowerCase().includes(searchTerm.toLowerCase()) || String(rule.id).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || rule.type === filterType;
    return matchesSearch && matchesType;
  });

  const toggleStatus = (id: string | number) => {
    setRules(prev => prev.map(rule => rule.id === id ? { ...rule, status: rule.status === 'enabled' ? 'disabled' : 'enabled' } : rule));
  };

  const handleAdd = () => {
    setEditingRule(null);
    setFormData({
      name: '',
      type: 'single',
      description: '',
      status: 'disabled'
    });
    setSelectedDataSources([]);
    setActiveTab('basic');
    setShowForm(true);
  };

  const handleEdit = (rule: DetectionRule) => {
    setEditingRule(rule);
    setFormData({ ...rule });
    setSelectedDataSources((rule.dataSourceIds || []).map(id => String(id)));
    setActiveTab('basic');
    setShowForm(true);
  };

  const handleSave = () => {
    if (!formData.name) return;

    if (editingRule) {
      setRules(prev => prev.map(rule =>
        rule.id === editingRule.id
          ? { ...rule, ...formData, dataSourceIds: selectedDataSources } as DetectionRule
          : rule
      ));
    } else {
      const newRule: DetectionRule = {
        id: `RULE-${new Date().getFullYear()}-${String(rules.length + 1).padStart(3, '0')}`,
        name: formData.name!,
        type: formData.type as 'single' | 'correlation' | 'sequence',
        status: 'disabled',
        hitCount: 0,
        description: formData.description,
        dataSourceIds: selectedDataSources
      };
      setRules(prev => [...prev, newRule]);
    }
    setShowForm(false);
  };

  const handleDelete = (id: string | number) => {
    setRules(prev => prev.filter(rule => rule.id !== id));
  };

  const handleTest = (rule: DetectionRule) => {
    alert(`正在测试规则: ${rule.name}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">规则管理</h1>
          <p className="text-text-secondary mt-1">创建和管理安全检测规则</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          新建规则
        </motion.button>
      </div>

      <div className="glass-card rounded-xl p-4 flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="搜索规则名称或ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-primary"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary cursor-pointer"
        >
          <option value="all">全部类型</option>
          <option value="single">单事件</option>
          <option value="correlation">关联</option>
          <option value="sequence">时序</option>
        </select>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-card-bg border-b border-border-color">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">规则ID</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">规则名称</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">类型</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">状态</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">命中次数</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">最后命中</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.map((rule, index) => (
              <motion.tr
                key={rule.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="table-row border-b border-border-color/50 last:border-0"
              >
                <td className="px-6 py-4 text-sm text-text-secondary font-mono">{rule.id}</td>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-text-primary">{rule.name}</div>
                  <div className="text-xs text-text-muted mt-0.5">{rule.description}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(rule.type)}`}>
                    {getTypeLabel(rule.type)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => toggleStatus(rule.id)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${rule.status === 'enabled' ? 'bg-primary' : 'bg-text-muted'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${rule.status === 'enabled' ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </td>
                <td className="px-6 py-4 text-sm text-text-primary font-mono">{rule.hitCount}</td>
                <td className="px-6 py-4 text-sm text-text-secondary">{rule.lastHitTime ? new Date(rule.lastHitTime).toLocaleString('zh-CN') : '-'}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleEdit(rule)}
                      className="p-2 text-text-secondary hover:text-primary transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleTest(rule)}
                      className="p-2 text-text-secondary hover:text-success transition-colors"
                    >
                      <Play className="w-4 h-4" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleDelete(rule.id)}
                      className="p-2 text-text-secondary hover:text-critical transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </motion.button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowForm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <div
                className="glass-card rounded-xl p-0 w-[700px] pointer-events-auto max-h-[85vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-6 border-b border-border-color">
                  <h2 className="text-xl font-semibold text-text-primary">
                    {editingRule ? '编辑规则' : '新建规则'}
                  </h2>
                  <button
                    onClick={() => setShowForm(false)}
                    className="p-2 text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex border-b border-border-color">
                  {[
                    { id: 'basic', label: '基本信息', icon: FileText },
                    { id: 'datasource', label: '数据源', icon: Database },
                    { id: 'condition', label: '检测条件', icon: Code },
                    { id: 'action', label: '响应动作', icon: AlertTriangle }
                  ].map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                        className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                          activeTab === tab.id
                            ? 'text-primary border-b-2 border-primary'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                <div className="p-6 max-h-[60vh] overflow-auto">
                  {activeTab === 'basic' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-text-secondary text-sm mb-2">规则名称</label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="请输入规则名称"
                          className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-text-secondary text-sm mb-2">规则类型</label>
                        <select
                          value={formData.type}
                          onChange={(e) => setFormData({ ...formData, type: e.target.value as 'single' | 'correlation' | 'sequence' })}
                          className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                        >
                          <option value="single">单事件规则</option>
                          <option value="correlation">关联规则</option>
                          <option value="sequence">时序规则</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-text-secondary text-sm mb-2">严重等级</label>
                        <div className="flex gap-2">
                          {severityOptions.map((sev) => (
                            <button
                              key={sev.value}
                              className="flex-1 px-3 py-2 rounded-lg border border-border-color text-sm transition-colors hover:border-primary"
                            >
                              <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: sev.color }} />
                              {sev.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-text-secondary text-sm mb-2">规则描述</label>
                        <textarea
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          rows={3}
                          placeholder="请输入规则描述..."
                          className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none resize-none"
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === 'datasource' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-text-primary">关联数据源</h3>
                          <p className="text-xs text-text-muted mt-1">选择规则要监控的数据源，可多选</p>
                        </div>
                        <span className="text-xs text-text-muted">
                          已选择 {selectedDataSources.length} 个数据源
                        </span>
                      </div>

                      <div className="space-y-2 max-h-80 overflow-auto">
                        {dataSources.map((source) => {
                          const ProtocolIcon = protocolIcons[source.type.toLowerCase()] || Server;
                          const sourceId = String(source.id);
                          const isSelected = selectedDataSources.includes(sourceId);
                          return (
                            <motion.div
                              key={source.id}
                              whileHover={{ scale: 1.01 }}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedDataSources(selectedDataSources.filter(id => id !== sourceId));
                                } else {
                                  setSelectedDataSources([...selectedDataSources, sourceId]);
                                }
                              }}
                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                isSelected
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border-color hover:border-primary/50'
                              }`}
                            >
                              <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                                isSelected ? 'bg-primary border-primary' : 'border-text-muted'
                              }`}>
                                {isSelected && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                              </div>
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <ProtocolIcon className="w-5 h-5 text-primary" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-text-primary">{source.name}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    source.status === 'connected' ? 'bg-emerald-500/20 text-emerald-400' :
                                    source.status === 'syncing' ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-text-muted/20 text-text-muted'
                                  }`}>
                                    {source.status === 'connected' ? '已连接' :
                                     source.status === 'syncing' ? '同步中' : '已断开'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                                  <span className="flex items-center gap-1">
                                    <Database className="w-3 h-3" />
                                    {source.protocol || source.type}
                                  </span>
                                  <span>{source.totalEvents ? `${(source.totalEvents / 1000000).toFixed(1)}M 事件` : '0 事件'}</span>
                                  <span>{source.parsePipelines?.length || 0} 个解析管道</span>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-text-muted" />
                            </motion.div>
                          );
                        })}
                      </div>

                      {selectedDataSources.length === 0 && (
                        <div className="text-center py-8 text-text-muted">
                          <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>未选择数据源</p>
                          <p className="text-xs mt-1">请至少选择一个数据源以启用规则</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'condition' && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <Database className="w-4 h-4 text-primary" />
                        <span className="text-sm text-text-primary">
                          已关联 {selectedDataSources.length} 个数据源
                          {selectedDataSources.length > 0 && (
                            <span className="text-text-muted ml-1">
                              ({selectedDataSources.map(id => dataSources.find(s => s.id === id)?.name).filter(Boolean).join(', ')})
                            </span>
                          )}
                        </span>
                      </div>

                      <div>
                        <label className="block text-text-secondary text-sm mb-2">检测逻辑</label>
                        <div className="bg-page-bg rounded-lg p-4 font-mono text-sm">
                          <div className="flex items-center gap-2 mb-2 text-text-muted">
                            <Code className="w-4 h-4" />
                            <span>规则表达式</span>
                          </div>
                          <textarea
                            rows={6}
                            placeholder={`// 示例: 检测暴力破解\nevent_type == \"login\" AND\nstatus == \"failed\" AND\ncount(5m) >= 5`}
                            className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none resize-none font-mono text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-text-secondary text-sm mb-2">时间窗口</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            defaultValue={5}
                            className="w-24 px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                          />
                          <select className="px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none">
                            <option>分钟</option>
                            <option>小时</option>
                            <option>天</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-text-secondary text-sm mb-2">阈值</label>
                        <input
                          type="number"
                          defaultValue={5}
                          className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === 'action' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-text-secondary text-sm mb-2">响应动作</label>
                        <div className="space-y-2">
                          {[
                            { id: 'alert', label: '生成告警', desc: '触发时创建安全事件' },
                            { id: 'block', label: '自动封堵', desc: '自动封堵相关IP地址' },
                            { id: 'notify', label: '发送通知', desc: '向管理员发送通知' },
                            { id: 'ticket', label: '创建工单', desc: '在ITSM系统中创建工单' }
                          ].map((action) => (
                            <div
                              key={action.id}
                              className="flex items-start gap-3 p-3 bg-page-bg rounded-lg border border-border-color cursor-pointer hover:border-primary transition-colors"
                            >
                              <input type="checkbox" className="mt-1" />
                              <div>
                                <div className="text-text-primary font-medium">{action.label}</div>
                                <div className="text-text-muted text-sm">{action.desc}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-text-secondary text-sm mb-2">通知方式</label>
                        <div className="flex gap-2">
                          {['邮件', '短信', '钉钉', '企业微信'].map((method) => (
                            <button
                              key={method}
                              className="px-4 py-2 rounded-lg border border-border-color text-sm text-text-secondary hover:border-primary transition-colors"
                            >
                              {method}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-text-secondary text-sm mb-2">抑制周期</label>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-text-muted" />
                          <input
                            type="number"
                            defaultValue={30}
                            className="w-24 px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                          />
                          <span className="text-text-secondary">分钟内不重复触发</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 p-6 border-t border-border-color">
                  <button
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!formData.name}
                    className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    {editingRule ? '保存' : '创建'}
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
