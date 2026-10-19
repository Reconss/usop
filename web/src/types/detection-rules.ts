// ─── 核心规则 ─────────────────────────────────

export interface DetectionRule {
  id: number | string;
  name: string;
  type: RuleType;
  status: string;
  severity?: string;
  hitCount?: number;
  lastHitTime?: string;
  description?: string;
  ruleContent?: string;
  ruleLanguage?: string;
  dataSourceIds?: (string | number)[];
  playbookId?: string | number;
}

export type RuleType = 'single';

// ─── 条件类型 ─────────────────────────────────

export interface Condition {
  field: string;
  operator: string;
  value: string;
  dataSourceId?: string | number;
}

// ─── 单事件规则内容 (type: single) ──────────────

export interface SingleRuleContent {
  version?: number;
  conditions: Condition[];
  time_window: string;
  threshold: number;
  group_by?: string;
  aggregation?: string;
  severity?: string;
  title_template?: string;
}

// 说明：关联规则（CorrelationRuleContent / CorrelationGroup）与时序规则
// （SequenceRuleContent / SequenceStep）的类型已随功能下线一并删除——
// 它们的 JSON 结构后端引擎从未支持，多事件分析统一走「关联分析规则」。

// ─── 动态字段 ─────────────────────────────────

export interface DynamicField {
  name: string;
  label: string;
  source_name: string;
  source_id: number | string | null;
}

// ─── 预览数据 ─────────────────────────────────

export interface SourcePreviewData {
  data_source_id: number | string | null;
  data_source_name: string;
  storage_table?: string;
  sample_count: number;
  total_matched?: number;
  columns?: { name: string; type: string }[];
  samples: Record<string, any>[];
  warnings?: string[];
  error?: string;
}

export interface RulePreviewData {
  sources: Record<string, SourcePreviewData>;
}

// ─── 测试结果 ─────────────────────────────────

export interface RuleTestResult {
  matched_count: number;
  matched: boolean;
  matched_logs: Record<string, any>[];
  threshold?: number;
  time_window?: string;
  matches?: Record<string, any>[];
  warnings?: string[];
  error?: string;
  sources?: Record<string, any>;
  raw?: any;
}

// ─── 规则表单状态 ─────────────────────────────

export type FormTab = 'basic' | 'datasource' | 'condition' | 'action';
