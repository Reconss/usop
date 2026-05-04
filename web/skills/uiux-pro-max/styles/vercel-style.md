---
name: vercel-style
version: 1.0.0
description: Vercel Inspired Design System - Frontend deployment. Black and white precision, Geist font.
keywords: [Vercel, 部署, 开发者工具, 黑白, 极简, 精确]
author: Design Kungfu
style_type: visual
---

# Vercel Style

## Overview
Vercel 风格以前端部署为核心，通过黑白精确、Geist 字体和极简设计，打造专业开发者平台的视觉体验。适合开发者工具、基础设施营销和单色精确设计。

## Philosophy
Vercel Style 是一种源于 Vercel 品牌的极简设计风格，以其标志性的黑白对比和精确排版著称。通过克制的配色、精致的排版和流畅的动画，传达技术专业性和现代感。

## Design Tokens

### Border
- Width: `border`
- Color: `border-gray-200`
- Radius: `rounded-md`

### Shadow
- Small: `shadow-sm`
- Medium: `shadow-md`
- Large: `shadow-lg`
- Hover: `hover:shadow-lg`

### Typography
- Heading: `font-semibold tracking-tight text-black`
- Body: `text-gray-600`
- Hero: `text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter`
- H1: `text-4xl md:text-5xl font-bold tracking-tight`
- Body: `text-base md:text-lg text-gray-600`
- Font Family: Geist, Inter, system-ui, sans-serif

### Spacing
- Section: `py-20 md:py-32`
- Container: `px-6 md:px-8 max-w-6xl mx-auto`
- Card: `p-6 md:p-8`

### Colors
- Primary BG: `bg-white`
- Secondary BG: `bg-gray-50`
- Dark BG: `bg-black`
- Primary Text: `text-black`
- Secondary Text: `text-gray-600`
- Muted Text: `text-gray-400`
- Primary Button: `bg-black text-white`
- Border: `border-gray-200`

## Component Recipes

### Button
- Base: `font-medium rounded-md transition-all duration-200 inline-flex items-center gap-2`
- Primary: `bg-black text-white hover:bg-gray-800`
- Secondary: `bg-white text-black border border-gray-200 hover:bg-gray-50`
- Ghost: `bg-transparent text-black hover:bg-gray-100`
- Dark: `bg-white text-black hover:bg-gray-100`

- Hover: `hover:opacity-90`
- Size SM: `h-8 px-3 text-sm`
- Size MD: `h-10 px-4`
- Size LG: `h-12 px-6 text-lg`

### Card
- Base: `bg-white rounded-lg border border-gray-200 transition-all duration-200`
- Default: ``
- Elevated: `shadow-md`
- Dark: `bg-gray-900 border-gray-800 text-white`

- Hover: `hover:border-gray-300`

### Input
- Base: `w-full bg-white rounded-md border border-gray-200 text-black placeholder:text-gray-400 focus:outline-none focus:border-gray-400 focus:ring-0 transition-all duration-200`
- Default: ``
- Dark: `bg-gray-900 border-gray-800 text-white placeholder:text-gray-500`

### Heading
- Base: `font-bold tracking-tight text-black`
- Default: `text-black`
- Muted: `text-gray-500`
- Gradient: `bg-gradient-to-r from-black to-gray-500 bg-clip-text text-transparent`

### Badge
- Base: `inline-flex items-center font-medium text-xs rounded-full px-2.5 py-0.5`
- Default: `bg-gray-100 text-gray-800`
- Dark: `bg-gray-800 text-gray-200`
- Outline: `border border-gray-200 text-gray-600`

### Navigation
- Base: `bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 md:px-8 py-3`
- Dark: `bg-black/80 border-gray-800 text-white`

## Forbidden Patterns
These classes must NEVER be used in Vercel Style style:

- `bg-gradient-to-r from-purple`
- `bg-gradient-to-br from-blue`
- `rounded-3xl`
- `shadow-2xl`
- `shadow-inner`
- `border-2`
- `border-4`
- `text-purple-500`
- `text-blue-500`

- Pattern: `^bg-gradient`
- Pattern: `^text-(?:purple|blue|green|red|yellow)-`
- Pattern: `^rounded-(?:3xl|full)`

### Why:
- `bg-gradient-to-r`: Vercel style uses solid black/white/gray colors, not gradients
- `text-purple-500`: Vercel style uses only black, white, and gray colors
- `rounded-3xl`: Vercel style uses moderate rounded corners (rounded-md or rounded-lg)

## Do's
- 使用黑白灰配色方案，保持极简
- 使用 Geist 或 Inter 字体，精确排版
- 使用 tracking-tight 让标题更紧凑
- 使用适中的圆角 rounded-md 或 rounded-lg
- 使用微妙的边框而非阴影来区分元素
- 使用高对比度的黑白配色
- 使用简洁的图标和几何形状
- 使用流畅的过渡动画

## Don'ts
- 禁止使用鲜艳的颜色（紫色、蓝色、绿色等）
- 禁止使用渐变背景
- 禁止使用过大的圆角
- 禁止使用花哨的装饰元素
- 禁止使用过重的阴影
- 禁止忽略排版细节

## Layout Archetypes
- `landing-hero-centered`: Centered headline, subtitle, and CTA. Clean and focused.
- `landing-hero-split`: Text on left, image/visual on right. Great for product showcases.
- `landing-hero-fullscreen`: Full viewport hero with background image or color. High impact.
- `landing-saas-pricing`: Complete SaaS pricing page with hero, pricing tiers, FAQ, and CTA.
- `landing-developer-tools`: Developer-focused landing with code snippets and terminal UI.
- `landing-docs`: Documentation-style layout with sidebar navigation.

## Example Usage

```
Generate a landing page with:
- Style: vercel-style
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "开发者工具落地页"
- "SaaS 产品页面"
- "技术文档站点"
- "基础设施营销页"

---
Design System inspired by Vercel · Integrated into Design Kungfu
Style: Vercel 风格 (Vercel Style)
