import React from 'react';

/**
 * USOP 品牌标识（与站点 favicon 同源）
 *
 * 图形语义：盾形（安全底座）× 中心靶心（运营监控焦点）
 * 矢量源文件：web/public/brand/usop-mark-mini.svg（唯一权威图形，全尺寸通用）
 * 变体源：web/public/brand/usop-mark.svg（含 Y 形三源汇流的完整版，仅作大尺寸备选，当前未启用）
 *
 * variant:
 *  - "mark" 实心品牌渐变盾（favicon 同源），独立使用无需底板
 *  - "line" 线框风格，stroke 继承 currentColor，用于 bg-primary/12 等浅底容器
 */
interface BrandMarkProps {
  size?: number;
  variant?: 'mark' | 'line';
  className?: string;
  style?: React.CSSProperties;
}

const SHIELD_PATH =
  'M32 4 L56 12.8 V32.5 C56 45.2 46.4 54.8 32 60 C17.6 54.8 8 45.2 8 32.5 V12.8 Z';

export default function BrandMark({
  size = 32,
  variant = 'line',
  className,
  style,
}: BrandMarkProps) {
  const uid = React.useId().replace(/:/g, '');

  if (variant === 'mark') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role="img"
        aria-label="USOP"
        className={className}
        style={style}
      >
        <defs>
          <linearGradient
            id={`usop-grad-${uid}`}
            x1="8"
            y1="4"
            x2="56"
            y2="60"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#38BDF8" />
            <stop offset="1" stopColor="#818CF8" />
          </linearGradient>
        </defs>
        <path d={SHIELD_PATH} fill={`url(#usop-grad-${uid})`} />
        <circle cx="32" cy="32.5" r="7.6" fill="#0B1020" />
        <circle cx="32" cy="32.5" r="2.7" fill="#38BDF8" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="USOP"
      className={className}
      style={style}
      fill="none"
    >
      <path d={SHIELD_PATH} stroke="currentColor" strokeWidth="4.2" strokeLinejoin="round" />
      <circle cx="32" cy="32.5" r="7.4" stroke="currentColor" strokeWidth="3.6" />
      <circle cx="32" cy="32.5" r="2.6" fill="currentColor" />
    </svg>
  );
}
