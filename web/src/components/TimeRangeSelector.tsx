/**
 * TimeRangeSelector — 时间范围选择器
 *
 * 功能：
 *  - 快捷预设：5m / 15m / 1h / 4h / 24h / 7d / 30d
 *  - 自定义时间范围（起止时间输入）
 *  - 实时滚动开关（自动刷新）
 */

import React, { useState, useRef, useEffect } from 'react';
import { Clock, ChevronDown, Calendar, RefreshCw } from 'lucide-react';
import { Button, Switch } from './ui';

export interface TimeRange {
  start: string;   // ISO 格式
  end: string;
  label: string;   // 显示标签
  preset?: string;  // 预设 key
}

interface PresetOption {
  key: string;
  label: string;
  shortLabel: string;
  getRange: () => TimeRange;
}

const PRESETS: PresetOption[] = [
  {
    key: '5m', label: '最近 5 分钟', shortLabel: '5m',
    getRange: () => ({
      start: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
      label: '5 分钟', preset: '5m'
    }),
  },
  {
    key: '15m', label: '最近 15 分钟', shortLabel: '15m',
    getRange: () => ({
      start: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
      label: '15 分钟', preset: '15m'
    }),
  },
  {
    key: '1h', label: '最近 1 小时', shortLabel: '1h',
    getRange: () => ({
      start: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
      label: '1 小时', preset: '1h'
    }),
  },
  {
    key: '4h', label: '最近 4 小时', shortLabel: '4h',
    getRange: () => ({
      start: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
      label: '4 小时', preset: '4h'
    }),
  },
  {
    key: '24h', label: '最近 24 小时', shortLabel: '24h',
    getRange: () => ({
      start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
      label: '24 小时', preset: '24h'
    }),
  },
  {
    key: '7d', label: '最近 7 天', shortLabel: '7d',
    getRange: () => ({
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
      label: '7 天', preset: '7d'
    }),
  },
  {
    key: '30d', label: '最近 30 天', shortLabel: '30d',
    getRange: () => ({
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
      label: '30 天', preset: '30d'
    }),
  },
];

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  enableAutoRefresh?: boolean;
  onAutoRefreshChange?: (enabled: boolean) => void;
  autoRefreshEnabled?: boolean;
  className?: string;
}

export const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({
  value, onChange, enableAutoRefresh = true,
  onAutoRefreshChange, autoRefreshEnabled = false, className = '',
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setShowCustom(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handlePreset = (preset: PresetOption) => {
    onChange(preset.getRange());
    setShowDropdown(false);
    setShowCustom(false);
  };

  const handleCustomApply = () => {
    if (customStart || customEnd) {
      onChange({
        start: customStart ? new Date(customStart).toISOString() : '',
        end: customEnd ? new Date(customEnd).toISOString() : new Date().toISOString(),
        label: `${customStart || '…'} → ${customEnd || '现在'}`,
      });
      setShowDropdown(false);
      setShowCustom(false);
    }
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div className="flex items-center gap-2">
        {/* 下拉选择器 */}
        <Button
          variant={showDropdown ? 'soft' : 'secondary'}
          size="sm"
          icon={Clock}
          iconRight={ChevronDown}
          onClick={() => setShowDropdown(!showDropdown)}
          aria-expanded={showDropdown}
          title="选择时间范围"
          className="h-[34px]"
        >
          {value.label || '选择时间'}
        </Button>

        {/* 实时滚动开关 */}
        {enableAutoRefresh && (
          <div
            className={`flex items-center gap-2 pl-1 pr-2 h-[34px] text-xs font-medium transition-colors ${
              autoRefreshEnabled ? 'text-success' : 'text-text-muted'
            }`}
            title={autoRefreshEnabled ? '关闭实时滚动' : '开启实时滚动'}
          >
            <Switch
              size="sm"
              checked={autoRefreshEnabled}
              onChange={(next) => onAutoRefreshChange?.(next)}
              label="实时滚动"
            />
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefreshEnabled ? 'animate-spin' : ''}`} />
            实时
          </div>
        )}
      </div>

      {/* 下拉面板 */}
      {showDropdown && (
        <div className="absolute top-full right-0 mt-1 w-72 z-50 overflow-hidden app-card shadow-panel">
          {/* 预设列表 */}
          <div className="p-2">
            <div className="px-3 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wide">
              快捷选择
            </div>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => handlePreset(p)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  value.preset === p.key
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-primary hover:bg-surface-2'
                }`}
              >
                <span>{p.label}</span>
                <span className="text-xs text-text-muted">{p.shortLabel}</span>
              </button>
            ))}
          </div>

          {/* 分割线 */}
          <div className="divider mx-3" />

          {/* 自定义时间 */}
          <div className="p-3">
            <button
              type="button"
              onClick={() => setShowCustom(!showCustom)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-colors"
            >
              <Calendar className="w-4 h-4" />
              <span>自定义时间范围</span>
              <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${showCustom ? 'rotate-180' : ''}`} />
            </button>

            {showCustom && (
              <div className="space-y-3 pt-3">
                <div>
                  <label className="app-label">开始时间</label>
                  <input
                    type="datetime-local"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="app-input"
                  />
                </div>
                <div>
                  <label className="app-label">结束时间</label>
                  <input
                    type="datetime-local"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="app-input"
                  />
                </div>
                <Button variant="primary" block onClick={handleCustomApply}>
                  应用
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeRangeSelector;
