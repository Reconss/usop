module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './index.html'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#6366f1',
          hover: '#818cf8',
          dark: '#4f46e5',
        },
        accent: {
          DEFAULT: '#8b5cf6',
          hover: '#a78bfa',
        },
        critical: '#ef4444',
        high: '#f97316',
        medium: '#eab308',
        low: '#3b82f6',
        success: '#10b981',
        'page-bg': 'var(--page-bg)',
        'card-bg': 'var(--card-bg)',
        'card-bg-hover': 'var(--card-bg-hover)',
        'border-color': 'var(--border-color)',
        'border-color-hover': 'var(--border-color-hover)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      fontSize: {
        'page-title': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'card-title': ['18px', { lineHeight: '24px', fontWeight: '500' }],
        'body': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label': ['12px', { lineHeight: '16px', fontWeight: '400' }]
      },
      spacing: {
        'page': '24px',
        'card': '20px',
        'component': '16px'
      },
      borderRadius: {
        'card': '12px',
        'button': '8px',
        'input': '8px'
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0, 0, 0, 0.2)',
        'card-hover': '0 8px 24px rgba(0, 0, 0, 0.3)',
        'neon': '0 0 24px rgba(99, 102, 241, 0.25)',
        'glow': '0 4px 12px rgba(99, 102, 241, 0.3)',
      }
    }
  },
  plugins: []
};
