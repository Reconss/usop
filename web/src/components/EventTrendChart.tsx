import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { EventTrendData } from '../types';
import { useChartTokens, baseChartOption, axisStyle, alphaOf, SEVERITY_LABELS } from '../styles/chartTheme';

interface EventTrendChartProps {
  data: EventTrendData;
}

const EventTrendChart: React.FC<EventTrendChartProps> = ({ data }) => {
  const t = useChartTokens();

  // 四档严重级别共用一套语义色，图表与页面徽标颜色一致
  const levelSeries = [
    { key: 'critical' as const, color: t.critical, values: data.critical },
    { key: 'high' as const, color: t.high, values: data.high },
    { key: 'medium' as const, color: t.medium, values: data.medium },
    { key: 'low' as const, color: t.low, values: data.low },
  ];

  const base = baseChartOption(t);

  const option = {
    ...base,
    legend: {
      ...base.legend,
      data: levelSeries.map((s) => SEVERITY_LABELS[s.key]),
    },
    grid: { left: 8, right: 16, bottom: 4, top: 30, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.timestamps,
      ...axisStyle(t),
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      ...axisStyle(t),
    },
    series: levelSeries.map((s) => ({
      name: SEVERITY_LABELS[s.key],
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { color: s.color, width: 2 },
      itemStyle: { color: s.color },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: alphaOf(s.color, 0.22) },
            { offset: 1, color: alphaOf(s.color, 0) },
          ],
        },
      },
      data: s.values,
    })),
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: '280px', width: '100%' }}
      notMerge
    />
  );
};

export default EventTrendChart;
