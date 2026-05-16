import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, FileJson, ScrollText, Code, Copy, Edit3, Trash2, X, Save, Braces, Table, Terminal,
  AlertTriangle, CheckCircle, Link2, GitBranch, Sparkles, Play, Wand2, Eye, Search,
  Type, Hash, Calendar, Globe, ToggleLeft, Server, Database, Cloud, Cpu, HardDrive,
  Box, Layers, FileCode, Activity, Zap, Shield, Lock, Settings, Code2, Regex,
  Filter, LayoutGrid, List, ChevronRight, Star, Clock, TrendingUp, MoreHorizontal,
  BookOpen, Variable, AlignLeft, Split, Columns, TestTube, RefreshCw, Loader2
} from 'lucide-react';
import { formatTemplatesApi } from '../services/api';

interface FormatTemplate {
  id: number;
  name: string;
  type: string;
  category: string;
  description?: string;
  fields?: { name: string; type: string; sample?: any; description?: string }[];
  parserType?: string;
}

interface ParserConfig {
  jsonPath?: string;
  kvDelimiter?: string;
  pairDelimiter?: string;
  grokPattern?: string;
  regexPattern?: string;
  regexFlags?: string;
  csvDelimiter?: string;
  csvHeader?: boolean;
  csvColumns?: { index: number; name: string; type: string }[];
  syslogVariant?: 'rfc3164' | 'rfc5424';
  cefVersion?: string;
}

const grokPatterns = [
  { name: 'IPORHOST', desc: 'IP地址或主机名', example: '192.168.1.1' },
  { name: 'USER', desc: '用户名', example: 'root' },
  { name: 'NUMBER', desc: '数字', example: '123' },
  { name: 'WORD', desc: '单词', example: 'GET' },
  { name: 'DATA', desc: '任意数据', example: 'any content' },
  { name: 'GREEDYDATA', desc: '贪婪匹配', example: 'rest of line' },
  { name: 'TIMESTAMP_ISO8601', desc: 'ISO8601时间', example: '2026-05-03T10:30:00' },
  { name: 'HTTPDATE', desc: 'HTTP日期', example: '03/May/2026:10:30:00 +0800' },
  { name: 'URIPATHPARAM', desc: 'URI路径', example: '/api/users?id=1' },
  { name: 'LOGLEVEL', desc: '日志级别', example: 'ERROR' },
  { name: 'MONTH', desc: '月份英文', example: 'May' },
  { name: 'MONTHDAY', desc: '月份日期', example: '03' },
  { name: 'YEAR', desc: '年份', example: '2026' },
  { name: 'TIME', desc: '时间', example: '10:30:00' }
];

const categories = [
  { id: 'all', name: '全部', icon: LayoutGrid, color: 'from-primary to-accent' },
  { id: 'web', name: 'Web服务器', icon: Globe, color: 'from-primary to-indigo-600' },
  { id: 'system', name: '系统日志', icon: Server, color: 'from-green-500 to-emerald-500' },
  { id: 'application', name: '应用日志', icon: Code2, color: 'from-purple-500 to-violet-500' }
];

const parserTypes = [
  { id: 'json', name: 'JSON', icon: Braces, desc: 'JSON结构化解析', color: 'from-primary to-indigo-600' },
  { id: 'keyvalue', name: '键值对', icon: Table, desc: 'Key=Value格式', color: 'from-green-500 to-emerald-500' },
  { id: 'grok', name: 'Grok', icon: Code, desc: 'Grok模式匹配', color: 'from-primary to-purple-500' },
  { id: 'regex', name: '正则', icon: Regex, desc: '正则表达式', color: 'from-orange-500 to-amber-500' },
  { id: 'syslog', name: 'Syslog', icon: Terminal, desc: 'Syslog标准格式', color: 'from-cyan-500 to-blue-500' },
  { id: 'cef', name: 'CEF', icon: AlertTriangle, desc: '通用事件格式', color: 'from-red-500 to-orange-500' },
  { id: 'csv', name: 'CSV', icon: Table, desc: 'CSV表格格式', color: 'from-indigo-500 to-purple-500' }
];

const typeOptions = [
  { id: 'string', name: '字符串', icon: Type, color: 'bg-page-bg text-text-secondary border-border-color' },
  { id: 'number', name: '数字', icon: Hash, color: 'bg-primary/10 text-primary border-primary/20' },
  { id: 'datetime', name: '时间', icon: Calendar, color: 'bg-purple-50 text-purple-600 border-purple-200' },
  { id: 'ip', name: 'IP地址', icon: Globe, color: 'bg-green-50 text-green-600 border-green-200' },
  { id: 'boolean', name: '布尔', icon: ToggleLeft, color: 'bg-amber-50 text-amber-600 border-amber-200' }
];

const getCategoryIcon = (categoryId: string) => categories.find(c => c.id === categoryId)?.icon || FileCode;
const getCategoryColor = (categoryId: string) => categories.find(c => c.id === categoryId)?.color || 'from-primary to-accent';
const getParserType = (parserId: string) => parserTypes.find(p => p.id === parserId) || parserTypes[0];
const getTypeIcon = (type: string) => typeOptions.find(t => t.id === type)?.icon || Type;
const getTypeColor = (type: string) => typeOptions.find(t => t.id === type)?.color || 'bg-slate-100 text-slate-600 border-slate-200';

export default function FormatTemplate() {
  const [templates, setTemplates] = useState<FormatTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<FormatTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState<'config' | 'fields'>('config');
  const [detectedFields, setDetectedFields] = useState<{ name: string; type: string; value: any; selected: boolean; targetName?: string }[]>([]);
  const [fieldSearchQuery, setFieldSearchQuery] = useState('');
  const [fieldSortBy, setFieldSortBy] = useState<'name' | 'type'>('name');

  // 从API获取数据
  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await formatTemplatesApi.getFormats({ page_size: 100 });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        setTemplates(items.map((item: any) => ({
          id: item.id,
          name: item.name || item.type_name,
          type: item.type || 'json',
          category: item.category || 'application',
          description: item.description,
          fields: item.fields || [],
          parserType: item.parser_type || item.type || 'json'
        })));
      }
    } catch (error) {
      console.error('获取模板失败:', error);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const [formData, setFormData] = useState<FormatTemplate>({
    id: 0,
    name: '',
    description: '',
    format: 'json',
    category: 'application',
    parserType: 'json',
    parserConfig: { jsonPath: '$' },
    sample: '',
    fields: [],
    usageCount: 0,
    isPreset: false
  });

  const filteredTemplates = templates.filter(t => {
    const matchesCategory = activeCategory === 'all' || t.category === activeCategory;
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const initParserConfig = (parserType: string): ParserConfig => {
    switch (parserType) {
      case 'json':
        return { jsonPath: '$' };
      case 'keyvalue':
        return { kvDelimiter: '=', pairDelimiter: ' ' };
      case 'grok':
        return { grokPattern: '' };
      case 'regex':
        return { regexPattern: '', regexFlags: 'g' };
      case 'csv':
        return { csvDelimiter: ',', csvHeader: true, csvColumns: [] };
      case 'syslog':
        return { syslogVariant: 'rfc5424' };
      case 'cef':
        return { cefVersion: '0' };
      default:
        return {};
    }
  };

  const parseWithConfig = (sample: string, parserType: string, config?: ParserConfig): any[] => {
    if (!sample?.trim()) return [];
    const fields: any[] = [];

    // 添加原始日志字段
    fields.push({ name: 'raw_log', type: 'string', value: sample.substring(0, 200) });

    try {
      switch (parserType) {
        case 'json':
          const jsonData = JSON.parse(sample);
          const extractFields = (obj: any, prefix = '') => {
            Object.entries(obj).forEach(([key, value]) => {
              const fullKey = prefix ? `${prefix}.${key}` : key;
              if (value && typeof value === 'object' && !Array.isArray(value)) {
                extractFields(value, fullKey);
              } else {
                const type = typeof value === 'number' ? 'number' :
                             typeof value === 'boolean' ? 'boolean' :
                             /\d{4}-\d{2}-\d{2}/.test(String(value)) ? 'datetime' : 'string';
                fields.push({ name: fullKey, type, value: String(value).substring(0, 50) });
              }
            });
          };
          extractFields(jsonData);
          break;

        case 'keyvalue':
          const kvDelim = config?.kvDelimiter || '=';
          const pairDelim = config?.pairDelimiter || ' ';
          const pairs = sample.split(pairDelim);
          pairs.forEach(pair => {
            const [key, ...valueParts] = pair.split(kvDelim);
            if (key && valueParts.length > 0) {
              const value = valueParts.join(kvDelim).replace(/^["']|["']$/g, '');
              const type = /^\d+$/.test(value) ? 'number' :
                           /\d{4}-\d{2}-\d{2}/.test(value) ? 'datetime' : 'string';
              fields.push({ name: key.trim(), type, value });
            }
          });
          break;

        case 'grok':
          if (config?.grokPattern) {
            const pattern = config.grokPattern;
            const fieldMatches = pattern.match(/%{\w+:(\w+)}/g) || [];
            fieldMatches.forEach((match, idx) => {
              const fieldName = match.replace(/%{\w+:/, '').replace(/}$/, '');
              fields.push({ name: fieldName, type: 'string', value: `匹配组${idx + 1}` });
            });
          }
          break;

        case 'regex':
          if (config?.regexPattern) {
            const namedGroups = config.regexPattern.match(/\(\?<(\w+)>/g) || [];
            namedGroups.forEach((group) => {
              const name = group.replace('(?<', '').replace('>', '');
              fields.push({ name, type: 'string', value: '捕获值' });
            });
            if (namedGroups.length === 0) {
              const groups = config.regexPattern.match(/\([^?]/g) || [];
              groups.forEach((_, idx) => {
                fields.push({ name: `group${idx + 1}`, type: 'string', value: `捕获组${idx + 1}` });
              });
            }
          }
          break;

        case 'csv':
          const lines = sample.split('\n').filter(l => l.trim());
          if (lines.length > 0) {
            const delimiter = config?.csvDelimiter || ',';
            const hasHeader = config?.csvHeader !== false;
            const values = lines[0].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
            values.forEach((val, idx) => {
              const name = hasHeader ? val : `col${idx + 1}`;
              const sampleVal = hasHeader && lines[1] ? lines[1].split(delimiter)[idx]?.trim().replace(/^["']|["']$/g, '') : val;
              const type = /^\d+$/.test(sampleVal) ? 'number' :
                           /\d{4}-\d{2}-\d{2}/.test(sampleVal) ? 'datetime' : 'string';
              fields.push({ name, type, value: sampleVal || val });
            });
          }
          break;

        case 'syslog':
          const syslogMatch = sample.match(/<(\d+)>(\d+\s+)?(\S+)\s+(.*)/);
          if (syslogMatch) {
            fields.push(
              { name: 'priority', type: 'number', value: syslogMatch[1] },
              { name: 'timestamp', type: 'datetime', value: syslogMatch[3] || '' },
              { name: 'message', type: 'string', value: syslogMatch[4] || '' }
            );
          }
          break;

        case 'cef':
          const cefMatch = sample.match(/CEF:(\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(\d+)\|(.*)/);
          if (cefMatch) {
            fields.push(
              { name: 'version', type: 'string', value: cefMatch[1] },
              { name: 'deviceVendor', type: 'string', value: cefMatch[2] },
              { name: 'signatureId', type: 'string', value: cefMatch[5] },
              { name: 'severity', type: 'string', value: cefMatch[7] }
            );
          }
          break;
      }
    } catch (e) {
      console.error('Parse error:', e);
    }
    return fields;
  };

  const handleTest = async () => {
    if (!formData.sample?.trim()) return;
    setIsTesting(true);
    await new Promise(r => setTimeout(r, 300));
    const result = parseWithConfig(formData.sample, formData.parserType, formData.parserConfig);
    const fieldsWithSelection = result.map((f: any) => ({
      ...f,
      selected: false,
      targetName: f.name
    }));
    setDetectedFields(fieldsWithSelection);
    setTestResult(result);
    setIsTesting(false);
    setActiveTab('fields');
  };

  const toggleFieldSelected = (index: number) => {
    setDetectedFields(prev => prev.map((f, i) => i === index ? { ...f, selected: !f.selected } : f));
  };

  const selectAllFields = () => {
    setDetectedFields(prev => prev.map(f => ({ ...f, selected: true })));
  };

  const deselectAllFields = () => {
    setDetectedFields(prev => prev.map(f => ({ ...f, selected: false })));
  };

  const updateFieldTargetName = (index: number, targetName: string) => {
    setDetectedFields(prev => prev.map((f, i) => i === index ? { ...f, targetName } : f));
  };

  const copyFieldName = (name: string) => {
    navigator.clipboard.writeText(name);
  };

  const applyDetectedFields = () => {
    const selectedFields = detectedFields.filter(f => f.selected);
    if (selectedFields.length > 0) {
      const newFields = selectedFields.map(f => ({
        name: f.targetName || f.name,
        type: f.type,
        sample: String(f.value).substring(0, 100),
        description: ''
      }));
      setFormData(prev => ({ ...prev, fields: [...prev.fields, ...newFields] }));
      setActiveTab('config');
    }
  };

  const openAdd = () => {
    setIsEditing(false);
    setTestResult(null);
    setActiveTab('config');
    setFormData({
      id: '',
      name: '',
      description: '',
      format: 'json',
      category: 'application',
      parserType: 'json',
      parserConfig: { jsonPath: '$' },
      sample: '',
      fields: [],
      usageCount: 0,
      isPreset: false
    });
    setShowAddModal(true);
  };

  const openEdit = (template: FormatTemplate) => {
    setIsEditing(true);
    setSelectedTemplate(template);
    setTestResult(null);
    setActiveTab('config');
    setFormData({ ...template });
    setShowAddModal(true);
  };

  const openDetail = (template: FormatTemplate) => {
    setSelectedTemplate(template);
    setShowDetailModal(true);
  };

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      const parsedFields = parseWithConfig(formData.sample, formData.parserType, formData.parserConfig);
      const payload = {
        name: formData.name.trim(),
        description: formData.description || '',
        type: formData.parserType,
        category: formData.category,
        sample: formData.sample,
        fields: parsedFields.length > 0
          ? parsedFields.map(f => ({ name: f.name, type: f.type, sample: f.value, description: '' }))
          : formData.fields,
        input_config: formData.parserConfig,
      };
      if (isEditing && selectedTemplate) {
        await formatTemplatesApi.updateFormat(String(selectedTemplate.id), payload);
        setTemplates(prev => prev.map(t => t.id === selectedTemplate.id ? { ...t, ...payload, id: t.id, fields: payload.fields, parserType: payload.type } : t));
      } else {
        const res = await formatTemplatesApi.createFormat(payload);
        if (res.success && res.data) {
          const item = res.data;
          setTemplates(prev => [...prev, {
            id: item.id,
            name: item.name || payload.name,
            type: item.type || payload.type,
            category: item.category || payload.category,
            description: item.description,
            fields: item.fields || payload.fields,
            parserType: item.type || payload.type
          }]);
        }
      }
      setShowAddModal(false);
      setTestResult(null);
    } catch (error) {
      console.error('保存模板失败:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!showDeleteConfirm) return;
    setDeleting(true);
    try {
      await formatTemplatesApi.deleteFormat(showDeleteConfirm);
      setTemplates(prev => prev.filter(t => String(t.id) !== showDeleteConfirm));
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('删除模板失败:', error);
    } finally {
      setDeleting(false);
    }
  };
  const confirmDelete = (id: string) => setShowDeleteConfirm(id);

  const handleDuplicate = async (template: FormatTemplate) => {
    try {
      const payload = {
        name: `${template.name} (副本)`,
        description: template.description || '',
        type: template.parserType || template.type || 'json',
        category: template.category || 'application',
        fields: template.fields || [],
      };
      const res = await formatTemplatesApi.createFormat(payload);
      if (res.success && res.data) {
        const item = res.data;
        setTemplates(prev => [...prev, {
          id: item.id,
          name: item.name || payload.name,
          type: item.type || payload.type,
          category: item.category || payload.category,
          description: item.description,
          fields: item.fields || payload.fields,
          parserType: item.type || payload.type
        }]);
      }
    } catch (error) {
      console.error('复制模板失败:', error);
    }
  };

  const updateParserConfig = (key: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      parserConfig: { ...prev.parserConfig, [key]: value }
    }));
  };

  const renderParserConfig = () => {
    const { parserType, parserConfig } = formData;

    switch (parserType) {
      case 'json':
        return (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="flex items-center gap-2 text-blue-800 font-medium mb-2">
                <Braces className="w-4 h-4" /> JSON解析配置
              </div>
              <p className="text-sm text-primary">自动提取JSON对象中的所有字段，支持嵌套对象展开</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">JSON Path（可选）</label>
              <input
                type="text"
                value={parserConfig?.jsonPath || '$'}
                onChange={e => updateParserConfig('jsonPath', e.target.value)}
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                placeholder="例如: $.data.logs"
              />
              <p className="text-xs text-text-secondary mt-1">使用点号路径指定JSON中的特定节点，默认$表示根节点</p>
            </div>
          </div>
        );

      case 'keyvalue':
        return (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 rounded-xl border border-green-200">
              <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                <Table className="w-4 h-4" /> 键值对解析配置
              </div>
              <p className="text-sm text-green-600">配置键值对的分隔符，支持自定义格式</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">键值分隔符</label>
                <input
                  type="text"
                  value={parserConfig?.kvDelimiter || '='}
                  onChange={e => updateParserConfig('kvDelimiter', e.target.value)}
                  className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                />
                <p className="text-xs text-text-secondary mt-1">例如: = 或 :</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">配对分隔符</label>
                <input
                  type="text"
                  value={parserConfig?.pairDelimiter || ' '}
                  onChange={e => updateParserConfig('pairDelimiter', e.target.value)}
                  className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                />
                <p className="text-xs text-text-secondary mt-1">例如: 空格 或 ;</p>
              </div>
            </div>
          </div>
        );

      case 'grok':
        return (
          <div className="space-y-4">
            <div className="p-4 bg-primary/10 rounded-xl border border-primary/20">
              <div className="flex items-center gap-2 text-primary font-medium mb-2">
                <Code className="w-4 h-4" /> Grok模式配置
              </div>
              <p className="text-sm text-text-secondary">使用Grok模式匹配日志，支持常用模式组合</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Grok模式</label>
              <textarea
                value={parserConfig?.grokPattern || ''}
                onChange={e => updateParserConfig('grokPattern', e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm font-mono text-green-400 h-24 resize-none"
                placeholder="%{IPORHOST:client_ip} %{USER:ident}..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">常用模式</label>
              <div className="flex flex-wrap gap-2">
                {grokPatterns.map(p => (
                  <button
                    key={p.name}
                    onClick={() => {
                      const current = parserConfig?.grokPattern || '';
                      updateParserConfig('grokPattern', current + `%{${p.name}:field_name}`);
                    }}
                    className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                    title={`${p.desc} - 例如: ${p.example}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'regex':
        return (
          <div className="space-y-4">
            <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
              <div className="flex items-center gap-2 text-orange-700 font-medium mb-2">
                <Regex className="w-4 h-4" /> 正则表达式配置
              </div>
              <p className="text-sm text-orange-600">使用正则表达式捕获组提取字段，支持命名捕获 (?&lt;name&gt;...)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">正则表达式</label>
              <textarea
                value={parserConfig?.regexPattern || ''}
                onChange={e => updateParserConfig('regexPattern', e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm font-mono text-amber-400 h-24 resize-none"
                placeholder="(?<ip>\d+\.\d+\.\d+\.\d+) - (?<user>\w+)..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">匹配标志</label>
              <div className="flex gap-2">
                {['g', 'i', 'm', 's'].map(flag => (
                  <button
                    key={flag}
                    onClick={() => {
                      const current = parserConfig?.regexFlags || '';
                      const newFlags = current.includes(flag) ? current.replace(flag, '') : current + flag;
                      updateParserConfig('regexFlags', newFlags);
                    }}
                    className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                      (parserConfig?.regexFlags || '').includes(flag)
                        ? 'bg-amber-100 border-amber-300 text-amber-700'
                        : 'bg-card-bg border-border-color text-text-secondary'
                    }`}
                  >
                    {flag === 'g' && '全局 (g)'}
                    {flag === 'i' && '忽略大小写 (i)'}
                    {flag === 'm' && '多行 (m)'}
                    {flag === 's' && '单行 (s)'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'csv':
        return (
          <div className="space-y-4">
            <div className="p-4 bg-violet-50 rounded-xl border border-violet-200">
              <div className="flex items-center gap-2 text-violet-800 font-medium mb-2">
                <Table className="w-4 h-4" /> CSV解析配置
              </div>
              <p className="text-sm text-violet-600">配置CSV分隔符和列映射</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">分隔符</label>
                <select
                  value={parserConfig?.csvDelimiter || ','}
                  onChange={e => updateParserConfig('csvDelimiter', e.target.value)}
                  className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                >
                  <option value=",">逗号 (,)</option>
                  <option value="\t">制表符 (Tab)</option>
                  <option value=";">分号 (;)</option>
                  <option value="|">竖线 (|)</option>
                </select>
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={parserConfig?.csvHeader !== false}
                    onChange={e => updateParserConfig('csvHeader', e.target.checked)}
                    className="w-4 h-4 rounded border-border-color-hover"
                  />
                  <span className="text-sm text-text-primary">第一行是表头</span>
                </label>
              </div>
            </div>
          </div>
        );

      case 'syslog':
        return (
          <div className="space-y-4">
            <div className="p-4 bg-cyan-50 rounded-xl border border-cyan-200">
              <div className="flex items-center gap-2 text-cyan-800 font-medium mb-2">
                <Terminal className="w-4 h-4" /> Syslog解析配置
              </div>
              <p className="text-sm text-cyan-600">自动提取Syslog标准字段</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Syslog变体</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => updateParserConfig('syslogVariant', 'rfc3164')}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    parserConfig?.syslogVariant === 'rfc3164'
                      ? 'border-cyan-500 bg-cyan-50'
                      : 'border-border-color hover:border-cyan-300'
                  }`}
                >
                  <div className="font-medium text-sm">RFC 3164</div>
                  <div className="text-xs text-text-secondary">传统BSD Syslog格式</div>
                </button>
                <button
                  onClick={() => updateParserConfig('syslogVariant', 'rfc5424')}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    parserConfig?.syslogVariant === 'rfc5424'
                      ? 'border-cyan-500 bg-cyan-50'
                      : 'border-border-color hover:border-cyan-300'
                  }`}
                >
                  <div className="font-medium text-sm">RFC 5424</div>
                  <div className="text-xs text-text-secondary">现代Syslog格式</div>
                </button>
              </div>
            </div>
          </div>
        );

      case 'cef':
        return (
          <div className="space-y-4">
            <div className="p-4 bg-rose-50 rounded-xl border border-rose-200">
              <div className="flex items-center gap-2 text-rose-800 font-medium mb-2">
                <AlertTriangle className="w-4 h-4" /> CEF解析配置
              </div>
              <p className="text-sm text-rose-600">自动提取CEF通用事件格式字段</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">CEF版本</label>
              <input
                type="text"
                value={parserConfig?.cefVersion || '0'}
                onChange={e => updateParserConfig('cefVersion', e.target.value)}
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">格式模板</h2>
          <p className="text-sm text-text-secondary mt-1">配置日志解析格式，支持JSON、Grok、正则等多种解析方式</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} /> 新建模板
        </button>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <motion.button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              whileHover={{ scale: 1.02 }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive ? `bg-gradient-to-r ${cat.color} text-white shadow-lg` : 'bg-card-bg border border-border-color text-text-secondary'
              }`}
            >
              <Icon size={16} />
              {cat.name}
            </motion.button>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索模板..."
            className="w-full pl-10 pr-4 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredTemplates.map((template, index) => {
          const parserInfo = getParserType(template.parserType);
          return (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
              whileHover={{ x: 4 }}
              className="flex items-center gap-4 p-4 bg-card-bg border border-border-color rounded-xl hover:border-primary/30 transition-all cursor-pointer group"
              onClick={() => openDetail(template)}
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${parserInfo.color} flex items-center justify-center shadow-lg flex-shrink-0`}>
                <FileJson className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-text-primary">{template.name}</h3>
                  {template.isPreset && <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-600 rounded-full font-medium">预设</span>}
                  <span className={`px-2 py-0.5 text-xs rounded font-medium bg-gradient-to-r ${parserInfo.color} text-white`}>{parserInfo.name}</span>
                </div>
                <p className="text-xs text-text-secondary mt-0.5">{template.description}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-text-muted">{(template.fields || []).length} 字段</span>
                  <div className="flex flex-wrap gap-1">
                    {(template.fields || []).slice(0, 3).map((f: any, i: number) => (
                      <span key={i} className="px-1.5 py-0.5 text-[10px] bg-page-bg border border-border-color rounded text-text-secondary">{f.name}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDuplicate(template); }}
                  className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10 transition-colors"
                  title="复制模板"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); openEdit(template); }}
                  className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10 transition-colors"
                  title="编辑模板"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); confirmDelete(String(template.id)); }}
                  className="p-1.5 text-text-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  title="删除模板"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl w-full max-w-4xl max-h-[90vh] overflow-auto shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sticky top-0 bg-card-bg border-b border-border-color p-6 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">{isEditing ? '编辑模板' : '新建格式模板'}</h2>
                </div>
                <button onClick={() => setShowAddModal(false)} className="p-2 text-text-muted hover:text-text-secondary rounded-lg hover:bg-page-bg">
                  <X size={20} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-border-color">
                <button
                  onClick={() => setActiveTab('config')}
                  className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'config' ? 'text-primary border-b-2 border-primary' : 'text-text-secondary'
                  }`}
                >
                  <Settings size={16} /> 配置
                </button>
                <button
                  onClick={() => setActiveTab('fields')}
                  className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'fields' ? 'text-primary border-b-2 border-primary' : 'text-text-secondary'
                  }`}
                >
                  <TestTube size={16} /> 字段管理
                  {detectedFields.length > 0 && (
                    <span className="ml-1 px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
                      {detectedFields.filter(f => f.selected).length}/{detectedFields.length}
                    </span>
                  )}
                </button>
              </div>

              <div className="p-6">
                {activeTab === 'config' ? (
                  <div className="space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">模板名称</label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={e => setFormData({ ...formData, name: e.target.value })}
                          className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">分类</label>
                        <select
                          value={formData.category}
                          onChange={e => setFormData({ ...formData, category: e.target.value })}
                          className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                        >
                          {categories.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Parser Type */}
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-2">解析方式</label>
                      <div className="grid grid-cols-7 gap-2">
                        {parserTypes.map(parser => {
                          const Icon = parser.icon;
                          const isSelected = formData.parserType === parser.id;
                          return (
                            <button
                              key={parser.id}
                              onClick={() => {
                                setFormData({
                                  ...formData,
                                  parserType: parser.id,
                                  parserConfig: initParserConfig(parser.id)
                                });
                              }}
                              className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                                isSelected ? `border-transparent bg-gradient-to-r ${parser.color} text-white` : 'border-border-color'
                              }`}
                            >
                              <Icon size={18} />
                              <span className="text-xs font-medium">{parser.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Parser Config */}
                    {renderParserConfig()}

                    {/* Sample Data & Test */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <label className="block text-sm font-medium text-text-primary">样本数据 & 测试</label>
                        <button
                          onClick={handleTest}
                          disabled={!formData.sample?.trim() || isTesting}
                          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-50 hover:bg-primary-hover transition-colors"
                        >
                          {isTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                          运行测试
                        </button>
                      </div>
                      <textarea
                        value={formData.sample}
                        onChange={e => setFormData({ ...formData, sample: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono text-emerald-400 h-24 resize-none"
                        placeholder="粘贴日志样本，点击运行测试识别字段..."
                      />
                      <p className="text-xs text-text-secondary mt-2">输入样本日志后点击"运行测试"，系统将自动识别字段并跳转到字段管理页面</p>
                    </div>

                    {/* Configured Fields */}
                    {formData.fields.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <label className="block text-sm font-medium text-text-primary">已配置字段 ({formData.fields.length})</label>
                          <button
                            onClick={() => setFormData({ ...formData, fields: [] })}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            清空字段
                          </button>
                        </div>
                        <div className="bg-card-bg rounded-lg border border-border-color overflow-hidden">
                          {formData.fields.map((field, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-3 border-b border-border-color last:border-b-0">
                              <span className="text-sm font-medium text-text-primary">{field.name}</span>
                              <span className={`px-2 py-0.5 text-xs rounded border ${getTypeColor(field.type)}`}>{field.type}</span>
                              {field.sample && (
                                <span className="text-xs text-text-secondary font-mono flex-1 truncate">{field.sample}</span>
                              )}
                              <button
                                onClick={() => setFormData({ ...formData, fields: formData.fields.filter((_, i) => i !== idx) })}
                                className="p-1 text-text-muted hover:text-red-600"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Field Management Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-text-primary">字段管理</h3>
                        <p className="text-sm text-text-secondary">
                          {detectedFields.length > 0
                            ? `已识别 ${detectedFields.length} 个字段，已选择 ${detectedFields.filter(f => f.selected).length} 个`
                            : '请先运行测试识别字段'}
                        </p>
                      </div>
                      {detectedFields.length > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={selectAllFields}
                            className="px-3 py-1.5 text-xs bg-page-bg text-text-primary rounded-lg hover:bg-primary/10 transition-colors"
                          >
                            全选
                          </button>
                          <button
                            onClick={deselectAllFields}
                            className="px-3 py-1.5 text-xs bg-page-bg text-text-primary rounded-lg hover:bg-primary/10 transition-colors"
                          >
                            清空
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Search & Sort */}
                    {detectedFields.length > 0 && (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                          <input
                            type="text"
                            value={fieldSearchQuery}
                            onChange={e => setFieldSearchQuery(e.target.value)}
                            placeholder="搜索字段名..."
                            className="w-full pl-9 pr-4 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                          />
                        </div>
                        <select
                          value={fieldSortBy}
                          onChange={e => setFieldSortBy(e.target.value as 'name' | 'type')}
                          className="px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                        >
                          <option value="name">按名称排序</option>
                          <option value="type">按类型排序</option>
                        </select>
                      </div>
                    )}

                    {/* Field List */}
                    {detectedFields.length > 0 ? (
                      <div className="space-y-2 max-h-[50vh] overflow-auto pr-1">
                        {detectedFields
                          .filter(field => field.name.toLowerCase().includes(fieldSearchQuery.toLowerCase()))
                          .sort((a, b) => {
                            if (fieldSortBy === 'name') return a.name.localeCompare(b.name);
                            if (fieldSortBy === 'type') return a.type.localeCompare(b.type);
                            return 0;
                          })
                          .map((field, idx) => {
                            const originalIdx = detectedFields.findIndex(f => f.name === field.name);
                            return (
                              <div
                                key={idx}
                                className={`p-4 rounded-lg border transition-all ${
                                  field.selected ? 'bg-primary/10 border-primary/30' : 'bg-card-bg border-border-color'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <button
                                    onClick={() => toggleFieldSelected(originalIdx)}
                                    className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center transition-colors ${
                                      field.selected ? 'bg-primary text-white' : 'border-2 border-border-color-hover hover:border-primary/40'
                                    }`}
                                  >
                                    {field.selected && <CheckCircle className="w-3.5 h-3.5" />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="text-sm font-semibold text-text-primary">{field.name}</span>
                                      <span className={`px-2 py-0.5 text-xs rounded ${getTypeColor(field.type)}`}>{field.type}</span>
                                      <button
                                        onClick={() => copyFieldName(field.name)}
                                        className="p-1 text-text-muted hover:text-primary hover:bg-primary/10 rounded transition-colors"
                                        title="复制字段名"
                                      >
                                        <Copy size={14} />
                                      </button>
                                    </div>
                                    {field.selected && (
                                      <div className="mb-2">
                                        <label className="text-xs text-text-secondary mb-1 block">目标字段名</label>
                                        <input
                                          type="text"
                                          value={field.targetName || field.name}
                                          onChange={e => updateFieldTargetName(originalIdx, e.target.value)}
                                          className="w-full px-2 py-1 text-sm bg-card-bg border border-border-color rounded focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                                          placeholder="输入目标字段名"
                                        />
                                      </div>
                                    )}
                                    <div className="text-xs text-text-secondary font-mono bg-slate-100 p-2 rounded break-all">
                                      {(() => {
                                        const val = String(field.value);
                                        if (val.length > 150) return val.substring(0, 150) + '...';
                                        try {
                                          const parsed = JSON.parse(val);
                                          return JSON.stringify(parsed, null, 2);
                                        } catch {
                                          return val;
                                        }
                                      })()}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-text-muted">
                        <TestTube className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>暂无识别字段</p>
                        <p className="text-sm mt-1">请在"配置"页面输入样本数据并运行测试</p>
                      </div>
                    )}

                    {/* Apply Button */}
                    {detectedFields.length > 0 && (
                      <div className="flex justify-end gap-3 pt-4 border-t border-border-color">
                        <button
                          onClick={() => setActiveTab('config')}
                          className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
                        >
                          返回配置
                        </button>
                        <button
                          onClick={applyDetectedFields}
                          disabled={detectedFields.filter(f => f.selected).length === 0}
                          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          <Save size={16} />
                          应用选中字段 ({detectedFields.filter(f => f.selected).length})
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 bg-card-bg border-t border-border-color p-6 flex justify-end gap-3">
                <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors text-sm font-medium">取消</button>
                <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-primary text-white rounded-lg text-sm flex items-center gap-2 disabled:opacity-50">
                  {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />} {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
