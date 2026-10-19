/**
 * USOP 设计系统 · Tailwind 主题令牌
 * ------------------------------------------------------------------
 * 唯一事实来源：颜色 / 字体 / 字号 / 间距 / 圆角 / 阴影 / 层级 / 动效。
 * 所有页面必须引用这里的语义令牌，不得再写死 `bg-blue-500` 这类调色板颜色。
 *
 * 颜色统一走 CSS 变量通道值（`rgb(var(--c-xxx) / <alpha-value>)`），
 * 这样「深/浅主题切换」与「透明度修饰符 bg-primary/15」可以同时生效。
 * ⚠️ 不要把某个颜色写成 `var(--x)` 或 hex —— 前者会让 `/xx` 静默失效，
 *    后者会让浅色主题失效。
 */

const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './index.html'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* ── 品牌强调色 ────────────────────────────── */
        primary: {
          DEFAULT: c('primary'),                        // #38BDF8 浅色强调（文字/图标/边框/选中）
          hover: c('primary-hover'),
          solid: c('primary-solid'),                    // 实心按钮底色（与白字对比达标）
          'solid-hover': c('primary-solid-hover'),
        },
        accent: {
          DEFAULT: c('accent'),                         // #818CF8 次级强调 / 数据可视化第二色
          hover: c('accent-hover'),
          solid: c('accent-solid'),
          'solid-hover': c('accent-solid-hover'),
        },

        /* ── 语义状态色（含义全局统一，不可跨页漂移）──────── */
        success:  { DEFAULT: c('success'),  solid: c('success-solid') },
        warning:  { DEFAULT: c('warning'),  solid: c('warning-solid') },
        danger:   { DEFAULT: c('danger'),   solid: c('danger-solid') },
        info:     { DEFAULT: c('info'),     solid: c('info-solid') },

        /* ── 严重级别（告警/事件/漏洞共用同一套色）────────── */
        critical: c('sev-critical'),
        high:     c('sev-high'),
        medium:   c('sev-medium'),
        low:      c('sev-low'),

        /* ── 表面 / 文本 / 边框层级 ─────────────────── */
        'page-bg': c('page-bg'),
        'page-bg-subtle': c('bg-subtle'),
        'card-bg': c('surface-1'),
        'card-bg-hover': c('surface-2'),
        surface: c('surface-1'),
        'surface-2': c('surface-2'),
        'surface-3': c('surface-3'),
        'border-color': c('border'),
        'border-color-hover': c('border-hover'),
        'border-strong': c('border-strong'),
        'text-primary': c('text-primary'),
        'text-secondary': c('text-secondary'),
        'text-muted': c('text-muted'),
        'text-inverse': c('text-inverse'),
      },

      /* 补充非 5 倍数的透明度档位，供 /12 /14 这类语义浅底使用 */
      opacity: {
        12: '0.12',
        14: '0.14',
        18: '0.18',
        22: '0.22',
        26: '0.26',
        28: '0.28',
        35: '0.35',
        45: '0.45',
        55: '0.55',
        65: '0.65',
        85: '0.85',
      },

      fontFamily: {
        sans: [
          'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI',
          'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC',
          'Roboto', 'sans-serif'
        ],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },

      fontSize: {
        'display':      ['30px', { lineHeight: '38px', fontWeight: '650', letterSpacing: '-0.02em' }],
        'page-title':   ['22px', { lineHeight: '30px', fontWeight: '600', letterSpacing: '-0.01em' }],
        'section-title':['16px', { lineHeight: '24px', fontWeight: '600' }],
        'card-title':   ['15px', { lineHeight: '22px', fontWeight: '600' }],
        'metric':       ['28px', { lineHeight: '34px', fontWeight: '650', letterSpacing: '-0.02em' }],
        'body':         ['14px', { lineHeight: '21px', fontWeight: '400' }],
        'table':        ['13px', { lineHeight: '19px', fontWeight: '400' }],
        'label':        ['12px', { lineHeight: '18px', fontWeight: '500' }],
        'caption':      ['11px', { lineHeight: '16px', fontWeight: '500' }],
      },

      spacing: {
        'page': '24px',
        'card': '20px',
        'component': '16px',
        'gutter': '24px',
        'sidebar': '260px',
        'sidebar-collapsed': '72px',
        'topbar': '56px',
      },

      maxWidth: {
        'content': '1680px',
        'form': '880px',
      },

      borderRadius: {
        'input': '8px',
        'button': '8px',
        'card': '12px',
        'panel': '16px',
        'pill': '999px',
      },

      boxShadow: {
        'card': '0 1px 2px rgba(2, 6, 23, 0.32)',
        'card-hover': '0 8px 24px -8px rgba(2, 6, 23, 0.5)',
        'panel': '0 16px 40px -16px rgba(2, 6, 23, 0.6)',
        'overlay': '0 24px 64px -20px rgba(2, 6, 23, 0.72)',
        'inset-line': 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
        'focus': '0 0 0 3px var(--focus-ring)',
      },

      transitionDuration: {
        'fast': '120ms',
        'base': '180ms',
        'slow': '260ms',
      },

      transitionTimingFunction: {
        'standard': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'out': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },

      zIndex: {
        'base': '0',
        'sticky': '30',
        'topbar': '40',
        'dropdown': '50',
        'overlay': '60',
        'modal': '70',
        'toast': '80',
      },

      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-plain': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-320px 0' },
          '100%': { backgroundPosition: '320px 0' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },

      animation: {
        'fade-in': 'fade-in 180ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in-plain': 'fade-in-plain 150ms ease-out both',
        'shimmer': 'shimmer 1.4s linear infinite',
        'spin-slow': 'spin-slow 1s linear infinite',
      },
    }
  },
  plugins: []
};
