import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EventTrendData } from '../types';

interface EventTrendChartProps {
  data: EventTrendData;
}

const EventTrendChart: React.FC<EventTrendChartProps> = ({ data }) => {
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
    backgroundColor: 'transparent',
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '10%',
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(20, 20, 24, 0.95)',
      borderColor: isLight ? '#e4e4e7' : '#27272e',
      textStyle: {
        color: isLight ? '#18181b' : '#fafafa'
      }
    },
    legend: {
      data: ['危急', '高危', '中危', '低危'],
      textStyle: {
        color: isLight ? '#52525b' : '#a1a1aa'
      },
      top: 0
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.timestamps,
      axisLine: {
        lineStyle: {
          color: isLight ? '#e4e4e7' : '#27272e'
        }
      },
      axisLabel: {
        color: isLight ? '#52525b' : '#71717a'
      }
    },
    yAxis: {
      type: 'value',
      axisLine: {
        lineStyle: {
          color: isLight ? '#e4e4e7' : '#27272e'
        }
      },
      axisLabel: {
        color: isLight ? '#52525b' : '#71717a'
      },
      splitLine: {
        lineStyle: {
          color: isLight ? '#f4f4f5' : '#27272e'
        }
      }
    },
    series: [
      {
        name: '危急',
        type: 'line',
        smooth: true,
        data: data.critical,
        lineStyle: { color: '#ef4444', width: 2 },
        itemStyle: { color: '#ef4444' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(239, 68, 68, 0.25)' },
              { offset: 1, color: 'rgba(239, 68, 68, 0)' }
            ]
          }
        }
      },
      {
        name: '高危',
        type: 'line',
        smooth: true,
        data: data.high,
        lineStyle: { color: '#f97316', width: 2 },
        itemStyle: { color: '#f97316' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(249, 115, 22, 0.25)' },
              { offset: 1, color: 'rgba(249, 115, 22, 0)' }
            ]
          }
        }
      },
      {
        name: '中危',
        type: 'line',
        smooth: true,
        data: data.medium,
        lineStyle: { color: '#eab308', width: 2 },
        itemStyle: { color: '#eab308' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(234, 179, 8, 0.25)' },
              { offset: 1, color: 'rgba(234, 179, 8, 0)' }
            ]
          }
        }
      },
      {
        name: '低危',
        type: 'line',
        smooth: true,
        data: data.low,
        lineStyle: { color: '#3b82f6', width: 2 },
        itemStyle: { color: '#3b82f6' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59, 130, 246, 0.25)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0)' }
            ]
          }
        }
      }
    ]
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: '280px', width: '100%' }}
      theme={isLight ? 'light' : 'dark'}
    />
  );
};

export default EventTrendChart;
