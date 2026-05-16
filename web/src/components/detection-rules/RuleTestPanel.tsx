import React, { useState } from 'react';
import { Play, Loader2, CheckCircle, AlertTriangle, Database, Eye, Clock, Search } from 'lucide-react';
import { rulesApi } from '../../services/api';
import { RulePreviewData, RuleTestResult } from '../../types/detection-rules';

interface Props {
  ruleId: string | number;
  isTesting: boolean;
  testResult: RuleTestResult | null;
  onTest: () => void;
}

export default function RuleTestPanel({ ruleId, isTesting, testResult, onTest }: Props) {
  const [previewData, setPreviewData] = useState<RulePreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 直接查询存储表
  const [testTimeRange, setTestTimeRange] = useState('30');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [queryLoading, setQueryLoading] = useState(false);

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await rulesApi.previewRule(ruleId) as any;
      if (res.success) setPreviewData(res.data);
    } catch (e) {
      console.error('Preview failed:', e);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleTestFromStorage = async () => {
    setQueryLoading(true);
    setQueryResult(null);
    try {
      const res = await rulesApi.testRuleFromStorage(ruleId, {
        time_range_minutes: parseInt(testTimeRange)
      }) as any;
      if (res.success && res.data) {
        setQueryResult(res.data);
      } else {
        setQueryResult({ matched: false, matched_count: 0, matched_logs: [], error: res.error });
      }
    } catch (e: any) {
      setQueryResult({ matched: false, matched_count: 0, matched_logs: [], error: e.message });
    } finally {
      setQueryLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onTest} disabled={isTesting}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center gap-2 text-sm">
          {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {isTesting ? '测试中...' : '测试规则'}
        </button>
        <button onClick={handlePreview} disabled={previewLoading}
          className="px-4 py-2 bg-card-bg border border-border-color text-text-secondary rounded-lg hover:border-primary hover:text-primary disabled:opacity-50 transition-colors flex items-center gap-2 text-sm">
          {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          {previewLoading ? '加载中...' : '预览数据'}
        </button>
      </div>

      {/* 从存储表直接查询 */}
      <div className="p-4 rounded-lg border border-border-color bg-card-bg/30">
        <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          从存储表检测数据
        </h4>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-text-muted" />
            <select value={testTimeRange}
              onChange={e => setTestTimeRange(e.target.value)}
              className="px-2 py-1.5 bg-card-bg border border-border-color rounded text-sm text-text-primary focus:border-primary focus:outline-none">
              <option value="5">最近 5 分钟</option>
              <option value="15">最近 15 分钟</option>
              <option value="30">最近 30 分钟</option>
              <option value="60">最近 1 小时</option>
              <option value="360">最近 6 小时</option>
              <option value="1440">最近 24 小时</option>
            </select>
          </div>
          <button onClick={handleTestFromStorage} disabled={queryLoading}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2 text-sm">
            {queryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {queryLoading ? '检测中...' : '检测'}
          </button>
        </div>
        <p className="text-xs text-text-muted mt-2">
          直接查询数据源存储表中最近的数据，验证规则是否能正确匹配
        </p>

        {/* 存储表查询结果 */}
        {queryResult && (
          <div className={`mt-3 p-3 rounded-lg border ${
            queryResult.matched ? 'border-emerald-500/30 bg-emerald-500/5' :
            queryResult.error ? 'border-rose-500/30 bg-rose-500/5' : 'border-amber-500/30 bg-amber-500/5'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {queryResult.matched
                ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                : queryResult.error
                ? <AlertTriangle className="w-4 h-4 text-rose-400" />
                : <AlertTriangle className="w-4 h-4 text-amber-400" />
              }
              <span className={`text-sm font-medium ${
                queryResult.matched ? 'text-emerald-400' :
                queryResult.error ? 'text-rose-400' : 'text-amber-400'
              }`}>
                {queryResult.error ? `查询失败: ${queryResult.error}` :
                 `检测结果：匹配 ${queryResult.matched_count || 0} 条日志`}
              </span>
            </div>
            {queryResult.matched_logs && queryResult.matched_logs.length > 0 && (
              <div className="mt-2 space-y-1 max-h-32 overflow-auto">
                {queryResult.matched_logs.slice(0, 5).map((log: any, idx: number) => (
                  <pre key={idx} className="text-xs font-mono text-text-muted bg-page-bg p-2 rounded truncate">
                    {log.message || log.raw_message || JSON.stringify(log)}
                  </pre>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 预览数据 */}
      {previewData && (
        <div className="p-4 rounded-lg border border-border-color bg-card-bg/50">
          <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            各数据源样本数据预览
          </h4>
          <div className="space-y-3">
            {Object.entries(previewData.sources).map(([srcId, src]) => (
              <div key={srcId} className="border border-border-color rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-text-primary">{src.data_source_name}</span>
                  <span className="text-xs text-text-muted">存储表: {src.storage_table} | 样本: {src.sample_count} 条</span>
                </div>
                {src.error ? (
                  <p className="text-xs text-rose-400">{src.error}</p>
                ) : (
                  <div className="max-h-40 overflow-auto">
                    {src.samples.slice(0, 5).map((sample: any, i: number) => (
                      <pre key={i} className="text-xs text-text-muted bg-page-bg p-2 rounded mb-1 truncate">
                        {JSON.stringify(sample)}
                      </pre>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 测试结果 */}
      {testResult && (
        <div className={`p-4 rounded-lg border ${
          testResult.matched ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {testResult.matched
              ? <CheckCircle className="w-4 h-4 text-emerald-400" />
              : <AlertTriangle className="w-4 h-4 text-rose-400" />
            }
            <span className={`text-sm font-medium ${testResult.matched ? 'text-emerald-400' : 'text-rose-400'}`}>
              测试结果：匹配 {testResult.matched_count} 条日志
            </span>
          </div>
          {testResult.matched_logs && testResult.matched_logs.length > 0 && (
            <div className="mt-2 space-y-1 max-h-32 overflow-auto">
              {testResult.matched_logs.slice(0, 5).map((log: any, idx: number) => (
                <pre key={idx} className="text-xs font-mono text-text-muted bg-page-bg p-2 rounded truncate">
                  {log.message || log.raw_message || JSON.stringify(log)}
                </pre>
              ))}
            </div>
          )}
          {testResult.sources && Object.keys(testResult.sources).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(testResult.sources).map(([id, src]: [string, any]) => (
                <span key={id} className="text-xs px-2 py-1 rounded bg-card-bg border border-border-color text-text-muted">
                  {src.data_source_name}: {src.matched_count} 条
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
