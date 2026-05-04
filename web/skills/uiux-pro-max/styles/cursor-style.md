---
name: cursor-style
version: 1.0.0
description: Cursor Inspired Design System - AI-first code editor. Sleek dark interface, gradient accents.
keywords: [Cursor, AI, 代码编辑器, 深色, 渐变, 开发者工具]
author: Design Kungfu
style_type: visual
---

# Cursor Style

## Overview
Cursor 风格以 AI 优先的代码编辑器为核心，通过时尚的深色界面和渐变强调色，打造智能的开发者工具体验。适合代码编辑器 UI、开发者工具营销和深色渐变设计。

## Philosophy
Cursor Style 是一种源于 Cursor 的 AI 优先设计风格，以其标志性的深色界面和渐变强调色著称。通过智能代码编辑、流畅的交互和专业的视觉语言，传达 AI 增强的开发体验。

## Design Tokens

### Border
- Width: `border`
- Color: `border-gray-800`
- Radius: `rounded-lg`

### Shadow
- Small: `shadow-none`
- Medium: `shadow-lg shadow-black/30`
- Large: `shadow-xl shadow-black/40`
- Glow: `shadow-[0_0_30px_rgba(99,102,241,0.2)]`

### Typography
- Heading: `font-semibold tracking-tight text-white`
- Body: `text-gray-400`
- Code: `font-mono text-sm`
- Hero: `text-4xl md:text-6xl font-bold tracking-tight`
- H1: `text-3xl md:text-4xl font-semibold tracking-tight`
- Body: `text-base text-gray-400`
- Font Family: Inter, system-ui, sans-serif
- Font Family Mono: "JetBrains Mono", "Fira Code", monospace

### Spacing
- Section: `py-16 md:py-24`
- Container: `px-6 md:px-8 max-w-6xl mx-auto`
- Card: `p-5 md:p-6`

### Colors
- Primary BG: `bg-[#0c0c0c]`
- Secondary BG: `bg-[#181818]`
- Elevated BG: `bg-[#242424]`
- Primary Text: `text-white`
- Secondary Text: `text-gray-400`
- Muted Text: `text-gray-500`
- Accent: `text-[#6366f1]` / `#6366f1`
- Accent Gradient: `from-[#6366f1] to-[#8b5cf6]`
- Border: `border-gray-800`

## Component Recipes

### Button
- Base: `font-medium rounded-lg transition-all duration-200 inline-flex items-center gap-2`
- Primary: `bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white hover:opacity-90`
- Secondary: `bg-[#181818] text-white border border-gray-700 hover:bg-[#242424]`
- Ghost: `bg-transparent text-gray-400 hover:text-white hover:bg-[#181818]`

- Hover: `hover:opacity-90`
- Size SM: `h-8 px-3 text-sm`
- Size MD: `h-10 px-4`
- Size LG: `h-12 px-6`

### Card
- Base: `bg-[#181818] rounded-lg border border-gray-800 transition-all duration-200`
- Default: ``
- Code: `bg-[#0c0c0c] border-gray-800 font-mono`
- Hover: `hover:border-gray-700`

### Input
- Base: `w-full bg-[#0c0c0c] rounded-lg border border-gray-800 text-white placeholder:text-gray-500 focus:outline-none focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1]/20 transition-all duration-200`
- Default: ``

### Code Block
- Base: `bg-[#0c0c0c] rounded-lg border border-gray-800 p-4 overflow-x-auto font-mono text-sm`
- Syntax: Use dark theme syntax highlighting with purple/blue accents

### Heading
- Base: `font-semibold tracking-tight text-white`
- Default: `text-white`
- Muted: `text-gray-400`
- Accent: `text-[#6366f1]`
- Gradient: `bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] bg-clip-text text-transparent`

### Badge
- Base: `inline-flex items-center font-medium text-xs rounded-md px-2 py-0.5`
- Default: `bg-[#242424] text-gray-300`
- Accent: `bg-[#6366f1]/10 text-[#6366f1]`
- AI: `bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white`

### Navigation
- Base: `bg-[#0c0c0c]/90 backdrop-blur-md border-b border-gray-800 px-4 md:px-6 py-3`

### AI Suggestion
- Base: `bg-[#181818] border-l-2 border-[#6366f1] pl-4 py-2 text-gray-300`
- Inline: `bg-[#6366f1]/10 text-[#6366f1] px-1 rounded`

## Forbidden Patterns
These classes must NEVER be used in Cursor Style style:

- `bg-white`
- `text-black`
- `bg-gradient-to-r from-pink`
- `bg-gradient-to-br from-orange`
- `rounded-full`
- `shadow-2xl`
- `border-gray-200`

- Pattern: `^bg-white`
- Pattern: `^text-black`
- Pattern: `^border-gray-(?:100|200|300)`

### Why:
- `bg-white`: Cursor style uses dark backgrounds exclusively
- `text-black`: Cursor style uses white text on dark backgrounds
- `rounded-full`: Cursor style uses rounded-lg for consistency

## Do's
- 使用深色背景 #0c0c0c 作为主背景
- 使用紫蓝渐变 #6366f1 到 #8b5cf6 作为强调色
- 使用等宽字体展示代码
- 使用 AI 建议的视觉提示
- 使用适中的圆角 rounded-lg
- 使用微妙的边框而非阴影来区分元素
- 使用流畅的过渡动画
- 使用专业的开发者视觉语言

## Don'ts
- 禁止使用浅色背景
- 禁止使用非品牌颜色
- 禁止使用过大的圆角
- 禁止使用花哨的装饰元素
- 禁止使用过重的阴影
- 禁止忽略 AI 功能的展示

## Layout Archetypes
- `landing-hero-centered`: Centered headline, subtitle, and CTA.
- `code-editor`: Code editor interface with AI suggestions.
- `app-dashboard`: Application dashboard with sidebar.
- `docs-layout`: Documentation layout with code examples.
- `landing-saas-pricing`: Complete SaaS pricing page.

## Example Usage

```
Generate a landing page with:
- Style: cursor-style
- Archetype: landing-hero-centered
- Sections: hero, features, code-demo, cta, footer
- Components: heading (hero variant), button (primary, lg), card (code), code-block
```

### Example Prompts:
- "AI 代码编辑器界面"
- "开发者工具营销页"
- "智能编程助手"
- "深色渐变设计"

---
Design System inspired by Cursor · Integrated into Design Kungfu
Style: Cursor 风格 (Cursor Style)
