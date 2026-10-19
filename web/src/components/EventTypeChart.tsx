import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EventTypeDistribution } from '../types';
import { useChartTokens } from '../styles/chartTheme';

interface EventTypeChartProps {
  data: EventTypeDistribution[];
}

export default function EventTypeChart({ data }: EventTypeChartProps) {
  const t = useChartTokens();

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: t.textPrimary, fontSize: 12 },
    },
    legend: {
      orient: 'vertical',
      right: '4%',
      top: 'center',
      icon: 'roundRect',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 10,
      textStyle: { color: t.textSecondary, fontSize: 11 },
    },
    series: [
      {
        name: '事件类型',
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['34%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 4,
          borderColor: t.surface,
          borderWidth: 2,
        },
        label: { show: false },
        emphasis: {
          label: {
            show: true,
            fontSize: 13,
            fontWeight: 'bold',
            color: t.textPrimary,
          },
          itemStyle: {
            shadowBlur: 12,
            shadowOffsetX: 0,
            shadowColor: t.alpha(t.pageBg, 0.6),
          },
        },
        labelLine: { show: false },
        // 统一使用设计系统系列色（后端返回的装饰性色值不参与视觉决策）
        data: data.map((item, i) => ({
          value: item.value,
          name: item.name,
          itemStyle: { color: t.series[i % t.series.length] },
        })),
      },
    ],
    textStyle: { fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif' },
  };

  return (
    <div className="h-64">
      <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge />
    </div>
  );
}
