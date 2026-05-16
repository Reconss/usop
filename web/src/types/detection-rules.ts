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

export type RuleType = 'single' | 'correlation' | 'sequence';

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

// ─── 关联规则内容 (type: correlation) ───────────

export interface CorrelationGroup {
  id: string;
  label: string;
  data_source_ids: (string | number)[];
  conditions: Condition[];
  time_window: string;
  logical_operator?: 'AND' | 'OR';
}

export interface CorrelationRuleContent {
  version?: number;
  groups: CorrelationGroup[];
  group_logic: 'AND' | 'OR';
  overall_time_window: string;
  threshold: number;
  severity?: string;
  title_template?: string;
}

// ─── 时序规则内容 (type: sequence) ──────────────

export interface SequenceStep {
  id: string;
  label: string;
  order: number;
  data_source_ids: (string | number)[];
  conditions: Condition[];
  time_window: string;
  required?: boolean;
}

export interface SequenceRuleContent {
  version?: number;
  steps: SequenceStep[];
  max_span: string;
  threshold: number;
  severity?: string;
  title_template?: string;
}

// ─── 动态字段 ─────────────────────────────────

export interface DynamicField {
  name: string;
  label: string;
  source_name: string;
  source_id: number | string | null;
}

// ─── 预览数据 ─────────────────────────────────

export interface SourcePreviewData {
  data_source_id: number | string;
  data_source_name: string;
  storage_table: string;
  sample_count: number;
  columns?: { name: string; type: string }[];
  samples: Record<string, any>[];
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
  sources?: Record<string, any>;
  raw?: any;
}

// ─── 规则表单状态 ─────────────────────────────

export type FormTab = 'basic' | 'datasource' | 'condition' | 'action';
