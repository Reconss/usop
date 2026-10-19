import React, { useState } from 'react';
import { Play, CheckCircle, AlertTriangle, Database, Eye, Clock, Search } from 'lucide-react';
import { rulesApi } from '../../services/api';
import { RulePreviewData, RuleTestResult } from '../../types/detection-rules';
import { Button, SectionCard } from '../ui';

interface Props {
  ruleId: string | number;
  isTesting: boolean;
  testResult: RuleTestResult | null;
  onTest: () => void;
}

/** 一行展示一条告警：优先标题，其次编号 / 原始日志。 */
function alertLine(log: any): string {
  if (!log || typeof log !== 'object') return String(log);
  const head = log.title || log.alert_code || log.id;
  const tail = log.src_ip || log.dst_ip || log.severity || '';
  if (head) return tail ? `${head} · ${tail}` : String(head);
  return log.raw_log || log.description || JSON.stringify(log);
}

/** 命中日志列表 */
function MatchedLogs({ logs }: { logs: any[] }) {
  return (
    <div className="mt-2 flex max-h-32 flex-col gap-1 overflow-auto scrollbar-thin">
      {logs.slice(0, 5).map((log, idx) => (
        <pre
          key={idx}
          className="truncate-1 rounded-input border border-border-color bg-surface-2 px-2 py-1.5 font-mono text-[11px] text-text-muted"
        >
          {alertLine(log)}
        </pre>
      ))}
    </div>
  );
}

/** 告警数量 / 阈值结论行 */
function ResultHead({
  matched,
  error,
  text,
}: {
  matched?: boolean;
  error?: string;
  text: React.ReactNode;
}) {
  const tone = error ? 'danger' : matched ? 'success' : 'warning';
  const Icon = error || !matched ? AlertTriangle : CheckCircle;
  const iconCls = tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-warning';
  const textCls = iconCls;
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className={iconCls} />
      <span className={`text-[12.5px] font-medium ${textCls}`}>{text}</span>
    </div>
  );
}

export default function RuleTestPanel({ ruleId, isTesting, testResult, onTest }: Props) {
  const [previewData, setPreviewData] = useState<RulePreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 按时间范围在告警索引上检测
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
    <div className="flex flex-col gap-3">
      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={Play} loading={isTesting} onClick={onTest}>
          {isTesting ? '测试中...' : '测试规则'}
        </Button>
        <Button variant="secondary" icon={Eye} loading={previewLoading} onClick={handlePreview}>
          {previewLoading ? '加载中...' : '预览数据'}
        </Button>
      </div>

      {/* 按时间范围检测 */}
      <SectionCard icon={Database} title="按时间范围检测（告警索引 alerts-valid）" padding="sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="app-label" htmlFor="rule-test-range">时间范围</label>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-text-muted" />
              <select
                id="rule-test-range"
                value={testTimeRange}
                onChange={e => setTestTimeRange(e.target.value)}
                className="app-select w-auto"
              >
                <option value="5">最近 5 分钟</option>
                <option value="15">最近 15 分钟</option>
                <option value="30">最近 30 分钟</option>
                <option value="60">最近 1 小时</option>
                <option value="360">最近 6 小时</option>
                <option value="1440">最近 24 小时</option>
                <option value="43200">最近 30 天</option>
              </select>
            </div>
          </div>
          <Button
            variant="secondary"
            icon={Search}
            loading={queryLoading}
            onClick={handleTestFromStorage}
          >
            {queryLoading ? '检测中...' : '检测'}
          </Button>
        </div>
        <p className="mt-2 text-caption text-text-muted">
          在告警索引中按规则条件检索指定时间范围内的告警，只读、不会生成事件
        </p>

        {/* 时间范围检测结果 */}
        {queryResult && (
          <div
            className={[
              'mt-3 rounded-card border p-3',
              queryResult.matched
                ? 'border-success/30 bg-success/5'
                : queryResult.error
                  ? 'border-danger/30 bg-danger/5'
                  : 'border-warning/30 bg-warning/5',
            ].join(' ')}
          >
            <ResultHead
              matched={queryResult.matched}
              error={queryResult.error}
              text={
                queryResult.error
                  ? `检测失败: ${queryResult.error}`
                  : `条件命中 ${queryResult.matched_count || 0} 条告警${
                      queryResult.threshold
                        ? `，阈值 ${queryResult.threshold}${queryResult.matched ? '（已达阈值）' : '（未达阈值）'}`
                        : ''
                    }`
              }
            />
            {(queryResult.warnings || []).length > 0 && (
              <ul className="mt-1 flex flex-col gap-0.5">
                {queryResult.warnings.map((w: string, i: number) => (
                  <li key={i} className="text-caption text-warning">· {w}</li>
                ))}
              </ul>
            )}
            {queryResult.matched_logs && queryResult.matched_logs.length > 0 && (
              <MatchedLogs logs={queryResult.matched_logs} />
            )}
          </div>
        )}
      </SectionCard>

      {/* 预览数据 */}
      {previewData && (
        <SectionCard icon={Database} title="告警样本预览" padding="sm">
          <div className="flex flex-col gap-3">
            {Object.entries(previewData.sources).map(([srcId, src]: [string, any]) => (
              <div key={srcId} className="rounded-card border border-border-color bg-surface-2 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate-1 text-[12.5px] font-medium text-text-primary">
                    {src.data_source_name}
                  </span>
                  <span className="num shrink-0 text-caption text-text-muted">
                    {typeof src.total_matched === 'number' ? `命中 ${src.total_matched} 条 | ` : ''}
                    样本: {src.sample_count} 条
                  </span>
                </div>
                {src.error ? (
                  <p className="text-caption text-danger">{src.error}</p>
                ) : src.samples.length === 0 ? (
                  <p className="text-caption text-text-muted">当前告警索引里没有符合该规则条件的告警</p>
                ) : (
                  <MatchedLogs logs={src.samples} />
                )}
                {(src.warnings || []).length > 0 && (
                  <ul className="mt-2 flex flex-col gap-0.5">
                    {src.warnings.map((w: string, i: number) => (
                      <li key={i} className="text-caption text-warning">· {w}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 测试结果 */}
      {testResult && (
        <div
          className={[
            'rounded-card border p-3',
            testResult.matched
              ? 'border-success/30 bg-success/5'
              : 'border-danger/30 bg-danger/5',
          ].join(' ')}
        >
          <ResultHead
            matched={testResult.matched}
            error={testResult.error}
            text={
              testResult.error
                ? `测试失败: ${testResult.error}`
                : `条件命中 ${testResult.matched_count} 条告警${
                    testResult.threshold
                      ? `，阈值 ${testResult.threshold}${testResult.matched ? '（已达阈值）' : '（未达阈值）'}`
                      : ''
                  }`
            }
          />
          {(testResult.warnings || []).length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {testResult.warnings!.map((w, i) => (
                <li key={i} className="text-caption text-warning">· {w}</li>
              ))}
            </ul>
          )}
          {testResult.matched_logs && testResult.matched_logs.length > 0 && (
            <MatchedLogs logs={testResult.matched_logs} />
          )}
          {testResult.sources && Object.keys(testResult.sources).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(testResult.sources).map(([id, src]: [string, any]) => (
                <span key={id} className="chip">
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
