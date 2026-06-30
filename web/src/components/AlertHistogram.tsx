/**
 * AlertHistogram — 时间分布柱状图
 *
 * 功能：
 *  - 调用 date_histogram API 渲染时间分布柱状图
 *  - 纯 SVG/div 实现，无额外图表库依赖
 *  - 点击柱子缩放时间范围
 *  - 自适应宽度 + hover tooltip
 */

import React, { useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Loader2 } from 'lucide-react';

interface HistogramBucket {
  key: string;       // 时间标签 "2024-01-01 00:00:00"
  count: number;
}

interface AlertHistogramProps {
  data: HistogramBucket[];
  loading?: boolean;
  onBucketClick?: (start: string, end: string) => void;
  className?: string;
  height?: number;
}

export const AlertHistogram: React.FC<AlertHistogramProps> = ({
  data, loading, onBucketClick, className = '', height = 160,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { maxCount, barWidth, gap } = useMemo(() => {
    const max = Math.max(...data.map(d => d.count), 1);
    const count = data.length;
    const bw = count > 0 ? Math.max(Math.min((100 / count) * 0.75, 40), 2) : 10;
    const g = count > 0 ? Math.max(Math.min((100 / count) * 0.25, 8), 1) : 2;
    return { maxCount: max, barWidth: bw, gap: g };
  }, [data]);

  const formatTime = useCallback((key: string) => {
    try {
      const d = new Date(key);
      if (data.length <= 24) {
        return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    } catch {
      return key;
    }
  }, [data.length]);

  const formatFullTime = useCallback((key: string) => {
    try {
      return new Date(key).toLocaleString('zh-CN');
    } catch {
      return key;
    }
  }, []);

  const handleBarClick = (index: number) => {
    if (!onBucketClick || data.length === 0) return;
    const bucket = data[index];
    const start = new Date(bucket.key).toISOString();
    // 结束时间为下一个 bucket 或 start + 间隔
    let end: string;
    if (index < data.length - 1) {
      end = new Date(data[index + 1].key).toISOString();
    } else {
      const startDate = new Date(bucket.key);
      if (data.length >= 2) {
        const interval = new Date(data[1].key).getTime() - new Date(data[0].key).getTime();
        end = new Date(startDate.getTime() + interval).toISOString();
      } else {
        end = new Date(startDate.getTime() + 60 * 60 * 1000).toISOString();
      }
    }
    onBucketClick(start, end);
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-page-bg rounded-xl border border-border-color ${className}`}
           style={{ height }}>
        <Loader2 className="w-5 h-5 text-text-muted animate-spin" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center bg-page-bg rounded-xl border border-border-color ${className}`}
           style={{ height }}>
        <BarChart3 className="w-8 h-8 text-text-muted/30 mb-2" />
        <span className="text-xs text-text-muted">暂无数据</span>
      </div>
    );
  }

  return (
    <div className={`relative bg-page-bg rounded-xl border border-border-color overflow-hidden ${className}`}>
      {/* 图表区域 */}
      <div className="flex items-end px-3 pb-2 pt-3" style={{ height }}>
        {data.map((bucket, i) => {
          const pct = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
          const barH = Math.max(pct, 2);
          const isHovered = hoveredIndex === i;

          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end h-full px-[1px] cursor-pointer group relative"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => handleBarClick(i)}
            >
              {/* Tooltip */}
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs
                             px-3 py-2 rounded-lg shadow-lg whitespace-nowrap z-20 pointer-events-none"
                >
                  <div className="font-medium">{bucket.count.toLocaleString()} 条告警</div>
                  <div className="text-gray-400 mt-0.5">{formatFullTime(bucket.key)}</div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4
                                  border-t-4 border-l-transparent border-r-transparent border-t-gray-900" />
                </motion.div>
              )}

              {/* 柱子 */}
              <div
                className={`w-full rounded-t-sm transition-all duration-150 min-h-[2px]
                  ${isHovered ? 'bg-primary shadow-lg shadow-primary/20' : 'bg-primary/60 group-hover:bg-primary/80'}
                `}
                style={{ height: `${barH}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* X 轴标签（稀疏显示） */}
      <div className="flex px-3 pb-1.5 border-t border-border-color/50">
        {data.map((bucket, i) => {
          const showLabel = data.length <= 12 || i % Math.ceil(data.length / 6) === 0;
          return (
            <div key={i} className="flex-1 text-center">
              {showLabel && (
                <span className="text-[10px] text-text-muted">{formatTime(bucket.key)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AlertHistogram;
