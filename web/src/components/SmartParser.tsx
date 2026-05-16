import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, CheckCircle, XCircle, Sparkles, Braces, FileCode, Table,
  ScrollText, Terminal, AlertTriangle, Code, Wand2, X, Trash2, Edit3, Eye,
  ArrowUp, ArrowDown, Save, AlertCircle, Settings2, Play, Pause,
  Database, Layers, FileJson, Link2, Cpu, Zap, Beaker, Fingerprint,
  GitMerge, Workflow, Search, Copy, ChevronRight,
  RefreshCw, Shield, Activity, Brain, Siren, ShieldCheck,
  Clock, Calendar, FileSearch, BarChart3, Target,
  HardDrive, Upload, Download, ShieldAlert,
  Globe, Lock, Server, Check, LayoutGrid, Filter, Loader2,
  ArrowRight
} from 'lucide-react';
import { logTypesApi, dataSourcesApi, rulesApi, alertFieldsApi, pipelineMappingsApi, pipelinesApi, formatTemplatesApi, storageTablesApi } from '../services/api';

interface ParsePipeline {
  id?: number;
  name: string;
  parserType: string;
  sourceType: string;
  storageTarget: string;
  status?: 'active' | 'paused' | 'stopped';
}

interface LogType {
  id: number;
  name: string;
  category: string;
  description?: string;
}

interface StorageTable {
  id: number;
  name: string;
  columns: number;
  rows: number;
  columnDefs?: Array<{ name: string; label: string; type: string; category: string; required: boolean }>;
}

interface FormatTemplate {
  id: string;
  name: string;
  type: string;
  parserType: string;
  description?: string;
  parserConfig?: any;
  fields: any[];
  fieldCount: number;
  category?: string;
  isPreset?: boolean;
  sample?: string;
}

interface DetectionRule {
  id: number;
  name: string;
  type: string;
  status: string;
}

interface DataSource {
  id: number;
  name: string;
  type: string;
  status: string;
}

// 默认数据
const defaultFormatTemplates: FormatTemplate[] = [];
const defaultLogTypes: LogType[] = [];
const defaultStorageTables: StorageTable[] = [];
const defaultDataSources: DataSource[] = [];
const defaultDetectionRules: DetectionRule[] = [];

const parserTypes = [
  { id: 'json', name: 'JSON', icon: Braces, color: 'from-primary to-indigo-600', bgColor: 'bg-primary/10', textColor: 'text-primary', borderColor: 'border-primary/20', desc: 'JSON结构化数据解析' },
  { id: 'xml', name: 'XML', icon: FileCode, color: 'from-amber-500 to-orange-500', bgColor: 'bg-amber-50', textColor: 'text-amber-600', borderColor: 'border-amber-200', desc: 'XML标记语言解析' },
  { id: 'csv', name: 'CSV', icon: Table, color: 'from-green-500 to-emerald-500', bgColor: 'bg-green-50', textColor: 'text-green-600', borderColor: 'border-green-200', desc: 'CSV表格数据解析' },
  { id: 'logfmt', name: 'Logfmt', icon: ScrollText, color: 'from-cyan-500 to-blue-500', bgColor: 'bg-cyan-50', textColor: 'text-cyan-600', borderColor: 'border-cyan-200', desc: 'Key=Value格式解析' },
  { id: 'syslog', name: 'Syslog', icon: Terminal, color: 'from-purple-500 to-violet-500', bgColor: 'bg-purple-50', textColor: 'text-purple-600', borderColor: 'border-purple-200', desc: 'Syslog标准格式解析' },
  { id: 'cef', name: 'CEF', icon: AlertTriangle, color: 'from-red-500 to-orange-500', bgColor: 'bg-red-50', textColor: 'text-red-600', borderColor: 'border-red-200', desc: 'CEF通用事件格式解析' },
  { id: 'grok', name: 'Grok', icon: Code, color: 'from-primary to-purple-500', bgColor: 'bg-primary/10', textColor: 'text-primary', borderColor: 'border-primary/20', desc: 'Grok模式匹配解析' },
  { id: 'regex', name: 'Regex', icon: Fingerprint, color: 'from-orange-500 to-amber-500', bgColor: 'bg-orange-50', textColor: 'text-orange-600', borderColor: 'border-orange-200', desc: '正则表达式解析' },
  { id: 'auto', name: 'Auto', icon: Wand2, color: 'from-primary/50 to-purple-500', bgColor: 'bg-primary/5', textColor: 'text-primary', borderColor: 'border-primary/10', desc: '自动识别格式解析' }
];


const severityConfig: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: '危急' },
  high: { color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', label: '高危' },
  medium: { color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: '中危' },
  low: { color: 'text-primary', bg: 'bg-primary/10 border-primary/20', label: '低危' }
};

const defaultPipelines: ParsePipeline[] = [
  { id: 'p1', name: 'JSON标准解析', priority: 1, parser: 'json', isActive: true, description: '标准JSON格式日志解析', fieldMappings: [{ sourceField: 'timestamp', targetField: 'ts', type: 'datetime' }], logTypeId: 'lt-003', logTypeName: '应用日志', storageTableId: 'st-001', storageTableName: 'alert_logs', mode: 'single', formatTemplateId: 'tpl-json', formatTemplateName: '通用JSON' },
  { id: 'p2', name: 'Syslog RFC5424', priority: 2, parser: 'syslog', isActive: true, description: 'Syslog RFC5424格式', logTypeId: 'lt-002', logTypeName: '系统日志', storageTableId: 'st-002', storageTableName: 'security_events', mode: 'single', formatTemplateId: 'tpl-syslog', formatTemplateName: 'Syslog RFC5424' },
  { id: 'p3', name: 'CEF安全事件', priority: 3, parser: 'cef', isActive: true, description: 'ArcSight CEF格式', logTypeId: 'lt-001', logTypeName: '安全日志', storageTableId: 'st-001', storageTableName: 'alert_logs', mode: 'single', formatTemplateId: 'tpl-cef', formatTemplateName: 'CEF标准格式' },
  { id: 'p4', name: 'Grok自定义', priority: 4, parser: 'grok', isActive: false, description: '自定义Grok模式', mode: 'single' },
  { id: 'p5', name: '智能识别', priority: 5, parser: 'auto', isActive: true, description: '自动识别格式', mode: 'multi', smartDetect: true }
];

const generateSecurityEvent = (rule: DetectionRule, logData: Record<string, any>): SecurityEvent => {
  const severities: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
    'RULE-001': 'high',
    'RULE-002': 'critical',
    'RULE-003': 'critical',
    'RULE-004': 'medium',
    'RULE-005': 'high'
  };

  return {
    id: `EVT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    title: `${rule.name} - 实时检测`,
    severity: severities[rule.id] || 'medium',
    confidence: Math.floor(Math.random() * 15) + 85,
    affectedAssets: logData.hostname ? [logData.hostname] : logData.server ? [logData.server] : ['unknown'],
    sourceIp: logData.source_ip || logData.client_ip || logData.src_ip || 'unknown',
    timestamp: new Date().toISOString(),
    status: 'new',
    eventType: '实时检测',
    description: `规则「${rule.name}」检测到异常行为: ${rule.description}`,
    ruleId: rule.id,
    rawLog: logData
  };
};

const getParserConfig = (parserId: string) => parserTypes.find(p => p.id === parserId) || parserTypes[0];

// ==================== 安全告警标准字段映射表 ====================
// 将原始日志中的常见字段名 映射为 TimescaleDB 告警表标准字段名 (snake_case)
// 映射后的字段存入 DB 后，SecurityAlerts.tsx 的 fetchAlerts 会再次做 camelCase 转换

interface FieldMappingRule {
  targetField: string;       // 目标标准字段名 (DB 列名, snake_case)
  displayLabel: string;      // 中文标签
  priority: number;          // 优先级 (越小越优先，用于多源匹配)
  isRequired: boolean;       // 是否告警必需字段 (自动选中)
  category: string;          // 字段分类
}

// 原始字段名 → 映射规则 (支持模糊匹配)
const SECURITY_FIELD_MAP: Record<string, FieldMappingRule[]> = {
  // ====== 时间类 ======
  'timestamp':        [{ targetField: 'timestamp',   displayLabel: '事件时间',    priority: 1, isRequired: true,  category: '时间' }],
  '@timestamp':       [{ targetField: 'timestamp',   displayLabel: '事件时间',    priority: 1, isRequired: true,  category: '时间' }],
  'time':             [{ targetField: 'timestamp',   displayLabel: '事件时间',    priority: 2, isRequired: true,  category: '时间' }],
  'log_time':         [{ targetField: 'timestamp',   displayLabel: '事件时间',    priority: 3, isRequired: true,  category: '时间' }],
  'event_time':       [{ targetField: 'timestamp',   displayLabel: '事件时间',    priority: 3, isRequired: true,  category: '时间' }],
  'created_at':       [{ targetField: 'created_at',  displayLabel: '创建时间',    priority: 4, isRequired: false, category: '时间' }],

  // ====== 源IP / 来源地址 (最高优先级) ======
  'src_ip':           [{ targetField: 'src_ip',      displayLabel: '源地址',      priority: 1, isRequired: true,  category: '网络-五元组' }],
  'source_ip':        [{ targetField: 'src_ip',      displayLabel: '源地址',      priority: 2, isRequired: true,  category: '网络-五元组' }],
  'client_ip':        [{ targetField: 'src_ip',      displayLabel: '源地址',      priority: 3, isRequired: true,  category: '网络-五元组' }],
  'remote_ip':        [{ targetField: 'src_ip',      displayLabel: '源地址',      priority: 4, isRequired: true,  category: '网络-五元组' }],
  'ip':               [{ targetField: 'src_ip',      displayLabel: '源地址',      priority: 5, isRequired: true,  category: '网络-五元组' }],
  'src_address':      [{ targetField: 'src_ip',      displayLabel: '源地址',      priority: 6, isRequired: true,  category: '网络-五元组' }],
  'source_address':   [{ targetField: 'src_ip',      displayLabel: '源地址',      priority: 7, isRequired: true,  category: '网络-五元组' }],

  // ====== 源端口 ======
  'src_port':         [{ targetField: 'src_port',    displayLabel: '源端口',      priority: 1, isRequired: false, category: '网络-五元组' }],
  'source_port':      [{ targetField: 'src_port',    displayLabel: '源端口',      priority: 2, isRequired: false, category: '网络-五元组' }],
  'client_port':      [{ targetField: 'src_port',    displayLabel: '源端口',      priority: 3, isRequired: false, category: '网络-五元组' }],
  'remote_port':      [{ targetField: 'src_port',    displayLabel: '源端口',      priority: 4, isRequired: false, category: '网络-五元组' }],
  'sport':            [{ targetField: 'src_port',    displayLabel: '源端口',      priority: 5, isRequired: false, category: '网络-五元组' }],

  // ====== 目标IP / 目的地址 ======
  'dst_ip':           [{ targetField: 'dst_ip',      displayLabel: '目标地址',    priority: 1, isRequired: true,  category: '网络-五元组' }],
  'dest_ip':          [{ targetField: 'dst_ip',      displayLabel: '目标地址',    priority: 2, isRequired: true,  category: '网络-五元组' }],
  'destination_ip':   [{ targetField: 'dst_ip',      displayLabel: '目标地址',    priority: 3, isRequired: true,  category: '网络-五元组' }],
  'server_ip':        [{ targetField: 'dst_ip',      displayLabel: '目标地址',    priority: 4, isRequired: true,  category: '网络-五元组' }],
  'target_ip':        [{ targetField: 'dst_ip',      displayLabel: '目标地址',    priority: 5, isRequired: true,  category: '网络-五元组' }],
  'dst_address':      [{ targetField: 'dst_ip',      displayLabel: '目标地址',    priority: 6, isRequired: true,  category: '网络-五元组' }],
  'local_ip':         [{ targetField: 'dst_ip',      displayLabel: '目标地址',    priority: 7, isRequired: true,  category: '网络-五元组' }],

  // ====== 目标端口 ======
  'dst_port':         [{ targetField: 'dst_port',    displayLabel: '目标端口',    priority: 1, isRequired: false, category: '网络-五元组' }],
  'dest_port':        [{ targetField: 'dst_port',    displayLabel: '目标端口',    priority: 2, isRequired: false, category: '网络-五元组' }],
  'destination_port':[{ targetField: 'dst_port',    displayLabel: '目标端口',    priority: 3, isRequired: false, category: '网络-五元组' }],
  'server_port':      [{ targetField: 'dst_port',    displayLabel: '目标端口',    priority: 4, isRequired: false, category: '网络-五元组' }],
  'target_port':      [{ targetField: 'dst_port',    displayLabel: '目标端口',    priority: 5, isRequired: false, category: '网络-五元组' }],
  'dport':            [{ targetField: 'dst_port',    displayLabel: '目标端口',    priority: 6, isRequired: false, category: '网络-五元组' }],
  'port':             [{ targetField: 'dst_port',    displayLabel: '目标端口',    priority: 7, isRequired: false, category: '网络-五元组' }],

  // ====== 协议 ======
  'protocol':         [{ targetField: 'protocol',    displayLabel: '协议',        priority: 1, isRequired: false, category: '网络-五元组' }],
  'proto':            [{ targetField: 'protocol',    displayLabel: '协议',        priority: 2, isRequired: false, category: '网络-五元组' }],
  'transport':        [{ targetField: 'protocol',    displayLabel: '协议',        priority: 3, isRequired: false, category: '网络-五元组' }],

  // ====== 严重度 (核心) ======
  'severity':         [{ targetField: 'severity',    displayLabel: '严重程度',    priority: 1, isRequired: true,  category: '告警属性' }],
  'severity_level':   [{ targetField: 'severity',    displayLabel: '严重程度',    priority: 2, isRequired: true,  category: '告警属性' }],
  'severity_id':      [{ targetField: 'severity',    displayLabel: '严重程度',    priority: 3, isRequired: true,  category: '告警属性' }],
  'level':            [{ targetField: 'severity',    displayLabel: '严重程度',    priority: 4, isRequired: true,  category: '告警属性' }],
  'priority':         [{ targetField: 'severity',    displayLabel: '严重程度',    priority: 5, isRequired: true,  category: '告警属性' }],

  // ====== 动作 (allow/block/drop) ======
  'action':           [{ targetField: 'action',      displayLabel: '处置动作',    priority: 1, isRequired: false, category: '告警属性' }],
  'act':              [{ targetField: 'action',      displayLabel: '处置动作',    priority: 2, isRequired: false, category: '告警属性' }],

  // ====== 告警标题 / 名称 ======
  'title':            [{ targetField: 'title',       displayLabel: '告警标题',    priority: 1, isRequired: true,  category: '告警属性' }],
  'alert_name':       [{ targetField: 'title',       displayLabel: '告警标题',    priority: 2, isRequired: true,  category: '告警属性' }],
  'event_name':       [{ targetField: 'title',       displayLabel: '告警标题',    priority: 3, isRequired: true,  category: '告警属性' }],
  'rule_name':        [{ targetField: 'title',       displayLabel: '告警标题',    priority: 4, isRequired: true,  category: '告警属性' }],
  'name':             [{ targetField: 'title',       displayLabel: '告警标题',    priority: 5, isRequired: true,  category: '告警属性' }],

  // ====== 描述 ======
  'description':      [{ targetField: 'description', displayLabel: '描述',        priority: 1, isRequired: false, category: '告警属性' }],
  'desc':             [{ targetField: 'description', displayLabel: '描述',        priority: 2, isRequired: false, category: '告警属性' }],
  'message':          [{ targetField: 'description', displayLabel: '描述',        priority: 3, isRequired: false, category: '告警属性' }],
  'msg':              [{ targetField: 'description', displayLabel: '描述',        priority: 4, isRequired: false, category: '告警属性' }],
  'detail':           [{ targetField: 'description', displayLabel: '描述',        priority: 5, isRequired: false, category: '告警属性' }],

  // ====== 数据源产品类型 ======
  'product':          [{ targetField: 'source_product', displayLabel: '数据源产品', priority: 1, isRequired: true,  category: '数据源' }],
  'vendor':           [{ targetField: 'vendor',      displayLabel: '厂商',        priority: 2, isRequired: false, category: '数据源' }],
  'device_vendor':    [{ targetField: 'vendor',      displayLabel: '厂商',        priority: 3, isRequired: false, category: '数据源' }],
  'source':           [{ targetField: 'source_product', displayLabel: '数据源产品', priority: 4, isRequired: true,  category: '数据源' }],
  'log_type':         [{ targetField: 'log_type',    displayLabel: '日志类型',    priority: 1, isRequired: false, category: '数据源' }],
  'type':             [{ targetField: 'category',    displayLabel: '分类',        priority: 5, isRequired: false, category: '告警属性' }],
  'event_type':       [{ targetField: 'category',    displayLabel: '分类',        priority: 1, isRequired: false, category: '告警属性' }],
  'category':         [{ targetField: 'category',    displayLabel: '分类',        priority: 2, isRequired: false, category: '告警属性' }],

  // ====== 规则ID / 签名 ======
  'rule_id':          [{ targetField: 'rule_id',     displayLabel: '规则ID',      priority: 1, isRequired: false, category: '检测规则' }],
  'attack_rule_id':   [{ targetField: 'rule_id',     displayLabel: '规则ID',      priority: 2, isRequired: false, category: '检测规则' }],
  'signature_id':     [{ targetField: 'rule_id',     displayLabel: '规则ID',      priority: 3, isRequired: false, category: '检测规则' }],
  'signature':        [{ targetField: 'rule_id',     displayLabel: '规则ID',      priority: 4, isRequired: false, category: '检测规则' }],
  'alert_id':         [{ targetField: 'alert_code',  displayLabel: '告警编码',    priority: 1, isRequired: false, category: '检测规则' }],
  'log_id':           [{ targetField: 'alert_code',  displayLabel: '告警编码',    priority: 2, isRequired: false, category: '检测规则' }],
  'id':               [{ targetField: 'alert_code',  displayLabel: '告警编码',    priority: 3, isRequired: false, category: '检测规则' }],

  // ====== HTTP 请求信息 ======
  'method':           [{ targetField: 'method',      displayLabel: '请求方法',    priority: 1, isRequired: false, category: 'HTTP请求' }],
  'http_method':      [{ targetField: 'method',      displayLabel: '请求方法',    priority: 2, isRequired: false, category: 'HTTP请求' }],
  'request_method':   [{ targetField: 'method',      displayLabel: '请求方法',    priority: 3, isRequired: false, category: 'HTTP请求' }],
  'url':              [{ targetField: 'url',         displayLabel: '请求URL',     priority: 1, isRequired: false, category: 'HTTP请求' }],
  'uri':              [{ targetField: 'url',         displayLabel: '请求URL',     priority: 2, isRequired: false, category: 'HTTP请求' }],
  'request_uri':      [{ targetField: 'url',         displayLabel: '请求URL',     priority: 3, isRequired: false, category: 'HTTP请求' }],
  'path':             [{ targetField: 'url',         displayLabel: '请求URL',     priority: 4, isRequired: false, category: 'HTTP请求' }],
  'user_agent':       [{ targetField: 'user_agent',  displayLabel: '用户代理',    priority: 1, isRequired: false, category: 'HTTP请求' }],
  'ua':               [{ targetField: 'user_agent',  displayLabel: '用户代理',    priority: 2, isRequired: false, category: 'HTTP请求' }],
  'http_user_agent':  [{ targetField: 'user_agent',  displayLabel: '用户代理',    priority: 3, isRequired: false, category: 'HTTP请求' }],
  'response_code':    [{ targetField: 'response_code',displayLabel: '响应状态码',  priority: 1, isRequired: false, category: 'HTTP请求' }],
  'status_code':      [{ targetField: 'response_code',displayLabel: '响应状态码',  priority: 2, isRequired: false, category: 'HTTP请求' }],
  'http_status':      [{ targetField: 'response_code',displayLabel: '响应状态码',  priority: 3, isRequired: false, category: 'HTTP请求' }],
  'response_time':    [{ targetField: 'response_time',displayLabel: '响应时间(ms)',priority: 1, isRequired: false, category: 'HTTP请求' }],

  // ====== 主机 / 资产 ======
  'hostname':         [{ targetField: 'hostname',    displayLabel: '主机名',      priority: 1, isRequired: false, category: '资产' }],
  'host':             [{ targetField: 'hostname',    displayLabel: '主机名',      priority: 2, isRequired: false, category: '资产' }],
  'server_name':      [{ targetField: 'hostname',    displayLabel: '主机名',      priority: 3, isRequired: false, category: '资产' }],
  'computer':         [{ targetField: 'hostname',    displayLabel: '主机名',      priority: 4, isRequired: false, category: '资产' }],
  'device_name':      [{ targetField: 'hostname',    displayLabel: '主机名',      priority: 5, isRequired: false, category: '资产' }],
  'affected_asset':   [{ targetField: 'hostname',    displayLabel: '受影响资产',  priority: 6, isRequired: false, category: '资产' }],

  // ====== 地理位置 ======
  'src_location':     [{ targetField: 'src_location', displayLabel: '来源地',      priority: 1, isRequired: false, category: '地理' }],
  'country':          [{ targetField: 'country',     displayLabel: '国家',        priority: 1, isRequired: false, category: '地理' }],
  'city':             [{ targetField: 'city',        displayLabel: '城市',        priority: 2, isRequired: false, category: '地理' }],
  'geo_location':     [{ targetField: 'src_location', displayLabel: '来源地',      priority: 2, isRequired: false, category: '地理' }],

  // ====== 用户身份 ======
  'username':         [{ targetField: 'username',    displayLabel: '用户名',      priority: 1, isRequired: false, category: '身份' }],
  'user':             [{ targetField: 'username',    displayLabel: '用户名',      priority: 2, isRequired: false, category: '身份' }],
  'account':          [{ targetField: 'username',    displayLabel: '用户名',      priority: 3, isRequired: false, category: '身份' }],

  // ====== 进程信息 ======
  'process_name':     [{ targetField: 'process_name',displayLabel: '进程名',      priority: 1, isRequired: false, category: '进程' }],
  'process':          [{ targetField: 'process_name',displayLabel: '进程名',      priority: 2, isRequired: false, category: '进程' }],
  'pid':              [{ targetField: 'pid',         displayLabel: '进程PID',     priority: 1, isRequired: false, category: '进程' }],
  'process_id':       [{ targetField: 'pid',         displayLabel: '进程PID',     priority: 2, isRequired: false, category: '进程' }],
};

/**
 * 智能字段映射：将原始日志字段名映射为安全告警标准字段
 * 使用从数据库加载的动态字段定义（standardFields），替代硬编码映射表
 *
 * @param rawFields parseWithConfig 返回的原始字段列表
 * @param stdFieldDefs 从 API 加载的标准字段定义列表（每项含 name/aliases/category/required）
 * @returns 带映射信息的增强字段列表（含 fieldRole: 'standard' | 'extra'）
 */
const applySecurityFieldMapping = (
  rawFields: Array<{name: string; type: string; value: any}>,
  stdFieldDefs?: Array<{ name: string; label: string; type: string; category: string; required: boolean; aliases?: string[]; default_value?: string }>
): ParsedAlertField[] => {

  // 构建动态匹配表：别名/name → 标准字段定义
  const aliasMap = new Map<string, { targetField: string; label: string; category: string; required: boolean; default_value?: string }>();

  if (stdFieldDefs && stdFieldDefs.length > 0) {
    for (const sf of stdFieldDefs) {
      // 字段本身作为精确匹配键
      aliasMap.set(sf.name.toLowerCase(), { targetField: sf.name, label: sf.label, category: sf.category, required: sf.required, default_value: sf.default_value });
      // 所有别名也加入
      if (sf.aliases) {
        for (const a of sf.aliases) {
          if (!aliasMap.has(a.toLowerCase())) { // 别名不覆盖精确匹配
            aliasMap.set(a.toLowerCase(), { targetField: sf.name, label: sf.label, category: sf.category, required: sf.required, default_value: sf.default_value });
          }
        }
      }
    }
  }

  const usedTargets = new Set<string>(); // 已使用的目标字段（防重复）

  return rawFields.map(field => {
    const fieldNameLower = field.name.toLowerCase();

    // 1. 精确匹配（name 或 db_column）
    let rule = aliasMap.get(fieldNameLower);

    // 2. 包含匹配（如 headers.user-agent → user_agent / client_ip）
    if (!rule) {
      for (const [aliasKey, val] of aliasMap.entries()) {
        if (fieldNameLower.includes(aliasKey) || aliasKey.includes(fieldNameLower)) {
          rule = val;
          break;
        }
      }
    }

    if (rule && !usedTargets.has(rule.targetField)) {
      usedTargets.add(rule.targetField);
      return {
        ...field,
        selected: rule.required,
        targetName: rule.targetField,
        mappingLabel: rule.label,
        mappingCategory: rule.category,
        isKeyField: rule.required,
        fieldRole: 'standard',
        defaultValue: rule.default_value,
      };
    }

    // 未映射的字段 → 归为额外数据（存入 parsedData / raw_log）
    return {
      ...field,
      selected: false,
      targetName: field.name,
      mappingLabel: undefined,
      mappingCategory: undefined,
      isKeyField: false,
      fieldRole: 'extra',
    };
  });
};

// ==================== 简化字段类型 ====================
// 只区分两种角色：标准告警字段（匹配后写入DB告警表）vs 额外字段（存入parsedData/raw_log）
interface ParsedAlertField {
  name: string;
  type: string;
  value: any;
  selected: boolean;
  targetName?: string;          // 映射后的DB列名
  mappingLabel?: string;        // 中文标签 (如"源地址")
  mappingCategory?: string;     // 分类 (如"网络-五元组")
  isKeyField?: boolean;         // 是否告警关键字段
  fieldRole: 'standard' | 'extra';  // 核心区分：标准字段 vs 额外数据
  defaultValue?: string;        // 默认值（当原始日志中无该字段时使用）
}

// ==================== 字段映射接口 ====================
interface FieldMapping {
  id?: number;
  targetField: string;          // 目标标准字段名
  targetLabel: string;          // 目标字段中文标签
  sourceField: string | null;   // 源字段名 (null表示未映射)
  fieldType: string;            // 字段类型
  defaultValue?: string;        // 默认值
  isRequired: boolean;          // 是否必填
  sampleValue?: any;            // 样本值
}

// ==================== 映射建议接口 ====================
interface MappingSuggestion {
  target_field: string;
  label: string;
  category: string;
  required: boolean;
  aliases: string[];
  suggested_source_names: string[];
}

/**
 * 获取所有标准告警字段的定义（用于UI展示参考和映射匹配）
 */
export const STANDARD_ALERT_FIELDS = [
  { name: 'timestamp',     label: '事件时间',   type: 'datetime', category: '时间',       required: true },
  { name: 'src_ip',        label: '源地址',     type: 'string',   category: '网络-五元组', required: true },
  { name: 'src_port',      label: '源端口',     type: 'number',   category: '网络-五元组', required: false },
  { name: 'dst_ip',        label: '目标地址',   type: 'string',   category: '网络-五元组', required: true },
  { name: 'dst_port',      label: '目标端口',   type: 'number',   category: '网络-五元组', required: false },
  { name: 'protocol',      label: '协议',       type: 'string',   category: '网络-五元组', required: false },
  { name: 'severity',      label: '严重程度',   type: 'string',   category: '告警属性',   required: true },
  { name: 'action',        label: '处置动作',   type: 'string',   category: '告警属性',   required: false },
  { name: 'title',         label: '告警标题',   type: 'string',   category: '告警属性',   required: true },
  { name: 'description',   label: '描述',       type: 'string',   category: '告警属性',   required: false },
  { name: 'source_product',label: '数据源产品', type: 'string',   category: '数据源',     required: true },
  { name: 'category',      label: '分类',       type: 'string',   category: '告警属性',   required: false },
  { name: 'rule_id',       label: '规则ID',     type: 'string',   category: '检测规则',   required: false },
  { name: 'alert_code',    label: '告警编码',   type: 'string',   category: '检测规则',   required: false },
  { name: 'method',        label: '请求方法',   type: 'string',   category: 'HTTP请求',   required: false },
  { name: 'url',           label: '请求URL',    type: 'string',   category: 'HTTP请求',   required: false },
  { name: 'user_agent',    label: '用户代理',   type: 'string',   category: 'HTTP请求',   required: false },
  { name: 'response_code', label: '响应状态码', type: 'number',   category: 'HTTP请求',   required: false },
  { name: 'hostname',      label: '主机名',     type: 'string',   category: '资产',       required: false },
  { name: 'username',      label: '用户名',     type: 'string',   category: '身份',       required: false },
  { name: 'raw_log',       label: '原始日志',   type: 'string',   category: '原始数据',   required: true },
];

const parseWithConfig = (sample: string, parserType: string, config?: any): Array<{name: string; type: string; value: any}> => {
  if (!sample.trim()) return [];
  const fields: Array<{name: string; type: string; value: any}> = [];

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

const SYSTEM_FIELD_NAMES = new Set([
  'id', 'alert_code', 'event_code', 'status', 'source', 'source_type',
  'confidence', 'asset_id', 'asset_name', 'affected_assets', 'event_ids',
  'assigned_to', 'parsed_data', 'extra_data', 'tags',
  'first_seen', 'last_seen', 'created_at', 'updated_at',
]);

const isMappableField = (fieldName: string): boolean => !SYSTEM_FIELD_NAMES.has(fieldName);

export default function SmartParser() {
  const [pipelines, setPipelines] = useState<ParsePipeline[]>([]);
  const [formatTemplates, setFormatTemplates] = useState<FormatTemplate[]>([]);
  const [logTypes, setLogTypes] = useState<LogType[]>([]);
  const [storageTables, setStorageTables] = useState<StorageTable[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [detectionRules, setDetectionRules] = useState<DetectionRule[]>([]);
  const [loading, setLoading] = useState(true);

  // 从数据库加载的标准告警字段定义（替代硬编码 STANDARD_ALERT_FIELDS）
  const [standardFields, setStandardFields] = useState<Array<{
    id?: number; name: string; label: string; type: string; category: string;
    required: boolean; aliases?: string[]; db_column?: string; default_value?: string;
  }>>([]);

  const [activeFilter, setActiveFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<ParsePipeline | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<ParsePipeline | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState<ParsePipeline | null>(null);

  const [activeTab, setActiveTab] = useState<'basic' | 'parse' | 'analysis' | 'filter'>('basic');

  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [templateCategory, setTemplateCategory] = useState('all');

  // 字段映射相关状态
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [parsedFields, setParsedFields] = useState<Array<{name: string; type: string; value: any}>>([]);
  const [mappingSuggestions, setMappingSuggestions] = useState<MappingSuggestion[]>([]);
  const [savingMappings, setSavingMappings] = useState(false);

  // 从API获取数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [logTypesRes, dataSourcesRes, rulesRes, fieldsRes, pipelinesRes, formatsRes, storageRes] = await Promise.allSettled([
          logTypesApi.getLogTypes({ page_size: 100 }),
          dataSourcesApi.getDataSources({ page_size: 100 }),
          rulesApi.getRules({ page_size: 100 }),
          alertFieldsApi.getFields(),
          pipelinesApi.getPipelines({ page_size: 100 }),
          formatTemplatesApi.getFormats({ page_size: 100 }),
          storageTablesApi.getTables(),
        ]);

        if (logTypesRes.status === 'fulfilled' && logTypesRes.value.success) {
          const items = Array.isArray(logTypesRes.value.data) ? logTypesRes.value.data : logTypesRes.value.data?.items || [];
          setLogTypes(items.map((item: any) => ({
            id: item.id,
            name: item.name || item.type_name,
            category: item.category || 'other',
            description: item.description
          })));
        }

        if (dataSourcesRes.status === 'fulfilled' && dataSourcesRes.value.success) {
          const items = Array.isArray(dataSourcesRes.value.data) ? dataSourcesRes.value.data : dataSourcesRes.value.data?.items || [];
          setDataSources(items.map((item: any) => ({
            id: item.id,
            name: item.name || item.source_name,
            type: item.type || item.source_type,
            status: item.status || 'active'
          })));
        }

        if (rulesRes.status === 'fulfilled' && rulesRes.value.success) {
          const data = rulesRes.value.data;
          const items = Array.isArray(data) ? data : (data?.items || data?.rules || []);
          setDetectionRules(items.map((item: any) => ({
            id: item.id,
            name: item.name || item.rule_name,
            type: item.type || 'custom',
            status: item.status || 'active'
          })));
        }

        // 加载标准告警字段定义（从数据库）
        if (fieldsRes.status === 'fulfilled' && fieldsRes.value.success) {
          const fieldData = fieldsRes.value.data;
          const items = fieldData?.fields || (Array.isArray(fieldData) ? fieldData : []);
          setStandardFields(items);
        } else {
          // API 不可用时使用硬编码兜底（保持向后兼容）
          console.warn('标准字段 API 加载失败，使用本地默认配置');
          setStandardFields(STANDARD_ALERT_FIELDS.map(f => ({ ...f, type: f.type })));
        }

        // 加载管道列表（从数据库）
        if (pipelinesRes.status === 'fulfilled' && pipelinesRes.value?.data) {
          const data = pipelinesRes.value.data;
          const items = Array.isArray(data) ? data : (data?.pipelines || data?.items || []);
          setPipelines(items.map((item: any) => {
            // 规范化 field_mapping: 后端存储为 dict，前端需要 array
            let fieldMappings = item.field_mapping || [];
            if (fieldMappings && !Array.isArray(fieldMappings)) {
              fieldMappings = Object.entries(fieldMappings).map(([targetField, sourceField]) => ({
                targetField,
                sourceField: sourceField as string,
                type: 'string'
              }));
            }
            return {
              id: item.id,
              name: item.name,
              parser: item.input_format || 'json',
              parserType: item.input_format || 'json',
              sourceType: item.source_type || 'pull',
              storageTarget: item.output_target || 'timescaledb',
              status: item.status === 'active' ? 'active' : item.status === 'paused' ? 'paused' : 'stopped',
              priority: item.priority || 1,
              isActive: item.status === 'active',
              description: item.description,
              logTypeId: item.log_type_id,
              logTypeName: item.log_type_name,
              storageTableId: item.output_table_id,
              storageTableName: item.output_table_name,
              formatTemplateId: item.format_id,
              formatTemplateName: item.format_name,
              mode: item.mode || 'single',
              smartDetect: item.smart_detect || false,
              selectedRules: item.selected_rules || [],
              linkedPipelines: item.linked_pipelines || [],
              fieldMappings: fieldMappings,
              filterRules: item.filter_rules || [],
              parserConfig: item.input_config || {}
            };
          }) as any);
        }

        // 加载格式模板
        if (formatsRes.status === 'fulfilled' && formatsRes.value?.data) {
          const data = formatsRes.value.data;
          const items = Array.isArray(data) ? data : (data?.items || data?.formats || []);
          setFormatTemplates(items.map((item: any) => ({
            id: String(item.id),
            name: item.name,
            type: item.type || 'json',
            parserType: item.type || 'json',
            description: item.description || '',
            parserConfig: item.input_config || {},
            fields: Array.isArray(item.fields) ? item.fields : [],
            fieldCount: Array.isArray(item.fields) ? item.fields.length : (item.field_count || 0),
            category: item.log_type_id || 'other',
            isPreset: item.is_system || false,
            sample: item.sample || '',
          })));
        }

        // 加载存储表
        if (storageRes.status === 'fulfilled' && storageRes.value?.data) {
          const data = storageRes.value.data;
          const items = Array.isArray(data) ? data : (data?.items || data?.tables || []);
          setStorageTables(items.map((item: any) => ({
            id: item.id,
            name: item.name || item.displayName || item.display_name,
            columns: Array.isArray(item.columns) ? item.columns.length : (Array.isArray(item.indexes) ? item.indexes.length : 0),
            rows: item.rowCount || item.row_count || 0,
            columnDefs: item.columns || [],
          })));
        }
      } catch (error) {
        console.error('获取数据失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    parser: 'json',
    description: '',
    priority: 1,
    logTypeId: '',
    storageTableId: '',
    formatTemplateId: '',
    mode: 'single' as 'single' | 'multi',
    smartDetect: false,
    parserConfig: {} as any,
    sample: '',
    selectedRules: [] as string[],
    linkedPipelines: [] as string[],
    linkedTemplates: [] as string[],
    templateStorageMap: {} as Record<string, { tableId: string; tableName: string }>,
    filterRules: [] as Array<{ field: string; operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'regex'; value: string; logic: 'and' | 'or' }>
  });

  const [configDetectedFields, setConfigDetectedFields] = useState<ParsedAlertField[]>([]);
  const [isTestingConfig, setIsTestingConfig] = useState(false);


  const [testLog, setTestLog] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [detectedFields, setDetectedFields] = useState<{ name: string; type: string; value: any; mapped: boolean; targetName?: string }[]>([]);

  const [analysisResults, setAnalysisResults] = useState<Array<{
    rule: DetectionRule;
    matched: boolean;
    event?: SecurityEvent;
    severity: string;
  }>>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [generatedEvents, setGeneratedEvents] = useState<SecurityEvent[]>([]);

  const filteredPipelines = useMemo(() => {
    return activeFilter === 'all'
      ? pipelines
      : pipelines.filter(p => p.parser === activeFilter);
  }, [pipelines, activeFilter]);

  const filteredTemplates = useMemo(() => {
    return formatTemplates.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
                           (t.description || '').toLowerCase().includes(templateSearchQuery.toLowerCase());
      const matchesCategory = templateCategory === 'all' || t.category === templateCategory;
      return matchesSearch && matchesCategory;
    });
  }, [templateSearchQuery, templateCategory, formatTemplates]);

  const getParserIcon = useCallback((parser: string) => {
    const found = parserTypes.find(p => p.id === parser);
    return found?.icon || Code;
  }, []);

  const runTestParse = useCallback((sample: string, parser: string, parserConfig: any) => {
    const rawResult = parseWithConfig(sample, parser, parserConfig);
    const fieldsWithMapping = applySecurityFieldMapping(rawResult, standardFields);
    setConfigDetectedFields(fieldsWithMapping);
    updateMappingsFromParsedFields(rawResult);
    return rawResult;
  }, [standardFields, updateMappingsFromParsedFields]);

  const handleSelectTemplate = useCallback((template: FormatTemplate) => {
    const hasSample = template.sample || '';
    setFormData(prev => ({
      ...prev,
      parser: template.parserType,
      formatTemplateId: template.id,
      description: prev.description || template.description || '',
      parserConfig: template.parserConfig || {},
      sample: hasSample || prev.sample,
    }));

    const templateFields = template.fields || [];
    if (templateFields.length > 0) {
      const mappings: FieldMapping[] = templateFields.map((f: any) => ({
        targetField: f.name,
        targetLabel: f.label || f.name,
        sourceField: f.name,
        fieldType: f.type || 'string',
        defaultValue: f.default_value,
        isRequired: f.required || false,
        sampleValue: f.value || f.sample_value || f.sample,
      }));
      setFieldMappings(mappings);
      setConfigDetectedFields(templateFields.map((f: any) => ({
        name: f.name,
        type: f.type || 'string',
        value: f.value || f.sample_value || f.sample || '',
        selected: true,
        targetName: f.name,
        mappingLabel: f.label,
        fieldRole: 'standard' as const,
        defaultValue: f.default_value,
      })));
    } else if (standardFields.length > 0) {
      initializeFieldMappings();
    }

    setShowTemplateSelector(false);

    if (hasSample) {
      setTimeout(() => {
        runTestParse(hasSample, template.parserType, template.parserConfig || {});
        setActiveTab('parse');
      }, 200);
    }
  }, [standardFields, initializeFieldMappings, runTestParse]);

  const handleConfigTest = useCallback(async () => {
    if (!formData.sample.trim()) return;
    setIsTestingConfig(true);
    await new Promise(r => setTimeout(r, 300));
    runTestParse(formData.sample, formData.parser, formData.parserConfig);
    setIsTestingConfig(false);
  }, [formData.sample, formData.parser, formData.parserConfig, runTestParse]);

  const toggleConfigFieldSelected = useCallback((index: number) => {
    setConfigDetectedFields(prev => prev.map((f, i) => i === index ? { ...f, selected: !f.selected } : f));
  }, []);

  const selectAllConfigFields = useCallback(() => {
    setConfigDetectedFields(prev => prev.map(f => ({ ...f, selected: true })));
  }, []);

  const deselectAllConfigFields = useCallback(() => {
    setConfigDetectedFields(prev => prev.map(f => ({ ...f, selected: false })));
  }, []);

  // 更新目标字段名（最终DB列名）
  const updateConfigFieldTargetName = useCallback((index: number, targetName: string) => {
    setConfigDetectedFields(prev => prev.map((f, i) => i === index ? { ...f, targetName } : f));
  }, []);

  // 更新字段默认值
  const updateConfigFieldDefaultValue = useCallback((index: number, defaultValue: string) => {
    setConfigDetectedFields(prev => prev.map((f, i) => i === index ? { ...f, defaultValue } : f));
  }, []);

  // ==================== 字段映射相关函数 ====================

  // 初始化字段映射（基于标准字段）
  const initializeFieldMappings = useCallback(() => {
    if (standardFields.length === 0) return;

    const mappings: FieldMapping[] = standardFields
      .filter(sf => isMappableField(sf.name))
      .map(sf => ({
        targetField: sf.name,
        targetLabel: sf.label,
        sourceField: null,
        fieldType: sf.type,
        defaultValue: sf.default_value,
        isRequired: sf.required,
        sampleValue: undefined
      }));
    setFieldMappings(mappings);
  }, [standardFields]);

  // 当标准字段加载后初始化映射
  useEffect(() => {
    if (standardFields.length > 0 && fieldMappings.length === 0) {
      initializeFieldMappings();
    }
  }, [standardFields, fieldMappings.length, initializeFieldMappings]);

  // 从解析结果更新映射
  const updateMappingsFromParsedFields = useCallback((parsed: Array<{name: string; type: string; value: any}>) => {
    setParsedFields(parsed);
    
    // 自动匹配：尝试将解析字段与标准字段进行匹配
    const updatedMappings = fieldMappings.map(mapping => {
      // 查找是否有匹配的解析字段
      const matchedField = parsed.find(p => 
        p.name.toLowerCase() === mapping.targetField.toLowerCase() ||
        p.name.toLowerCase().includes(mapping.targetField.toLowerCase()) ||
        (mapping.targetField.toLowerCase().includes(p.name.toLowerCase()))
      );
      
      if (matchedField) {
        return {
          ...mapping,
          sourceField: matchedField.name,
          sampleValue: matchedField.value,
          fieldType: matchedField.type
        };
      }
      
      return mapping;
    });
    
    setFieldMappings(updatedMappings);
  }, [fieldMappings]);

  // 更新单个映射的源字段
  const updateMappingSourceField = useCallback((targetField: string, sourceField: string | null) => {
    setFieldMappings(prev => prev.map(m => {
      if (m.targetField === targetField) {
        const parsedField = sourceField ? parsedFields.find(p => p.name === sourceField) : null;
        return {
          ...m,
          sourceField,
          sampleValue: parsedField?.value
        };
      }
      return m;
    }));
  }, [parsedFields]);

  // 目标存储表选择：根据表的列定义初始化字段映射
  const handleTargetTableChange = useCallback((tableId: string) => {
    setFormData(prev => ({ ...prev, storageTableId: tableId }));

    if (!tableId) {
      // 清空选择时恢复默认标准字段
      if (standardFields.length > 0) {
        initializeFieldMappings();
      }
      return;
    }

    const table = storageTables.find(t => String(t.id) === String(tableId));
    if (!table?.columnDefs || table.columnDefs.length === 0) {
      // 表没有列定义时使用标准字段兜底
      if (standardFields.length > 0) {
        initializeFieldMappings();
      }
      return;
    }

    // 用选中表的列定义构建字段映射（排除系统自动生成的字段）
    const mappings: FieldMapping[] = table.columnDefs
      .filter((col: any) => isMappableField(col.name))
      .map((col: any) => ({
        targetField: col.name,
        targetLabel: col.label || col.name,
        sourceField: null,
        fieldType: col.type || 'string',
        defaultValue: col.default_value,
        isRequired: col.required || false,
        sampleValue: undefined,
      }));
    setFieldMappings(mappings);
  }, [storageTables, standardFields, initializeFieldMappings]);

  // 更新映射的默认值
  const updateMappingDefaultValue = useCallback((targetField: string, defaultValue: string) => {
    setFieldMappings(prev => prev.map(m => 
      m.targetField === targetField ? { ...m, defaultValue } : m
    ));
  }, []);

  // 保存字段映射到数据库
  const saveFieldMappingsToDb = useCallback(async (pipelineId: number) => {
    if (!pipelineId) return;
    
    setSavingMappings(true);
    try {
      const mappings = fieldMappings
        .filter(m => m.sourceField !== null)
        .map((m, idx) => ({
          target_field: m.targetField,
          source_field: m.sourceField!,
          field_type: m.fieldType,
          default_value: m.defaultValue,
          is_required: m.isRequired,
          sort_order: idx
        }));
      
      await pipelineMappingsApi.saveMappings(pipelineId, mappings);
      
      // 同时更新管道配置
      await pipelineMappingsApi.updateConfig(pipelineId, {
        parser_type: formData.parser,
        parser_config: formData.parserConfig,
        sample_log: formData.sample,
        filter_rules: formData.filterRules
      });
      
      return true;
    } catch (error) {
      console.error('保存字段映射失败:', error);
      return false;
    } finally {
      setSavingMappings(false);
    }
  }, [fieldMappings, formData]);

  // 加载管道的已有映射
  const loadPipelineMappings = useCallback(async (pipelineId: number) => {
    try {
      const [mappingsRes, suggestionsRes] = await Promise.allSettled([
        pipelineMappingsApi.getMappings(pipelineId),
        pipelineMappingsApi.getSuggestions()
      ]);
      
      if (mappingsRes.status === 'fulfilled' && mappingsRes.value.success) {
        const existingMappings = mappingsRes.value.data?.mappings || [];
        // 用已有映射更新 fieldMappings
        const updatedMappings = fieldMappings.map(m => {
          const existing = existingMappings.find((em: any) => em.target_field === m.targetField);
          if (existing) {
            const parsedField = parsedFields.find(p => p.name === existing.source_field);
            return {
              ...m,
              sourceField: existing.source_field,
              fieldType: existing.field_type || m.fieldType,
              defaultValue: existing.default_value,
              sampleValue: parsedField?.value
            };
          }
          return m;
        });
        setFieldMappings(updatedMappings);
      }
      
      if (suggestionsRes.status === 'fulfilled' && suggestionsRes.value.success) {
        setMappingSuggestions(suggestionsRes.value.data);
      }
    } catch (error) {
      console.error('加载字段映射失败:', error);
    }
  }, [fieldMappings, parsedFields]);

  const runRealTimeAnalysis = useCallback(async (logData: Record<string, any>) => {
    const results: Array<{rule: DetectionRule; matched: boolean; event?: SecurityEvent; severity: string}> = [];
    const events: SecurityEvent[] = [];

    detectionRules.filter(r => r.status === 'enabled').forEach(rule => {
      let isMatch = false;
      let severity = 'medium';

      switch (rule.id) {
        case 'RULE-001':
          isMatch = logData.event_type === 'login' && logData.status === 'failed';
          severity = 'high';
          break;
        case 'RULE-002':
          isMatch = logData.event_type === 'network' && logData.action === 'lateral_movement';
          severity = 'critical';
          break;
        case 'RULE-003':
          isMatch = logData.event_type === 'data_access' && logData.sensitivity === 'high';
          severity = 'critical';
          break;
        case 'RULE-004':
          const hour = new Date().getHours();
          isMatch = logData.event_type === 'login' && (hour < 8 || hour > 20);
          severity = 'medium';
          break;
        case 'RULE-005':
          isMatch = logData.event_type === 'command' && /(rm|del|drop)/i.test(String(logData.command));
          severity = 'high';
          break;
      }

      if (isMatch) {
        const event = generateSecurityEvent(rule, logData);
        events.push(event);
        results.push({ rule, matched: true, event, severity });
      }
    });

    return { results, events };
  }, []);

  const handleAdd = useCallback(async () => {
    if (!formData.name.trim()) {
      alert('请输入管道名称');
      return;
    }

    // 优先使用 fieldMappings（含目标表列定义），其次使用 configDetectedFields
    const selectedFields = fieldMappings.length > 0
      ? fieldMappings.filter(m => m.sourceField !== null).map(m => ({
          sourceField: m.sourceField!,
          targetField: m.targetField,
          type: m.fieldType,
          defaultValue: m.defaultValue,
        }))
      : configDetectedFields.filter(f => f.selected).map(f => ({
          sourceField: f.name,
          targetField: f.targetName || f.name,
          type: f.type,
          defaultValue: f.defaultValue,
        }));

    try {
      const payload = {
        name: formData.name.trim(),
        input_format: formData.parser,
        description: formData.description.trim(),
        priority: formData.priority,
        status: 'active',
        log_type_id: formData.logTypeId || undefined,
        format_id: formData.formatTemplateId || undefined,
        output_table_id: formData.storageTableId || undefined,
        input_config: formData.parserConfig || {},
        field_mapping: selectedFields,
        filter_rules: formData.filterRules || [],
        transform_rules: {},
        output_target: 'timescaledb',
        batch_size: 1000,
        parallel_workers: 1,
        rule_type: formData.mode || 'single',
        match_conditions: formData.smartDetect ? { smart_detect: true } : {},
        next_pipeline_id: formData.linkedPipelines?.[0] || undefined,
      };

      const res = await pipelinesApi.createPipeline(payload);
      if (!res.success) {
        alert(`创建管道失败: ${(res as any).error || '未知错误'}`);
        return;
      }

      const createdId = res.data?.id;

      const newPipeline: any = {
        id: createdId,
        name: formData.name,
        parser: formData.parser,
        parserType: formData.parser,
        sourceType: 'pull',
        storageTarget: 'timescaledb',
        status: 'active',
        priority: formData.priority,
        isActive: true,
        description: formData.description,
        fieldMappings: selectedFields,
        logTypeId: formData.logTypeId,
        logTypeName: logTypes.find(l => l.id === formData.logTypeId)?.name,
        storageTableId: formData.storageTableId,
        storageTableName: storageTables.find(s => s.id === formData.storageTableId)?.name,
        formatTemplateId: formData.formatTemplateId,
        formatTemplateName: formatTemplates.find(f => f.id === formData.formatTemplateId)?.name,
        mode: formData.mode,
        smartDetect: formData.smartDetect,
        selectedRules: formData.selectedRules,
        linkedPipelines: formData.linkedPipelines,
      };
      setPipelines(prev => [...prev, newPipeline]);
      setShowAddModal(false);
      resetForm();
    } catch (error: any) {
      console.error('创建管道失败:', error);
      alert(`创建管道失败: ${error?.message || '请检查后端服务是否正常运行'}`);
    }
  }, [configDetectedFields, fieldMappings, formData, logTypes, storageTables, formatTemplates, resetForm]);

  const resetForm = useCallback(() => {
    setFormData({ name: '', parser: 'json', description: '', priority: pipelines.length + 1, logTypeId: '', storageTableId: '', formatTemplateId: '', mode: 'single', smartDetect: false, parserConfig: {}, sample: '', selectedRules: [], linkedPipelines: [], linkedTemplates: [], templateStorageMap: {}, filterRules: [] });
    setConfigDetectedFields([]);
    setActiveTab('basic');
    setTestLog('');
    setTestResult(null);
    setDetectedFields([]);
    setAnalysisResults([]);
    setGeneratedEvents([]);
    setTemplateSearchQuery('');
    setTemplateCategory('all');
  }, [pipelines.length]);

  const handleEdit = useCallback(async () => {
    if (!editingPipeline || !editingPipeline.id) return;
    if (!formData.name.trim()) {
      alert('请输入管道名称');
      return;
    }

    // 优先使用 fieldMappings（含目标表列定义），其次使用 configDetectedFields
    const selectedFields = fieldMappings.length > 0
      ? fieldMappings.filter(m => m.sourceField !== null).map(m => ({
          sourceField: m.sourceField!,
          targetField: m.targetField,
          type: m.fieldType,
          defaultValue: m.defaultValue,
        }))
      : configDetectedFields.filter(f => f.selected).map(f => ({
          sourceField: f.name,
          targetField: f.targetName || f.name,
          type: f.type,
          defaultValue: f.defaultValue,
        }));

    try {
      const payload = {
        name: formData.name.trim(),
        input_format: formData.parser,
        description: formData.description.trim(),
        priority: formData.priority,
        log_type_id: formData.logTypeId || undefined,
        format_id: formData.formatTemplateId || undefined,
        output_table_id: formData.storageTableId || undefined,
        input_config: formData.parserConfig || {},
        field_mapping: selectedFields,
        filter_rules: formData.filterRules || [],
        output_target: 'timescaledb',
        rule_type: formData.mode || 'single',
        match_conditions: formData.smartDetect ? { smart_detect: true } : {},
        next_pipeline_id: formData.linkedPipelines?.[0] || undefined,
      };

      const res = await pipelinesApi.updatePipeline(editingPipeline.id, payload);
      if (!res.success) {
        alert(`更新管道失败: ${(res as any).error || '未知错误'}`);
        return;
      }

      setPipelines(prev => prev.map(p => p.id === editingPipeline.id ? {
        ...p,
        ...formData,
        fieldMappings: selectedFields,
        logTypeName: logTypes.find(l => l.id === formData.logTypeId)?.name,
        storageTableName: storageTables.find(s => s.id === formData.storageTableId)?.name,
        formatTemplateName: formatTemplates.find(f => f.id === formData.formatTemplateId)?.name
      } : p));
      setEditingPipeline(null);
      setShowAddModal(false);
      resetForm();
    } catch (error: any) {
      console.error('更新管道失败:', error);
      alert(`更新管道失败: ${error?.message || '请检查后端服务是否正常运行'}`);
    }
  }, [editingPipeline, configDetectedFields, fieldMappings, formData, logTypes, storageTables, formatTemplates, resetForm]);

  const handleDelete = useCallback(async () => {
    if (!showDeleteConfirm || !showDeleteConfirm.id) return;
    try {
      try {
        await pipelinesApi.deletePipeline(showDeleteConfirm.id);
      } catch (e) {
        console.warn('Pipeline API delete failed', e);
      }
      setPipelines(prev => prev.filter(p => p.id !== showDeleteConfirm.id));
    } catch (error) {
      console.error('删除管道失败:', error);
    }
    setShowDeleteConfirm(null);
  }, [showDeleteConfirm]);

  const toggleActive = useCallback(async (id: any) => {
    try {
      try {
        await pipelinesApi.togglePipeline(Number(id));
      } catch (e) {
        console.warn('Pipeline API toggle failed', e);
      }
    } catch (error) {
      console.error('切换管道状态失败:', error);
    }
    setPipelines(prev => prev.map(p => p.id === id ? { ...p, isActive: !p.isActive, status: p.isActive ? ('stopped' as any) : ('active' as any) } : p));
  }, []);

  const movePriority = useCallback((id: string, direction: 'up' | 'down') => {
    const index = pipelines.findIndex(p => p.id === id);
    if (direction === 'up' && index > 0) {
      const newPipelines = [...pipelines];
      [newPipelines[index], newPipelines[index - 1]] = [newPipelines[index - 1], newPipelines[index]];
      setPipelines(newPipelines.map((p, i) => ({ ...p, priority: i + 1 })));
    } else if (direction === 'down' && index < pipelines.length - 1) {
      const newPipelines = [...pipelines];
      [newPipelines[index], newPipelines[index + 1]] = [newPipelines[index + 1], newPipelines[index]];
      setPipelines(newPipelines.map((p, i) => ({ ...p, priority: i + 1 })));
    }
  }, [pipelines]);

  const openAdd = useCallback(() => {
    setEditingPipeline(null);
    resetForm();
    setShowAddModal(true);
  }, [resetForm]);

  const openEdit = useCallback((pipeline: ParsePipeline) => {
    setEditingPipeline(pipeline);
    setFormData({
      name: pipeline.name,
      parser: pipeline.parser,
      description: pipeline.description || '',
      priority: pipeline.priority,
      logTypeId: pipeline.logTypeId || '',
      storageTableId: pipeline.storageTableId || '',
      formatTemplateId: pipeline.formatTemplateId || '',
      mode: pipeline.mode || 'single',
      smartDetect: pipeline.smartDetect || false,
      parserConfig: pipeline.parserConfig || {},
      sample: pipeline.sample || '',
      selectedRules: pipeline.selectedRules || [],
      linkedPipelines: pipeline.linkedPipelines || [],
      linkedTemplates: pipeline.linkedTemplates || []
    });
    
    // 规范化 fieldMappings: 后端存为 dict，前端需要 array
    const pipelineFMs = Array.isArray(pipeline.fieldMappings) ? pipeline.fieldMappings : [];
    setConfigDetectedFields(pipelineFMs.map(fm => ({
      name: fm.sourceField,
      type: fm.type,
      value: '',
      selected: true,
      targetName: fm.targetField,
      defaultValue: fm.defaultValue
    })));

    // 优先使用已有的字段映射（历史配置）
    if (pipelineFMs.length > 0) {
      // 从历史字段映射创建 fieldMappings
      const mappings: FieldMapping[] = pipelineFMs.map((fm: any) => ({
        targetField: fm.targetField,
        targetLabel: fm.targetField,
        sourceField: fm.sourceField,
        fieldType: fm.type || 'string',
        defaultValue: fm.defaultValue,
        isRequired: false,
        sampleValue: undefined,
      }));
      setFieldMappings(mappings);
    } else if (pipeline.storageTableId) {
      // 如果没有历史映射，但有存储表，从表的列定义初始化字段映射目标
      const table = storageTables.find(t => String(t.id) === String(pipeline.storageTableId));
      if (table?.columnDefs && table.columnDefs.length > 0) {
        const mappings: FieldMapping[] = table.columnDefs
          .filter((col: any) => isMappableField(col.name))
          .map((col: any) => ({
            targetField: col.name,
            targetLabel: col.label || col.name,
            sourceField: null,
            fieldType: col.type || 'string',
            defaultValue: col.default_value,
            isRequired: col.required || false,
            sampleValue: undefined,
          }));
        setFieldMappings(mappings);
      } else {
        setFieldMappings([]);
      }
    } else {
      setFieldMappings([]);
    }
    setShowAddModal(true);
  }, [storageTables]);

  const openDetail = useCallback((pipeline: ParsePipeline) => {
    setSelectedPipeline(pipeline);
    setShowDetailModal(true);
  }, []);

  const openTestModal = useCallback((pipeline: ParsePipeline) => {
    setSelectedPipeline(pipeline);
    setTestLog('');
    setTestResult(null);
    setDetectedFields([]);
    setAnalysisResults([]);
    setGeneratedEvents([]);
    setShowTestModal(true);
  }, []);

  const detectFieldsFromLog = useCallback((logContent: string) => {
    const fields: Array<{name: string; type: string; value: any}> = [];

    try {
      const jsonMatch = logContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonData = JSON.parse(jsonMatch[0]);
        Object.entries(jsonData).forEach(([key, value]) => {
          const type = typeof value === 'number' ? 'number' :
                       typeof value === 'boolean' ? 'boolean' :
                       /\d{4}-\d{2}-\d{2}/.test(String(value)) ? 'datetime' : 'string';
          fields.push({ name: key, type, value });
        });
        return { format: 'json', fields };
      }

      const syslogMatch = logContent.match(/<(\d+)>(\w+\s+\d+\s+\d+:\d+:\d+)\s+(\S+)\s+(.*)/);
      if (syslogMatch) {
        fields.push(
          { name: 'priority', type: 'number', value: syslogMatch[1] },
          { name: 'timestamp', type: 'datetime', value: syslogMatch[2] },
          { name: 'hostname', type: 'string', value: syslogMatch[3] },
          { name: 'message', type: 'string', value: syslogMatch[4] }
        );
        return { format: 'syslog', fields };
      }

      const cefMatch = logContent.match(/CEF:(\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(\d+)\|(.*)/);
      if (cefMatch) {
        fields.push(
          { name: 'version', type: 'string', value: cefMatch[1] },
          { name: 'deviceVendor', type: 'string', value: cefMatch[2] },
          { name: 'deviceProduct', type: 'string', value: cefMatch[3] },
          { name: 'deviceVersion', type: 'string', value: cefMatch[4] },
          { name: 'signatureId', type: 'string', value: cefMatch[5] },
          { name: 'name', type: 'string', value: cefMatch[6] },
          { name: 'severity', type: 'number', value: cefMatch[7] },
          { name: 'extensions', type: 'string', value: cefMatch[8] }
        );
        return { format: 'cef', fields };
      }

      const kvMatch = logContent.match(/(\w+)=([^\s]+)/g);
      if (kvMatch && kvMatch.length >= 2) {
        kvMatch.forEach(pair => {
          const [key, value] = pair.split('=');
          const type = /\d{4}-\d{2}-\d{2}/.test(value) ? 'datetime' :
                       /^\d+$/.test(value) ? 'number' : 'string';
          fields.push({ name: key, type, value });
        });
        return { format: 'key-value', fields };
      }

      const timestampMatch = logContent.match(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/);
      const levelMatch = logContent.match(/\b(ERROR|WARN|INFO|DEBUG|TRACE)\b/i);
      const ipMatch = logContent.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);

      if (timestampMatch) fields.push({ name: 'timestamp', type: 'datetime', value: timestampMatch[1] });
      if (levelMatch) fields.push({ name: 'level', type: 'string', value: levelMatch[1] });
      if (ipMatch) fields.push({ name: 'ip', type: 'string', value: ipMatch[1] });

      const remaining = logContent
        .replace(timestampMatch?.[0] || '', '')
        .replace(levelMatch?.[0] || '', '')
        .replace(ipMatch?.[0] || '', '')
        .trim();
      if (remaining) fields.push({ name: 'message', type: 'string', value: remaining });

      return { format: 'auto-detected', fields };
    } catch {
      return { format: 'unknown', fields: [{ name: 'raw', type: 'string', value: logContent }] };
    }
  }, []);

  const runTest = useCallback(async () => {
    if (!testLog.trim()) return;
    const detection = detectFieldsFromLog(testLog);
    const fieldsWithMapped = detection.fields.map((f: any) => ({ ...f, mapped: false }));
    setDetectedFields(fieldsWithMapped);
    setTestResult({
      success: true,
      format: detection.format,
      fields: fieldsWithMapped,
      matchedPipeline: selectedPipeline?.name
    });

    const logData = detection.fields.reduce((acc, field) => {
      acc[field.name] = field.value;
      return acc;
    }, {} as Record<string, any>);

    setIsAnalyzing(true);
    await new Promise(r => setTimeout(r, 500));
    const { results, events } = await runRealTimeAnalysis(logData);
    setAnalysisResults(results);
    setGeneratedEvents(events);
    setIsAnalyzing(false);
  }, [testLog, selectedPipeline, detectFieldsFromLog, runRealTimeAnalysis]);

  const toggleFieldMapped = useCallback((index: number) => {
    setDetectedFields(prev => prev.map((f, i) => i === index ? { ...f, mapped: !f.mapped } : f));
  }, []);

  const saveFieldMappings = useCallback(() => {
    const mappedFields = detectedFields.filter(f => f.mapped);
    if (selectedPipeline && mappedFields.length > 0) {
      const newMappings = mappedFields.map(f => ({
        sourceField: f.name,
        targetField: f.targetName || f.name,
        type: f.type
      }));
      setPipelines(prev => prev.map(p => p.id === selectedPipeline.id ? {
        ...p,
        fieldMappings: [...(p.fieldMappings || []), ...newMappings]
      } : p));
      setShowTestModal(false);
      setTestLog('');
      setTestResult(null);
      setDetectedFields([]);
      setAnalysisResults([]);
      setGeneratedEvents([]);
    }
  }, [detectedFields, selectedPipeline]);

  const renderTemplateSelector = useCallback(() => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={templateSearchQuery}
            onChange={e => setTemplateSearchQuery(e.target.value)}
            placeholder="搜索格式模板..."
            className="w-full pl-9 pr-4 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent"
          />
        </div>
        <select
          value={templateCategory}
          onChange={e => setTemplateCategory(e.target.value)}
          className="px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">全部分类</option>
          <option value="web">Web服务器</option>
          <option value="system">系统日志</option>
          <option value="application">应用日志</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 max-h-80 overflow-auto">
        {filteredTemplates.map((template) => {
          const parserConfig = getParserConfig(template.parserType);
          return (
            <div
              key={template.id}
              onClick={() => handleSelectTemplate(template)}
              className="p-4 bg-card-bg border border-border-color rounded-lg cursor-pointer hover:border-primary/30 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg ${parserConfig.bgColor} flex items-center justify-center border ${parserConfig.borderColor}`}>
                  <FileJson className={`w-5 h-5 ${parserConfig.textColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-text-primary text-sm">{template.name}</h4>
                    {template.isPreset && (
                      <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-600 rounded-full font-medium">预设</span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mb-2 line-clamp-1">{template.description}</p>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs rounded font-medium ${parserConfig.bgColor} ${parserConfig.textColor}`}>
                      {template.parserType}
                    </span>
                    <span className="text-xs text-text-muted">{template.fieldCount} 字段</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center pt-2 border-t border-border-color">
        <button
          onClick={() => setShowTemplateSelector(false)}
          className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors font-medium"
        >
          手动配置
        </button>
      </div>
    </div>
  ), [filteredTemplates, templateSearchQuery, templateCategory, handleSelectTemplate]);

  const renderParserConfig = useCallback(() => {
    const { parser, parserConfig } = formData;

    switch (parser) {
      case 'grok':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Grok模式</label>
              <textarea
                value={parserConfig?.grokPattern || ''}
                onChange={e => setFormData(prev => ({ ...prev, parserConfig: { ...parserConfig, grokPattern: e.target.value } }))}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm font-mono text-emerald-400 h-24 resize-none focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                placeholder="%{IPORHOST:client_ip} %{USER:ident}..."
              />
            </div>
          </div>
        );

      case 'regex':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">正则表达式</label>
              <textarea
                value={parserConfig?.regexPattern || ''}
                onChange={e => setFormData(prev => ({ ...prev, parserConfig: { ...parserConfig, regexPattern: e.target.value } }))}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm font-mono text-amber-400 h-24 resize-none focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                placeholder="(?&lt;ip&gt;\\d+\\.\\d+\\.\\d+\\.\\d+) - (?&lt;user&gt;\\w+)..."
              />
            </div>
          </div>
        );

      case 'csv':
        return (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">分隔符</label>
              <select
                value={parserConfig?.csvDelimiter || ','}
                onChange={e => setFormData(prev => ({ ...prev, parserConfig: { ...parserConfig, csvDelimiter: e.target.value } }))}
                className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm"
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
                  onChange={e => setFormData(prev => ({ ...prev, parserConfig: { ...parserConfig, csvHeader: e.target.checked } }))}
                  className="w-4 h-4 rounded border-border-color-hover"
                />
                <span className="text-sm text-text-primary">第一行是表头</span>
              </label>
            </div>
          </div>
        );

      default:
        return null;
    }
  }, [formData.parser, formData.parserConfig]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">智能解析</h2>
          <p className="text-sm text-text-secondary mt-1">配置日志解析管道，支持实时安全分析并生成安全事件</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />添加管道
        </motion.button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <motion.div
          whileHover={{ y: -2, boxShadow: '0 10px 40px -10px rgba(99, 102, 241, 0.3)' }}
          className="bg-gradient-to-br from-primary/5 via-primary/5 to-primary/10 border border-primary/20 rounded-lg p-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-200/30 to-transparent rounded-full -mr-10 -mt-10" />
          <div className="flex items-start gap-4 relative">
            <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-primary/50 to-primary flex items-center justify-center shadow-lg">
              <Workflow className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-text-primary mb-2">单一来源单一格式</h3>
              <p className="text-sm text-text-secondary leading-relaxed">使用单个解析管道处理固定格式的日志，适用于日志格式统一的场景。配置简单，解析效率高。</p>
              <div className="flex items-center gap-2 mt-4">
                <span className="px-2 py-1 text-xs bg-primary/20 text-primary rounded-lg font-medium">固定格式</span>
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg font-medium">高性能</span>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2, boxShadow: '0 10px 40px -10px rgba(139, 92, 246, 0.3)' }}
          className="bg-gradient-to-br from-accent/10 via-primary/5 to-accent/10 border border-primary/20 rounded-lg p-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-200/30 to-transparent rounded-full -mr-10 -mt-10" />
          <div className="flex items-start gap-4 relative">
            <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-primary/50 to-purple-600 flex items-center justify-center shadow-lg">
              <Cpu className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-text-primary mb-2">单一来源多种格式</h3>
              <p className="text-sm text-text-secondary leading-relaxed">使用多管道智能选择，自动识别并匹配最合适的解析器。适用于混合日志格式场景。</p>
              <div className="flex items-center gap-2 mt-4">
                <span className="px-2 py-1 text-xs bg-accent/20 text-accent rounded-lg font-medium">智能识别</span>
                <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-lg font-medium">多格式</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeFilter === 'all'
              ? 'bg-card-bg text-white shadow-lg'
              : 'bg-card-bg border border-border-color text-text-secondary hover:text-text-primary hover:border-border-color-hover'
          }`}
        >
          全部
        </button>
        {parserTypes.map(type => (
          <button
            key={type.id}
            onClick={() => setActiveFilter(type.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeFilter === type.id
                ? `bg-gradient-to-r ${type.color} text-white shadow-lg`
                : 'bg-card-bg border border-border-color text-text-secondary hover:text-text-primary hover:border-border-color-hover'
            }`}
          >
            <type.icon className="w-4 h-4" />
            {type.name}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">解析管道 ({filteredPipelines.length})</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary">启用的管道: {pipelines.filter(p => p.isActive).length}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredPipelines.map((pipeline, index) => {
            const Icon = getParserIcon(pipeline.parser);
            const parserConfig = getParserConfig(pipeline.parser);
            return (
              <motion.div
                key={pipeline.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ x: 4 }}
                className="flex items-center gap-4 p-4 bg-card-bg border border-border-color rounded-xl hover:border-primary/30 transition-all group"
              >
                <div className={`w-12 h-12 rounded-xl ${parserConfig.bgColor} flex items-center justify-center border ${parserConfig.borderColor} flex-shrink-0`}>
                  <Icon className={`w-6 h-6 ${parserConfig.textColor}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text-primary">{pipeline.name}</span>
                    <span className={`px-2 py-0.5 text-xs rounded font-medium ${parserConfig.bgColor} ${parserConfig.textColor} border ${parserConfig.borderColor}`}>
                      {pipeline.parser}
                    </span>
                    {pipeline.mode === 'multi' && (
                      <span className="px-2 py-0.5 text-xs bg-gradient-to-r from-violet-100 to-purple-100 text-accent rounded font-medium border border-accent/30 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> 智能
                      </span>
                    )}
                    {pipeline.isActive ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-emerald-50 text-emerald-600 rounded font-medium border border-emerald-200">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> 运行中
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-page-bg text-text-secondary rounded font-medium border border-border-color">
                        <div className="w-1.5 h-1.5 rounded-full bg-text-muted" /> 已暂停
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {pipeline.logTypeName && (
                      <span className="text-xs text-text-muted flex items-center gap-1">
                        <Link2 className="w-3 h-3" /> {pipeline.logTypeName}
                      </span>
                    )}
                    {pipeline.formatTemplateName && (
                      <span className="text-xs text-primary flex items-center gap-1">
                        <FileJson className="w-3 h-3" /> {pipeline.formatTemplateName}
                      </span>
                    )}
                    {pipeline.fieldMappings && pipeline.fieldMappings.length > 0 && (
                      <span className="text-xs text-primary flex items-center gap-1">
                        <Database className="w-3 h-3" /> {pipeline.fieldMappings.length} 个字段映射
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => openTestModal(pipeline)}
                    className="p-1.5 text-text-muted hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors"
                    title="测试解析"
                  >
                    <Beaker className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => openDetail(pipeline)}
                    className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10 transition-colors"
                    title="查看详情"
                  >
                    <Eye className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => openEdit(pipeline)}
                    className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10 transition-colors"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => toggleActive(pipeline.id)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      pipeline.isActive
                        ? 'text-amber-500 hover:bg-amber-50'
                        : 'text-emerald-500 hover:bg-emerald-50'
                    }`}
                    title={pipeline.isActive ? '暂停' : '启用'}
                  >
                    {pipeline.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowDeleteConfirm(pipeline)}
                    className="p-1.5 text-text-muted hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

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
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-card-bg border border-border-color rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-card-bg border-b border-border-color p-6 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">{editingPipeline ? '编辑解析管道' : '添加解析管道'}</h2>
                  <p className="text-sm text-text-secondary mt-1">配置完整的日志解析流程：基础配置 → 日志解析 → 规则分析 → 存储</p>
                </div>
                <button onClick={() => setShowAddModal(false)} className="p-2 text-text-muted hover:text-text-secondary rounded-lg hover:bg-page-bg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex border-b border-border-color bg-page-bg/50">
                {[
                  { id: 'basic', label: '基本配置', icon: Settings2 },
                  { id: 'parse', label: '日志解析', icon: FileJson },
                  { id: 'analysis', label: '规则分析', icon: Brain },
                  { id: 'filter', label: '过滤', icon: Filter }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative ${
                      activeTab === tab.id
                        ? 'text-primary'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="p-6 overflow-auto max-h-[calc(90vh-220px)]">
                {activeTab === 'basic' && (
                  <div className="space-y-6">
                    <div className="p-5 bg-gradient-to-r from-primary/5 to-primary/5 rounded-lg border border-primary/20">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/50 to-primary flex items-center justify-center shadow-lg">
                          <FileJson className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-text-primary mb-2">格式模板</h3>
                          {formData.formatTemplateId ? (
                            <div className="space-y-3">
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-text-primary">
                                  已选择: <span className="font-medium text-primary">{formatTemplates.find(f => f.id === formData.formatTemplateId)?.name}</span>
                                </span>
                                <span className="px-2 py-0.5 text-xs bg-primary/20 text-primary rounded font-medium">
                                  {formatTemplates.find(f => f.id === formData.formatTemplateId)?.type}
                                </span>
                              </div>
                              <button
                                onClick={() => setShowTemplateSelector(true)}
                                className="text-sm text-primary hover:text-primary font-medium flex items-center gap-1"
                              >
                                <RefreshCw className="w-3.5 h-3.5" /> 更换模板
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <p className="text-sm text-text-secondary">选择格式模板可自动配置解析规则</p>
                              <button
                                onClick={() => setShowTemplateSelector(true)}
                                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors flex items-center gap-2"
                              >
                                <LayoutGrid className="w-4 h-4" /> 选择模板
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">管道名称</label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                          className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:ring-2 focus:ring-primary/20 focus:border-transparent transition-all"
                          placeholder="输入管道名称"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">优先级</label>
                        <input
                          type="number"
                          value={formData.priority}
                          onChange={e => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 1 }))}
                          className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:ring-2 focus:ring-primary/20 focus:border-transparent transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-3">解析模式</label>
                      <div className="grid grid-cols-2 gap-4">
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setFormData(prev => ({ ...prev, mode: 'single', linkedPipelines: [] }))}
                          className={`p-4 rounded-lg border-2 transition-all text-left ${
                            formData.mode === 'single'
                              ? 'border-primary bg-gradient-to-br from-primary/5 to-primary/5'
                              : 'border-border-color hover:border-primary/30'
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              formData.mode === 'single' ? 'bg-primary' : 'bg-page-bg'
                            }`}>
                              <Workflow className={`w-4 h-4 ${formData.mode === 'single' ? 'text-white' : 'text-text-muted'}`} />
                            </div>
                            <span className={`font-medium ${formData.mode === 'single' ? 'text-primary' : 'text-text-primary'}`}>单一格式</span>
                          </div>
                          <p className="text-xs text-text-secondary">处理固定格式的日志</p>
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setFormData(prev => ({ ...prev, mode: 'multi' }))}
                          className={`p-4 rounded-lg border-2 transition-all text-left ${
                            formData.mode === 'multi'
                              ? 'border-accent bg-gradient-to-br from-violet-50 to-purple-50'
                              : 'border-border-color hover:border-accent'
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              formData.mode === 'multi' ? 'bg-accent' : 'bg-page-bg'
                            }`}>
                              <Cpu className={`w-4 h-4 ${formData.mode === 'multi' ? 'text-white' : 'text-text-muted'}`} />
                            </div>
                            <span className={`font-medium ${formData.mode === 'multi' ? 'text-accent' : 'text-text-primary'}`}>智能多格式</span>
                          </div>
                          <p className="text-xs text-text-secondary">关联多个解析管道处理混合日志</p>
                        </motion.button>
                      </div>
                    </div>

                    {formData.mode === 'multi' && (
                      <div className="p-5 bg-gradient-to-r from-violet-50 to-purple-50 rounded-lg border border-accent/30">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h4 className="text-sm font-semibold text-text-primary">关联格式模板</h4>
                            <p className="text-xs text-text-secondary mt-1">选择要关联的格式模板，系统会智能匹配最合适的模板解析日志</p>
                          </div>
                          <span className="text-xs text-text-secondary">
                            已选择 {formData.linkedTemplates?.length || 0} 个
                          </span>
                        </div>

                        <div className="space-y-2 max-h-48 overflow-auto">
                          {formatTemplates.map(template => {
                            const isSelected = formData.linkedTemplates?.includes(String(template.id));
                            const parserConfig = getParserConfig(template.type || 'json');
                            const storageTable = formData.templateStorageMap?.[template.id];
                            return (
                              <div
                                key={template.id}
                                onClick={() => {
                                  const current = formData.linkedTemplates || [];
                                  const newLinked = isSelected
                                    ? current.filter(id => id !== template.id)
                                    : [...current, template.id];
                                  setFormData(prev => ({ ...prev, linkedTemplates: newLinked }));
                                }}
                                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                  isSelected
                                    ? 'bg-card-bg border-accent shadow-sm'
                                    : 'bg-card-bg/50 border-transparent hover:border-accent'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                    isSelected ? 'bg-accent border-accent' : 'border-border-color-hover'
                                  }`}>
                                    {isSelected && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                  <div className={`w-8 h-8 rounded-lg ${parserConfig.bgColor} flex items-center justify-center`}>
                                    <FileJson className={`w-4 h-4 ${parserConfig.textColor}`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-text-primary text-sm">{template.name}</span>
                                      <span className={`px-2 py-0.5 text-xs rounded ${parserConfig.bgColor} ${parserConfig.textColor}`}>
                                        {template.parserType}
                                      </span>
                                      {template.isPreset && (
                                        <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-600 rounded-full font-medium">预设</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-text-secondary truncate">{template.description}</p>
                                  </div>
                                  <div className="text-xs text-text-muted">{template.fieldCount} 字段</div>
                                </div>
                                {isSelected && (
                                  <div className="mt-2 pt-2 border-t border-violet-100">
                                    <div className="flex items-center gap-2">
                                      <Database className="w-3 h-3 text-indigo-500" />
                                      <span className="text-xs text-text-secondary">存储表:</span>
                                      <select
                                        value={storageTable?.tableId || ''}
                                        onChange={e => {
                                          e.stopPropagation();
                                          const table = storageTables.find(t => t.id === Number(e.target.value));
                                          setFormData(prev => ({
                                            ...prev,
                                            templateStorageMap: {
                                              ...prev.templateStorageMap,
                                              [template.id]: { tableId: e.target.value, tableName: table?.name || '' }
                                            }
                                          }));
                                        }}
                                        className="text-xs px-2 py-1 bg-card-bg border border-border-color rounded-lg focus:ring-2 focus:ring-primary/20"
                                      >
                                        <option value="">选择存储表</option>
                                        {storageTables.map(table => (
                                          <option key={table.id} value={table.id}>{table.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                            <p className="text-xs text-text-secondary">
                              智能多格式模式会按优先级顺序尝试匹配关联的格式模板，第一个成功匹配的模板将解析该日志，并可存储到各自配置的表中。
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {!formData.formatTemplateId && (
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-3">解析器类型</label>
                        <div className="grid grid-cols-5 gap-2">
                          {parserTypes.map(parser => (
                            <motion.button
                              key={parser.id}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setFormData(prev => ({ ...prev, parser: parser.id }))}
                              className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                                formData.parser === parser.id
                                  ? `border-transparent bg-gradient-to-r ${parser.color} text-white shadow-lg`
                                  : 'border-border-color hover:border-border-color-hover'
                              }`}
                            >
                              <parser.icon className="w-4 h-4" />
                              <span className="text-xs font-medium">{parser.name}</span>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-2">描述</label>
                      <textarea
                        value={formData.description}
                        onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary h-20 resize-none focus:ring-2 focus:ring-primary/20 focus:border-transparent transition-all"
                        placeholder="输入描述"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'parse' && (
                  <div className="space-y-6">
                    <div className="p-5 bg-page-bg rounded-lg border border-border-color">
                      <div className="flex items-center justify-between mb-3">
                        <label className="block text-sm font-medium text-text-primary flex items-center gap-2">
                          <Beaker className="w-4 h-4 text-primary" /> 样本日志
                        </label>
                        <button
                          onClick={handleConfigTest}
                          disabled={!formData.sample.trim() || isTestingConfig}
                          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isTestingConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                          运行测试
                        </button>
                      </div>
                      <textarea
                        value={formData.sample}
                        onChange={e => setFormData(prev => ({ ...prev, sample: e.target.value }))}
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-green-400 h-32 font-mono text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                        placeholder="粘贴日志内容，点击运行测试识别字段..."
                      />
                    </div>

                    {/* 目标存储表选择 */}
                    <div className="p-5 bg-primary/5 rounded-lg border border-primary/20">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg flex-shrink-0">
                          <Database className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <label className="text-sm font-semibold text-text-primary">目标存储表</label>
                            {formData.storageTableId && (
                              <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded-full font-medium">
                                {storageTables.find(t => String(t.id) === String(formData.storageTableId))?.columnDefs?.length || 0} 个字段
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-text-secondary mb-3">选择日志数据最终存储的目标表，表字段将作为字段映射的目标</p>
                          <select
                            value={formData.storageTableId || ''}
                            onChange={e => handleTargetTableChange(e.target.value)}
                            className="w-full px-3 py-2 bg-card-bg border border-primary/30 rounded-lg text-sm text-text-primary focus:ring-2 focus:ring-primary/20 focus:border-transparent transition-all"
                          >
                            <option value="">-- 选择目标存储表 --</option>
                            {storageTables.map(table => (
                              <option key={table.id} value={table.id}>
                                {table.name} {table.columnDefs?.length ? `(${table.columnDefs.length} 列)` : ''}
                              </option>
                            ))}
                          </select>
                          {formData.storageTableId && (() => {
                            const table = storageTables.find(t => String(t.id) === String(formData.storageTableId));
                            if (table?.columnDefs && table.columnDefs.length > 0) {
                              return (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {table.columnDefs.map((col: any) => (
                                    <span key={col.name} className={`text-xs px-2 py-1 rounded-md font-medium border ${
                                      col.required
                                        ? 'bg-red-50 text-red-600 border-red-200'
                                        : 'bg-card-bg text-text-secondary border-border-color'
                                    }`}>
                                      {col.label || col.name}
                                      <span className="ml-1 text-[10px] opacity-60">({col.type})</span>
                                      {col.required && <span className="ml-0.5 text-red-500">*</span>}
                                    </span>
                                  ))}
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    </div>

                    {renderParserConfig()}

                    {/* ========== 字段映射区域 ========== */}
                    {parsedFields.length > 0 && (
                      <div className="space-y-6">
                        {/* ====== 头部统计 ====== */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Sparkles className="w-5 h-5 text-primary" />
                            <span className="font-bold text-text-primary">字段映射</span>
                            <span className="text-sm text-text-secondary">解析出 {parsedFields.length} 个字段</span>
                            <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-medium border border-emerald-200">
                              <CheckCircle className="w-3 h-3 inline mr-1" />
                              {fieldMappings.filter(m => m.sourceField !== null).length} / {fieldMappings.length} 已映射
                            </span>
                          </div>
                          {editingPipeline?.id && (
                            <button
                              onClick={() => saveFieldMappingsToDb(editingPipeline.id!)}
                              disabled={savingMappings}
                              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
                            >
                              {savingMappings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              保存映射
                            </button>
                          )}
                        </div>

                        {/* 简要说明 */}
                        <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-start gap-2">
                          <ShieldAlert className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <span>
                            <strong>字段映射：</strong>
                            从上方列表选择解析后的字段，映射到目标存储表
                            <strong className="text-emerald-700">{
                              formData.storageTableId
                                ? (storageTables.find(t => String(t.id) === String(formData.storageTableId))?.name || '目标表')
                                : '标准告警'
                            }</strong>的字段。已映射的字段会写入对应存储表，未映射的字段存入 parsedData JSON。
                          </span>
                        </div>

                        {/* ========== Section 1: 目标表字段 ========== */}
                        <div>
                          <div className="flex items-center gap-2 mb-3 pb-1.5 border-b-2 border-primary/30">
                            <LayoutGrid className="w-5 h-5 text-primary" />
                            <span className="text-base font-bold text-text-primary">{
                              formData.storageTableId
                                ? `${storageTables.find(t => String(t.id) === String(formData.storageTableId))?.name || '目标表'} 字段`
                                : '标准告警字段'
                            }</span>
                            <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded-full">
                              {fieldMappings.filter(m => m.sourceField !== null).length} / {fieldMappings.length} 已配置
                            </span>
                            <span className="text-xs text-text-muted ml-auto">→ 写入 {
                              formData.storageTableId
                                ? (storageTables.find(t => String(t.id) === String(formData.storageTableId))?.name || '存储表')
                                : 'TimescaleDB 告警表'
                            }</span>
                          </div>
                          
                          <div className="space-y-2">
                            {fieldMappings.map((mapping) => {
                              const isMapped = mapping.sourceField !== null;
                              return (
                                <div 
                                  key={mapping.targetField}
                                  className={`p-4 rounded-lg border-2 transition-all ${
                                    isMapped 
                                      ? 'bg-primary/5 border-primary/30 shadow-sm' 
                                      : 'bg-card-bg border-border-color hover:border-border-color-hover'
                                  }`}
                                >
                                  <div className="flex items-center gap-4">
                                    {/* 映射状态指示 */}
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                      isMapped ? 'bg-primary text-white' : 'bg-page-bg text-text-muted'
                                    }`}>
                                      {isMapped ? <Check className="w-5 h-5" /> : <span className="text-sm font-bold">{mapping.targetField[0].toUpperCase()}</span>}
                                    </div>
                                    
                                    {/* 目标标准字段信息 */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <span className="font-bold text-text-primary">{mapping.targetLabel}</span>
                                        <code className="text-xs px-1.5 py-0.5 bg-primary/20 text-primary rounded font-mono">{mapping.targetField}</code>
                                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                          mapping.fieldType === 'datetime' ? 'bg-purple-50 text-purple-600' :
                                          mapping.fieldType === 'number' ? 'bg-primary/10 text-primary' :
                                          'bg-page-bg text-text-secondary'
                                        }`}>{mapping.fieldType}</span>
                                        {mapping.isRequired && (
                                          <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 rounded font-medium">
                                            <Zap className="w-3 h-3 inline mr-0.5" />必填
                                          </span>
                                        )}
                                        <span className="text-xs px-1.5 py-0.5 bg-page-bg text-text-secondary rounded border border-border-color">
                                          {mapping.targetField.split('_')[0]}
                                        </span>
                                      </div>
                                      
                                      {/* 映射的下拉选择 */}
                                      <div className="flex items-center gap-2 mt-2">
                                        <span className="text-xs text-text-secondary whitespace-nowrap">← 映射自:</span>
                                        <select
                                          value={mapping.sourceField || ''}
                                          onChange={(e) => updateMappingSourceField(mapping.targetField, e.target.value || null)}
                                          className={`flex-1 text-sm px-3 py-1.5 rounded-lg border-2 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                                            isMapped 
                                              ? 'bg-card-bg border-primary/30 text-primary' 
                                              : 'bg-page-bg border-border-color text-text-secondary'
                                          }`}
                                        >
                                          <option value="">-- 选择解析字段 --</option>
                                          {parsedFields.map(pf => (
                                            <option key={pf.name} value={pf.name}>
                                              {pf.name} ({pf.type})
                                              {pf.value ? `: ${String(pf.value).substring(0, 30)}` : ''}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      
                                      {/* 样本值预览 */}
                                      {mapping.sampleValue !== undefined && (
                                        <div className="mt-2 text-xs text-text-secondary font-mono bg-page-bg p-2 rounded border border-border-color truncate">
                                          样本值: {String(mapping.sampleValue).substring(0, 80)}{String(mapping.sampleValue).length > 80 ? '...' : ''}
                                        </div>
                                      )}
                                      
                                      {/* 默认值输入（当必填但未映射时） */}
                                      {mapping.isRequired && !isMapped && (
                                        <div className="flex items-center gap-2 mt-2">
                                          <span className="text-xs text-amber-600 whitespace-nowrap">默认值:</span>
                                          <input
                                            type="text"
                                            value={mapping.defaultValue || ''}
                                            onChange={(e) => updateMappingDefaultValue(mapping.targetField, e.target.value)}
                                            placeholder={mapping.defaultValue || '请输入默认值'}
                                            className="flex-1 text-sm px-2 py-1 border border-amber-300 rounded-lg bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                          />
                                          {mapping.defaultValue && !mapping.defaultValue && (
                                            <span className="text-xs text-amber-500">使用预设: {mapping.defaultValue}</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* ========== Section 2: 解析字段列表（可选择映射）========== */}
                        <div>
                          <div className="flex items-center gap-2 mb-3 pb-1.5 border-b-2 border-border-color-hover">
                            <FileJson className="w-5 h-5 text-text-secondary" />
                            <span className="text-base font-bold text-text-primary">解析字段</span>
                            <span className="text-xs px-2 py-0.5 bg-page-bg text-text-secondary rounded-full">
                              {parsedFields.length} 个字段
                            </span>
                            <span className="text-xs text-text-muted ml-auto">→ 选择字段映射到上方标准字段</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2">
                            {parsedFields.map((field, idx) => {
                              // 检查是否已被映射
                              const isMapped = fieldMappings.some(m => m.sourceField === field.name);
                              return (
                                <div 
                                  key={`parsed-${idx}`}
                                  className={`group p-3 rounded-lg border-2 transition-all cursor-default ${
                                    isMapped 
                                      ? 'bg-emerald-50/50 border-emerald-200 opacity-60' 
                                      : 'bg-page-bg border-border-color hover:border-primary/30'
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                      isMapped ? 'bg-emerald-500 text-white' : 'bg-page-bg text-text-secondary'
                                    }`}>
                                      {isMapped ? <Check className="w-3 h-3" /> : <span className="text-[10px] font-bold">{idx + 1}</span>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                        <span className={`text-xs font-semibold truncate ${isMapped ? 'text-emerald-700' : 'text-text-primary'}`}>
                                          {field.name}
                                        </span>
                                        <span className={`text-[10px] px-1 py-px rounded font-mono ${
                                          field.type === 'datetime' ? 'bg-purple-100 text-purple-600' :
                                          field.type === 'number' ? 'bg-blue-100 text-blue-600' :
                                          'bg-page-bg text-text-secondary'
                                        }`}>{field.type}</span>
                                        {isMapped && (
                                          <span className="text-[10px] px-1 py-px bg-emerald-100 text-emerald-600 rounded">
                                            已映射
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-text-secondary font-mono truncate" title={String(field.value)}>
                                        {String(field.value).substring(0, 40)}{String(field.value).length > 40 ? '...' : ''}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 统计信息 */}
                        <div className="p-4 bg-page-bg rounded-lg border border-border-color">
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                              <div className="text-2xl font-bold text-emerald-600">{fieldMappings.filter(m => m.sourceField !== null).length}</div>
                              <div className="text-xs text-text-secondary">已映射字段</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-amber-600">{fieldMappings.filter(m => m.isRequired && !m.sourceField && !m.defaultValue).length}</div>
                              <div className="text-xs text-text-secondary">缺少必填映射</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-text-secondary">{parsedFields.length - fieldMappings.filter(m => m.sourceField !== null).length}</div>
                              <div className="text-xs text-text-secondary">额外字段</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'analysis' && (
                  <div className="space-y-6">
                    <div className="p-5 bg-gradient-to-r from-primary/5 to-primary/5 rounded-lg border border-primary/20">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/50 to-primary flex items-center justify-center shadow-lg">
                          <Brain className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-text-primary mb-2">实时安全分析配置</h3>
                          <p className="text-sm text-text-secondary">配置当前解析管道需要执行的检测规则。解析完成后，系统会自动将日志与选中的规则进行匹配。</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold text-text-primary">选择检测规则</h4>
                        <span className="text-xs text-text-secondary">
                          已选择 {formData.selectedRules?.length || 0} 条规则
                        </span>
                      </div>

                      <div className="space-y-3">
                        {detectionRules.filter(r => r.status === 'enabled').map(rule => {
                          const isSelected = formData.selectedRules?.includes(rule.id);
                          return (
                            <div
                              key={rule.id}
                              onClick={() => {
                                const currentRules = formData.selectedRules || [];
                                const newRules = isSelected
                                  ? currentRules.filter(id => id !== rule.id)
                                  : [...currentRules, rule.id];
                                setFormData(prev => ({ ...prev, selectedRules: newRules }));
                              }}
                              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-gradient-to-r from-violet-50 to-purple-50 border-accent shadow-md'
                                  : 'bg-card-bg border-border-color hover:border-accent'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                  isSelected ? 'bg-accent border-accent' : 'border-border-color-hover'
                                }`}>
                                  {isSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-text-primary text-sm">{rule.name}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                      rule.severity === 'critical' ? 'bg-rose-100 text-rose-600' :
                                      rule.severity === 'high' ? 'bg-orange-100 text-orange-600' :
                                      rule.severity === 'medium' ? 'bg-amber-100 text-amber-600' :
                                      'bg-blue-100 text-blue-600'
                                    }`}>
                                      {rule.severity === 'critical' ? '危急' :
                                       rule.severity === 'high' ? '高危' :
                                       rule.severity === 'medium' ? '中危' : '低危'}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                      rule.type === 'single' ? 'bg-blue-100 text-blue-600' :
                                      rule.type === 'correlation' ? 'bg-purple-100 text-purple-600' :
                                      'bg-orange-100 text-orange-600'
                                    }`}>
                                      {rule.type === 'single' ? '单事件' : rule.type === 'correlation' ? '关联' : '时序'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-text-secondary mt-1">{rule.description}</p>
                                  <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
                                    <span>数据源: {rule.dataSourceIds?.length || 0} 个</span>
                                    <span>命中: {rule.hitCount} 次</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-text-primary text-sm">分析流程说明</h4>
                          <p className="text-sm text-text-secondary mt-1">
                            1. 日志解析完成后，系统自动提取关键字段<br/>
                            2. 将解析结果与选中的检测规则进行匹配<br/>
                            3. 规则命中时立即生成安全事件并推送至事件工作台<br/>
                            4. 分析失败不影响日志的正常存储流程
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'filter' && (
                  <div className="space-y-6">
                    <div className="p-5 bg-gradient-to-r from-cyan-50 to-primary/5 rounded-lg border border-cyan-200">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500 to-primary flex items-center justify-center shadow-lg">
                          <Filter className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-text-primary mb-2">解析后过滤</h3>
                          <p className="text-sm text-text-secondary">配置过滤规则，只保留符合条件的日志。不满足过滤条件的日志将被丢弃，不会进入存储和分析流程。</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold text-text-primary">过滤规则</h4>
                        <button
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              filterRules: [...(prev.filterRules || []), { field: '', operator: 'eq', value: '', logic: 'and' }]
                            }));
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-xs font-medium hover:bg-cyan-700 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />添加规则
                        </button>
                      </div>

                      {(formData.filterRules || []).length === 0 ? (
                        <div className="text-center py-8 bg-page-bg rounded-lg border border-border-color">
                          <Filter className="w-10 h-10 text-text-muted mx-auto mb-2" />
                          <p className="text-sm text-text-secondary">暂无过滤规则</p>
                          <p className="text-xs text-text-muted mt-1">所有解析后的日志都将被保留</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(formData.filterRules || []).map((rule, index) => (
                            <motion.div
                              key={index}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="p-4 bg-card-bg border border-border-color rounded-lg"
                            >
                              <div className="flex items-center gap-3">
                                {index > 0 && (
                                  <select
                                    value={rule.logic}
                                    onChange={e => {
                                      const newRules = [...(formData.filterRules || [])];
                                      newRules[index].logic = e.target.value as 'and' | 'or';
                                      setFormData(prev => ({ ...prev, filterRules: newRules }));
                                    }}
                                    className="px-2 py-1.5 bg-page-bg border border-border-color rounded-lg text-xs font-medium"
                                  >
                                    <option value="and">且</option>
                                    <option value="or">或</option>
                                  </select>
                                )}
                                <div className="flex-1 grid grid-cols-3 gap-2">
                                  <input
                                    type="text"
                                    value={rule.field}
                                    onChange={e => {
                                      const newRules = [...(formData.filterRules || [])];
                                      newRules[index].field = e.target.value;
                                      setFormData(prev => ({ ...prev, filterRules: newRules }));
                                    }}
                                    placeholder="字段名"
                                    className="px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                                  />
                                  <select
                                    value={rule.operator}
                                    onChange={e => {
                                      const newRules = [...(formData.filterRules || [])];
                                      newRules[index].operator = e.target.value as any;
                                      setFormData(prev => ({ ...prev, filterRules: newRules }));
                                    }}
                                    className="px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                                  >
                                    <option value="eq">等于</option>
                                    <option value="ne">不等于</option>
                                    <option value="gt">大于</option>
                                    <option value="lt">小于</option>
                                    <option value="contains">包含</option>
                                    <option value="regex">正则匹配</option>
                                  </select>
                                  <input
                                    type="text"
                                    value={rule.value}
                                    onChange={e => {
                                      const newRules = [...(formData.filterRules || [])];
                                      newRules[index].value = e.target.value;
                                      setFormData(prev => ({ ...prev, filterRules: newRules }));
                                    }}
                                    placeholder="值"
                                    className="px-3 py-2 bg-card-bg border border-border-color rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                                  />
                                </div>
                                <button
                                  onClick={() => {
                                    const newRules = (formData.filterRules || []).filter((_, i) => i !== index);
                                    setFormData(prev => ({ ...prev, filterRules: newRules }));
                                  }}
                                  className="p-1.5 text-text-muted hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-cyan-50 rounded-lg border border-cyan-200">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-cyan-600 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-text-primary text-sm">过滤规则说明</h4>
                          <p className="text-sm text-text-secondary mt-1">
                            • 支持多条件组合，使用"且"/"或"逻辑连接<br/>
                            • 正则匹配支持标准正则表达式语法<br/>
                            • 字段名支持嵌套路径，如 user.name、data.level<br/>
                            • 不满足过滤条件的日志将被丢弃，不会存储和分析
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              <div className="sticky bottom-0 bg-card-bg border-t border-border-color p-6 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-secondary">
                    步骤 {['basic', 'parse', 'analysis', 'filter'].indexOf(activeTab) + 1} / 4
                  </span>
                  <div className="flex items-center gap-1">
                    {['basic', 'parse', 'analysis', 'filter'].map((tab, idx) => (
                      <div
                        key={tab}
                        className={`w-2 h-2 rounded-full transition-colors ${
                          ['basic', 'parse', 'analysis', 'filter'].indexOf(activeTab) >= idx
                            ? 'bg-primary'
                            : 'bg-page-bg'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-text-secondary hover:text-text-primary text-sm font-medium transition-colors"
                  >
                    取消
                  </button>
                  {activeTab !== 'filter' ? (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        const tabs = ['basic', 'parse', 'analysis', 'filter'];
                        const currentIndex = tabs.indexOf(activeTab);
                        if (currentIndex < tabs.length - 1) {
                          setActiveTab(tabs[currentIndex + 1] as any);
                        }
                      }}
                      className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium flex items-center gap-2"
                    >
                      下一步<ChevronRight className="w-4 h-4" />
                    </motion.button>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={editingPipeline ? handleEdit : handleAdd}
                      className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg text-sm font-medium shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />保存
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showTemplateSelector && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowTemplateSelector(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-card-bg border-b border-border-color p-6 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">选择格式模板</h2>
                  <p className="text-sm text-text-secondary mt-1">选择模板将自动配置解析规则</p>
                </div>
                <button onClick={() => setShowTemplateSelector(false)} className="p-2 text-text-muted hover:text-text-secondary rounded-lg hover:bg-page-bg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                {renderTemplateSelector()}
              </div>
            </motion.div>
          </motion.div>
        )}

        {showTestModal && selectedPipeline && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowTestModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">测试解析与实时分析</h2>
                  <p className="text-sm text-text-secondary mt-1">测试 {selectedPipeline.name} 的解析效果并执行实时安全分析</p>
                </div>
                <button onClick={() => setShowTestModal(false)} className="p-2 text-text-muted hover:text-text-secondary rounded-lg hover:bg-page-bg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="p-4 bg-page-bg rounded-lg border border-border-color">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-text-primary flex items-center gap-2">
                      <Beaker className="w-4 h-4 text-primary" /> 样本日志
                    </label>
                    <button
                      onClick={runTest}
                      disabled={!testLog.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Zap className="w-4 h-4" /> 解析并分析
                    </button>
                  </div>
                  <textarea
                    value={testLog}
                    onChange={e => setTestLog(e.target.value)}
                    className="w-full px-4 py-3 bg-card-bg border border-border-color rounded-lg text-emerald-400 h-32 font-mono text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                    placeholder={`示例日志格式：
{"timestamp":"2026-05-03T10:30:00Z","event_type":"login","status":"failed","source_ip":"192.168.1.100","hostname":"web-server-01","user":"admin"}`}
                  />
                </div>

                {testResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm font-medium text-emerald-700">解析成功</span>
                      <span className="text-xs text-emerald-600 px-2 py-1 bg-emerald-100 rounded-lg font-medium">{testResult.format}</span>
                    </div>

                    <div className="bg-card-bg border border-border-color rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-amber-500" />
                          <span className="font-semibold text-text-primary">识别字段</span>
                          <span className="text-sm text-text-secondary">({detectedFields.length}个)</span>
                        </div>
                      </div>

                      <div className="space-y-2 max-h-48 overflow-auto">
                        {detectedFields.map((field, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="p-3 rounded-lg border bg-page-bg border-border-color"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-text-primary">{field.name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                                field.type === 'datetime' ? 'bg-purple-100 text-purple-600' :
                                field.type === 'number' ? 'bg-blue-100 text-blue-600' :
                                field.type === 'boolean' ? 'bg-amber-100 text-amber-600' :
                                'bg-page-bg text-text-secondary'
                              }`}>{field.type}</span>
                            </div>
                            <div className="text-sm text-text-secondary font-mono mt-1 break-all">
                              {String(field.value).length > 100 ? String(field.value).substring(0, 100) + '...' : String(field.value)}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-card-bg border border-border-color rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Brain className="w-5 h-5 text-violet-500" />
                          <span className="font-semibold text-text-primary">实时安全分析</span>
                        </div>
                        {isAnalyzing && (
                          <span className="flex items-center gap-2 text-sm text-text-secondary">
                            <RefreshCw className="w-4 h-4 animate-spin" /> 分析中...
                          </span>
                        )}
                      </div>

                      {!isAnalyzing && analysisResults.length > 0 ? (
                        <div className="space-y-3">
                          {analysisResults.map((result, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={`p-4 rounded-lg border ${
                                result.severity === 'critical' ? 'bg-rose-50 border-rose-200' :
                                result.severity === 'high' ? 'bg-orange-50 border-orange-200' :
                                'bg-amber-50 border-amber-200'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                  result.severity === 'critical' ? 'bg-rose-500' :
                                  result.severity === 'high' ? 'bg-orange-500' :
                                  'bg-amber-500'
                                }`}>
                                  <Siren className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-text-primary">{result.rule.name}</span>
                                    <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                                      result.severity === 'critical' ? 'bg-rose-100 text-rose-600' :
                                      result.severity === 'high' ? 'bg-orange-100 text-orange-600' :
                                      'bg-amber-100 text-amber-600'
                                    }`}>
                                      {result.severity}
                                    </span>
                                  </div>
                                  <p className="text-sm text-text-secondary">{result.rule.description}</p>
                                  {result.event && (
                                    <div className="mt-3 p-3 bg-card-bg rounded-lg border border-border-color">
                                      <div className="flex items-center gap-2 mb-2">
                                        <ShieldAlert className="w-4 h-4 text-rose-500" />
                                        <span className="font-medium text-text-primary">生成的安全事件</span>
                                      </div>
                                      <div className="text-xs text-text-secondary space-y-1">
                                        <div>事件ID: <span className="font-mono text-text-primary">{result.event.id}</span></div>
                                        <div>标题: {result.event.title}</div>
                                        <div>置信度: {result.event.confidence}%</div>
                                        <div>受影响资产: {result.event.affectedAssets.join(', ')}</div>
                                        <div>源IP: {result.event.sourceIp}</div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      ) : !isAnalyzing && testResult ? (
                        <div className="text-center py-8 text-text-muted">
                          <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>未检测到安全威胁</p>
                          <p className="text-sm mt-1">当前日志未命中任何检测规则</p>
                        </div>
                      ) : null}
                    </div>

                    {generatedEvents.length > 0 && (
                      <div className="bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Target className="w-5 h-5 text-rose-500" />
                          <span className="font-semibold text-text-primary">已生成 {generatedEvents.length} 个安全事件</span>
                        </div>
                        <p className="text-sm text-text-secondary">
                          这些事件已推送至事件工作台，可在"检测与分析" → "事件工作台"中查看详情
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border-color">
                <button onClick={() => setShowTestModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary text-sm font-medium transition-colors">关闭</button>
                {testResult && (
                  <button
                    onClick={saveFieldMappings}
                    className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />保存字段映射
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {showDetailModal && selectedPipeline && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowDetailModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-auto shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary">{selectedPipeline.name}</h2>
                <button onClick={() => setShowDetailModal(false)} className="p-2 text-text-muted hover:text-text-secondary rounded-lg hover:bg-page-bg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* 操作按钮 */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => { setShowDetailModal(false); openEdit(selectedPipeline); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors text-sm font-medium"
                >
                  <Edit3 className="w-4 h-4" /> 编辑
                </button>
                <button
                  onClick={() => { toggleActive(selectedPipeline.id!); setShowDetailModal(false); }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                    selectedPipeline.isActive 
                      ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' 
                      : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                  }`}
                >
                  {selectedPipeline.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {selectedPipeline.isActive ? '暂停' : '启用'}
                </button>
                <button
                  onClick={() => { setShowDetailModal(false); setShowDeleteConfirm(selectedPipeline); }}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" /> 删除
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-4 bg-page-bg rounded-lg">
                    <div className="text-text-secondary text-xs mb-1">解析器</div>
                    <div className="text-text-primary font-semibold">{selectedPipeline.parser}</div>
                  </div>
                  <div className="p-4 bg-page-bg rounded-lg">
                    <div className="text-text-secondary text-xs mb-1">优先级</div>
                    <div className="text-text-primary font-semibold">{selectedPipeline.priority}</div>
                  </div>
                  <div className="p-4 bg-page-bg rounded-lg">
                    <div className="text-text-secondary text-xs mb-1">状态</div>
                    <div className={selectedPipeline.isActive ? 'text-emerald-600 font-semibold' : 'text-text-secondary'}>
                      {selectedPipeline.isActive ? '运行中' : '已暂停'}
                    </div>
                  </div>
                  <div className="p-4 bg-page-bg rounded-lg">
                    <div className="text-text-secondary text-xs mb-1">解析模式</div>
                    <div className="text-text-primary font-semibold">{selectedPipeline.mode === 'multi' ? '智能多格式' : '单一格式'}</div>
                  </div>
                </div>

                {selectedPipeline.description && (
                  <div className="p-4 bg-page-bg rounded-lg">
                    <div className="text-text-secondary text-xs mb-1">描述</div>
                    <div className="text-text-primary text-sm">{selectedPipeline.description}</div>
                  </div>
                )}

                {(selectedPipeline.logTypeName || selectedPipeline.storageTableName || selectedPipeline.formatTemplateName) && (
                  <div className="p-4 bg-page-bg rounded-lg">
                    <div className="text-text-secondary text-xs mb-3">关联配置</div>
                    <div className="space-y-2">
                      {selectedPipeline.logTypeName && (
                        <div className="flex items-center gap-2 text-sm">
                          <Layers className="w-4 h-4 text-primary" />
                          <span className="text-text-secondary">日志类型:</span>
                          <span className="text-text-primary font-medium">{selectedPipeline.logTypeName}</span>
                        </div>
                      )}
                      {selectedPipeline.storageTableName && (
                        <div className="flex items-center gap-2 text-sm">
                          <Database className="w-4 h-4 text-primary" />
                          <span className="text-text-secondary">存储表:</span>
                          <span className="text-text-primary font-medium">{selectedPipeline.storageTableName}</span>
                        </div>
                      )}
                      {selectedPipeline.formatTemplateName && (
                        <div className="flex items-center gap-2 text-sm">
                          <FileJson className="w-4 h-4 text-primary" />
                          <span className="text-text-secondary">格式模板:</span>
                          <span className="text-text-primary font-medium">{selectedPipeline.formatTemplateName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedPipeline.fieldMappings && selectedPipeline.fieldMappings.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-text-primary mb-3">字段映射</h3>
                    <div className="space-y-2">
                      {selectedPipeline.fieldMappings.map((fm, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-page-bg rounded-lg text-sm">
                          <span className="text-text-secondary font-mono">{fm.sourceField}</span>
                          <ChevronRight className="w-4 h-4 text-text-muted" />
                          <span className="text-text-primary font-mono">{fm.targetField}</span>
                          {fm.defaultValue && (
                            <span className="text-xs text-amber-600" title="默认值">= {fm.defaultValue}</span>
                          )}
                          <span className="px-2 py-0.5 text-xs bg-primary/20 text-primary rounded-lg font-medium">{fm.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-full max-w-sm shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-rose-600" />
                </div>
                <h2 className="text-lg font-semibold text-text-primary">确认删除</h2>
              </div>
              <p className="text-text-secondary mb-6">确定要删除解析管道 <span className="font-semibold text-text-primary">{showDeleteConfirm.name}</span> 吗？</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowDeleteConfirm(null)} className="px-4 py-2 text-text-secondary hover:text-text-primary text-sm font-medium transition-colors">取消</button>
                <button onClick={handleDelete} className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 text-sm font-medium">确认删除</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}