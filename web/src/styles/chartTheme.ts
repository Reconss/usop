/**
 * 图表配色与基础配置 · 设计令牌的运行时读取
 * ==================================================================
 * ECharts / SVG 无法直接使用 Tailwind 类名，必须拿到真实色值。
 * 这里统一从 CSS 令牌（--c-*）读取，保证「图表配色」与「页面配色」同源，
 * 并随深浅主题切换自动更新（MutationObserver 监听 html class）。
 *
 * 页面/组件不要再写死 `#ef4444` 这类色值，统一用 useChartTokens()。
 */
import { useEffect, useState } from 'react';

export interface ChartTokens {
  primary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  critical: string;
  high: string;
  medium: string;
  low: string;
  axis: string;
  grid: string;
  surface: string;
  pageBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  tooltipBg: string;
  tooltipBorder: string;
  /** 图表系列默认取色顺序 */
  series: string[];
  /** 给某个 rgb(...) 色加透明度，返回 rgba(...) */
  alpha: (color: string, a: number) => string;
}

const TOKEN_MAP: Record<string, string> = {
  primary: '--c-primary',
  accent: '--c-accent',
  success: '--c-success',
  warning: '--c-warning',
  danger: '--c-danger',
  info: '--c-info',
  critical: '--c-sev-critical',
  high: '--c-sev-high',
  medium: '--c-sev-medium',
  low: '--c-sev-low',
  axis: '--c-border',
  grid: '--c-border',
  surface: '--c-surface-1',
  pageBg: '--c-page-bg',
  textPrimary: '--c-text-primary',
  textSecondary: '--c-text-secondary',
  textMuted: '--c-text-muted',
  tooltipBg: '--c-surface-2',
  tooltipBorder: '--c-border',
};

/** 深色主题下的兜底值（SSR / 未挂载时） */
const FALLBACK: Record<string, string> = {
  '--c-primary': '56 189 248',
  '--c-accent': '129 140 248',
  '--c-success': '52 211 153',
  '--c-warning': '251 191 36',
  '--c-danger': '251 113 133',
  '--c-info': '96 165 250',
  '--c-sev-critical': '251 113 133',
  '--c-sev-high': '251 146 60',
  '--c-sev-medium': '251 191 36',
  '--c-sev-low': '96 165 250',
  '--c-border': '38 52 73',
  '--c-surface-1': '17 28 48',
  '--c-surface-2': '23 36 58',
  '--c-page-bg': '11 16 32',
  '--c-text-primary': '241 245 249',
  '--c-text-secondary': '148 163 184',
  '--c-text-muted': '100 116 139',
};

const tripletToRgb = (triplet: string): string => {
  const parts = triplet.trim().split(/\s+/).join(', ');
  return `rgb(${parts})`;
};

const parseRgb = (color: string): [number, number, number] => {
  const nums = color.match(/[\d.]+/g);
  if (!nums || nums.length < 3) return [148, 163, 184];
  return [Number(nums[0]), Number(nums[1]), Number(nums[2])];
};

export const alphaOf = (color: string, a: number): string => {
  const [r, g, b] = parseRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

export const readChartTokens = (): ChartTokens => {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  const style = root ? getComputedStyle(root) : null;

  const read = (key: string): string => {
    const varName = TOKEN_MAP[key];
    const raw = style?.getPropertyValue(varName).trim() || FALLBACK[varName] || '148 163 184';
    return tripletToRgb(raw);
  };

  const tokens: ChartTokens = {
    primary: read('primary'),
    accent: read('accent'),
    success: read('success'),
    warning: read('warning'),
    danger: read('danger'),
    info: read('info'),
    critical: read('critical'),
    high: read('high'),
    medium: read('medium'),
    low: read('low'),
    axis: read('axis'),
    grid: read('grid'),
    surface: read('surface'),
    pageBg: read('pageBg'),
    textPrimary: read('textPrimary'),
    textSecondary: read('textSecondary'),
    textMuted: read('textMuted'),
    tooltipBg: read('tooltipBg'),
    tooltipBorder: read('tooltipBorder'),
    series: [],
    alpha: alphaOf,
  };

  tokens.series = [
    tokens.primary,
    tokens.accent,
    tokens.success,
    tokens.warning,
    tokens.danger,
    tokens.info,
  ];

  return tokens;
};

/** 读取令牌并在主题切换时自动刷新 */
export const useChartTokens = (): ChartTokens => {
  const [tokens, setTokens] = useState<ChartTokens>(() => readChartTokens());

  useEffect(() => {
    const refresh = () => setTokens(readChartTokens());
    refresh();

    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return tokens;
};

/** 严重级别 → 令牌（告警/事件图表统一） */
export const SEVERITY_KEYS = ['critical', 'high', 'medium', 'low'] as const;
export type SeverityKey = (typeof SEVERITY_KEYS)[number];

export const SEVERITY_LABELS: Record<SeverityKey, string> = {
  critical: '危急',
  high: '高危',
  medium: '中危',
  low: '低危',
};

/** 风险分档配色（资产风险分、评分环共用同一套语义） */
export const riskToken = (tokens: ChartTokens, score: number): string => {
  if (score >= 80) return tokens.danger;
  if (score >= 60) return tokens.high;
  if (score >= 40) return tokens.medium;
  return tokens.success;
};

/** ECharts 统一基础配置：网格、提示、坐标轴、图例 */
export const baseChartOption = (tokens: ChartTokens) => ({
  backgroundColor: 'transparent',
  grid: { left: 8, right: 12, bottom: 4, top: 28, containLabel: true },
  tooltip: {
    trigger: 'axis' as const,
    backgroundColor: tokens.tooltipBg,
    borderColor: tokens.tooltipBorder,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: tokens.textPrimary, fontSize: 12 },
    axisPointer: {
      type: 'line' as const,
      lineStyle: { color: tokens.axis },
    },
  },
  legend: {
    top: 0,
    icon: 'roundRect',
    itemWidth: 8,
    itemHeight: 8,
    itemGap: 14,
    textStyle: { color: tokens.textSecondary, fontSize: 11 },
  },
  textStyle: { fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif' },
});

export const axisStyle = (tokens: ChartTokens) => ({
  axisLine: { lineStyle: { color: tokens.axis } },
  axisTick: { show: false },
  axisLabel: { color: tokens.textMuted, fontSize: 11 },
  splitLine: { lineStyle: { color: tokens.grid, type: 'dashed' as const } },
});
