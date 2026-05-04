import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EventTypeDistribution } from '../types';

interface EventTypeChartProps {
  data: EventTypeDistribution[];
}

export default function EventTypeChart({ data }: EventTypeChartProps) {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      setIsLight(document.documentElement.classList.contains('light'));
    };
    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(20, 20, 24, 0.95)',
      borderColor: isLight ? '#e4e4e7' : '#27272e',
      textStyle: { color: isLight ? '#18181b' : '#fafafa' }
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      textStyle: { color: isLight ? '#52525b' : '#a1a1aa', fontSize: 12 },
      itemWidth: 12,
      itemHeight: 12
    },
    series: [
      {
        name: '事件类型',
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 6,
          borderColor: isLight ? '#ffffff' : '#141418',
          borderWidth: 2
        },
        label: {
          show: false
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold',
            color: isLight ? '#18181b' : '#fafafa'
          },
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: isLight ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.5)'
          }
        },
        labelLine: {
          show: false
        },
        data: data.map(item => ({
          value: item.value,
          name: item.name,
          itemStyle: { color: item.color }
        }))
      }
    ]
  };

  return (
    <div className="h-64">
      <ReactECharts
        option={option}
        style={{ height: '100%', width: '100%' }}
        theme={isLight ? 'light' : 'dark'}
      />
    </div>
  );
}
