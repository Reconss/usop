/**
 * TimeRangeSelector — 时间范围选择器
 *
 * 功能：
 *  - 快捷预设：15m / 1h / 4h / 24h / 7d / 30d
 *  - 自定义时间范围（起止时间输入）
 *  - 实时滚动开关（自动刷新）
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ChevronDown, Calendar, RefreshCw, X } from 'lucide-react';

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
    key: '90d', label: '最近 24 小时', shortLabel: '24h',
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

  // 判断当前选中的预设
  const activePreset = PRESETS.find(p => p.key === value.preset);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div className="flex items-center gap-2">
        {/* 预设快捷按钮 — 紧凑模式 */}
        <div className="flex items-center bg-page-bg border border-border-color rounded-lg overflow-hidden">
          {PRESETS.filter(p => ['15m', '1h', '4h', '24h', '7d'].includes(p.key)).map((p) => (
            <button
              key={p.key}
              onClick={() => handlePreset(p)}
              className={`px-3 py-1.5 text-xs font-medium transition-all border-r border-border-color last:border-r-0
                ${value.preset === p.key
                  ? 'bg-primary/15 text-primary'
                  : 'text-text-muted hover:text-text-secondary hover:bg-white/5'
                }`}
            >
              {p.shortLabel}
            </button>
          ))}
        </div>

        {/* 下拉选择器 */}
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-3 py-1.5 bg-page-bg border border-border-color rounded-lg
                     text-text-secondary hover:border-primary/40 transition-all text-xs"
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{value.label || '选择时间'}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
        </button>

        {/* 实时滚动开关 */}
        {enableAutoRefresh && (
          <button
            onClick={() => onAutoRefreshChange?.(!autoRefreshEnabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all
              ${autoRefreshEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-page-bg border-border-color text-text-muted hover:text-text-secondary'
              }`}
            title={autoRefreshEnabled ? '关闭实时滚动' : '开启实时滚动'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefreshEnabled ? 'animate-spin' : ''}`} />
            实时
          </button>
        )}
      </div>

      {/* 下拉面板 */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute top-full right-0 mt-1 w-72 bg-card-bg border border-border-color
                       rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            {/* 预设列表 */}
            <div className="p-2">
              <div className="px-3 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wide">
                快捷选择
              </div>
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => handlePreset(p)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors
                    ${value.preset === p.key
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-primary hover:bg-white/5'
                    }`}
                >
                  <span>{p.label}</span>
                  <span className="text-xs text-text-muted">{p.shortLabel}</span>
                </button>
              ))}
            </div>

            {/* 分割线 */}
            <div className="border-t border-border-color mx-3" />

            {/* 自定义时间 */}
            <div className="p-3">
              <button
                onClick={() => setShowCustom(!showCustom)}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-text-secondary
                           hover:bg-white/5 transition-colors"
              >
                <Calendar className="w-4 h-4" />
                <span>自定义时间范围</span>
                <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${showCustom ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showCustom && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 pt-3">
                      <div>
                        <label className="block text-xs text-text-muted mb-1">开始时间</label>
                        <input
                          type="datetime-local"
                          value={customStart}
                          onChange={(e) => setCustomStart(e.target.value)}
                          className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary
                                     text-sm focus:border-primary focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1">结束时间</label>
                        <input
                          type="datetime-local"
                          value={customEnd}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary
                                     text-sm focus:border-primary focus:outline-none"
                        />
                      </div>
                      <button
                        onClick={handleCustomApply}
                        className="w-full py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/90 transition-colors"
                      >
                        应用
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TimeRangeSelector;
