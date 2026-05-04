---
name: supabase-style
version: 1.0.0
description: Supabase Inspired Design System - Open-source Firebase alternative. Dark emerald theme, code-first.
keywords: [Supabase, 开源, 数据库, 深绿, 开发者工具, 深色主题]
author: Design Kungfu
style_type: visual
---

# Supabase Style

## Overview
Supabase 风格以开源 Firebase 替代方案为核心，通过深翠绿主题和代码优先的设计，打造开发者友好的平台体验。适合后端即服务、深色开发者门户和开源项目站点。

## Philosophy
Supabase Style 是一种源于 Supabase 的开发者优先设计风格，以其标志性的深翠绿配色和代码友好的界面著称。通过深色背景、清晰的代码展示和开源友好的视觉语言，传达技术实力。

## Design Tokens

### Border
- Width: `border`
- Color: `border-gray-800`
- Radius: `rounded-lg`

### Shadow
- Small: `shadow-none`
- Medium: `shadow-lg shadow-black/30`
- Large: `shadow-xl shadow-black/40`
- Glow: `shadow-[0_0_30px_rgba(62,207,142,0.2)]`

### Typography
- Heading: `font-semibold tracking-tight text-white`
- Body: `text-gray-400`
- Code: `font-mono text-sm`
- Hero: `text-5xl md:text-7xl font-bold tracking-tight`
- H1: `text-4xl md:text-5xl font-semibold tracking-tight`
- Body: `text-base text-gray-400`
- Font Family: Inter, system-ui, sans-serif
- Font Family Mono: "Fira Code", "Monaco", "Consolas", monospace

### Spacing
- Section: `py-20 md:py-32`
- Container: `px-6 md:px-8 max-w-6xl mx-auto`
- Card: `p-6 md:p-8`

### Colors
- Primary BG: `bg-[#1c1c1c]`
- Secondary BG: `bg-[#232323]`
- Elevated BG: `bg-[#2a2a2a]`
- Primary Text: `text-white`
- Secondary Text: `text-gray-400`
- Muted Text: `text-gray-500`
- Accent: `text-[#3ecf8e]` / `#3ecf8e`
- Accent Hover: `hover:text-[#4dd99a]`
- Border: `border-gray-800`

## Component Recipes

### Button
- Base: `font-medium rounded-lg transition-all duration-200 inline-flex items-center gap-2`
- Primary: `bg-[#3ecf8e] text-[#1c1c1c] hover:bg-[#4dd99a]`
- Secondary: `bg-[#232323] text-white border border-gray-700 hover:bg-[#2a2a2a]`
- Ghost: `bg-transparent text-gray-400 hover:text-white hover:bg-[#232323]`
- Outline: `bg-transparent text-[#3ecf8e] border border-[#3ecf8e] hover:bg-[#3ecf8e]/10`

- Hover: `hover:opacity-90`
- Size SM: `h-8 px-3 text-sm`
- Size MD: `h-10 px-4`
- Size LG: `h-12 px-6 text-lg`

### Card
- Base: `bg-[#232323] rounded-lg border border-gray-800 transition-all duration-200`
- Default: ``
- Elevated: `bg-[#2a2a2a]`
- Code: `bg-[#1a1a1a] border-gray-800`
- Hover: `hover:border-gray-700 hover:bg-[#2a2a2a]`

### Input
- Base: `w-full bg-[#1c1c1c] rounded-lg border border-gray-800 text-white placeholder:text-gray-500 focus:outline-none focus:border-[#3ecf8e] focus:ring-1 focus:ring-[#3ecf8e]/20 transition-all duration-200`
- Default: ``

### Code Block
- Base: `bg-[#1a1a1a] rounded-lg border border-gray-800 p-4 overflow-x-auto`
- Syntax: Use dark theme syntax highlighting

### Heading
- Base: `font-semibold tracking-tight text-white`
- Default: `text-white`
- Muted: `text-gray-400`
- Accent: `text-[#3ecf8e]`

### Badge
- Base: `inline-flex items-center font-medium text-xs rounded-md px-2 py-0.5`
- Default: `bg-[#2a2a2a] text-gray-300`
- Accent: `bg-[#3ecf8e]/10 text-[#3ecf8e]`
- Beta: `bg-yellow-500/10 text-yellow-400`
- New: `bg-blue-500/10 text-blue-400`

### Navigation
- Base: `bg-[#1c1c1c]/80 backdrop-blur-md border-b border-gray-800 px-4 md:px-6 py-3`

## Forbidden Patterns
These classes must NEVER be used in Supabase Style style:

- `bg-white`
- `text-black`
- `bg-gradient-to-r from-pink`
- `bg-gradient-to-br from-purple`
- `rounded-full`
- `shadow-2xl`
- `border-gray-200`

- Pattern: `^bg-white`
- Pattern: `^text-black`
- Pattern: `^border-gray-(?:100|200|300)`

### Why:
- `bg-white`: Supabase style uses dark backgrounds exclusively
- `text-black`: Supabase style uses white text on dark backgrounds
- `rounded-full`: Supabase style uses rounded-lg for consistency

## Do's
- 使用深色背景 #1c1c1c 作为主背景
- 使用翠绿色 #3ecf8e 作为强调色
- 使用等宽字体展示代码
- 使用清晰的代码块样式
- 使用适中的圆角 rounded-lg
- 使用微妙的边框而非阴影来区分元素
- 使用流畅的过渡动画
- 使用开源友好的视觉语言

## Don'ts
- 禁止使用浅色背景
- 禁止使用鲜艳的非品牌颜色
- 禁止使用过大的圆角
- 禁止使用花哨的装饰元素
- 禁止使用过重的阴影
- 禁止忽略代码展示的重要性

## Layout Archetypes
- `landing-hero-centered`: Centered headline, subtitle, and CTA. Clean and focused.
- `landing-hero-split`: Text on left, code example on right. Great for developer tools.
- `app-dashboard`: Application dashboard with sidebar and main content.
- `docs-layout`: Documentation layout with navigation and content.
- `landing-saas-pricing`: Complete SaaS pricing page with hero, pricing tiers, FAQ, and CTA.

## Example Usage

```
Generate a landing page with:
- Style: supabase-style
- Archetype: landing-hero-split
- Sections: hero, features, code-examples, cta, footer
- Components: heading (hero variant), button (primary, lg), card (code), code-block
```

### Example Prompts:
- "开发者工具落地页"
- "开源项目网站"
- "数据库平台界面"
- "API 文档站点"

---
Design System inspired by Supabase · Integrated into Design Kungfu
Style: Supabase 风格 (Supabase Style)
