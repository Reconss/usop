---
name: framer-style
version: 1.0.0
description: Framer Inspired Design System - Website builder. Bold black and blue, motion-first, design-forward.
keywords: [Framer, 网站构建器, 黑色, 蓝色, 动效, 设计]
author: Design Kungfu
style_type: visual
---

# Framer Style

## Overview
Framer 风格以网站构建器为核心，通过大胆的黑色和蓝色配色、动效优先的设计，打造设计前卫的产品体验。适合网站构建器、动效优先设计和深色电影感 UI。

## Philosophy
Framer Style 是一种源于 Framer 的设计优先风格，以其标志性的黑蓝配色和动效驱动的界面著称。通过大胆的视觉语言、流畅的动画和专业的排版，传达设计的力量。

## Design Tokens

### Border
- Width: `border`
- Color: `border-gray-800`
- Radius: `rounded-xl`

### Shadow
- Small: `shadow-none`
- Medium: `shadow-lg shadow-black/30`
- Large: `shadow-xl shadow-black/40`
- Glow: `shadow-[0_0_40px_rgba(0,102,255,0.3)]`

### Typography
- Heading: `font-bold tracking-tight text-white`
- Body: `text-gray-400`
- Hero: `text-5xl md:text-7xl font-bold tracking-tighter`
- H1: `text-4xl md:text-5xl font-bold tracking-tight`
- Body: `text-base text-gray-400`
- Font Family: Inter, system-ui, sans-serif

### Spacing
- Section: `py-20 md:py-32`
- Container: `px-6 md:px-8 max-w-6xl mx-auto`
- Card: `p-6 md:p-8`

### Colors
- Primary BG: `bg-black`
- Secondary BG: `bg-[#111]`
- Elevated BG: `bg-[#1a1a1a]`
- Primary Text: `text-white`
- Secondary Text: `text-gray-400`
- Muted Text: `text-gray-500`
- Framer Blue: `#0066ff`
- Framer Blue Light: `#3d8bff`
- Border: `border-gray-800`

## Component Recipes

### Button
- Base: `font-semibold rounded-xl transition-all duration-200 inline-flex items-center gap-2`
- Primary: `bg-[#0066ff] text-white hover:bg-[#3d8bff]`
- Secondary: `bg-[#1a1a1a] text-white border border-gray-700 hover:bg-[#222]`
- Ghost: `bg-transparent text-gray-400 hover:text-white`
- White: `bg-white text-black hover:bg-gray-100`

- Hover: `hover:scale-[1.02]`
- Size SM: `h-9 px-4 text-sm`
- Size MD: `h-11 px-5`
- Size LG: `h-14 px-8 text-lg`

### Card
- Base: `bg-[#1a1a1a] rounded-xl border border-gray-800 transition-all duration-200`
- Default: ``
- Blue: `bg-[#0066ff]/10 border-[#0066ff]/30`
- Hover: `hover:border-gray-700 hover:bg-[#222]`

### Input
- Base: `w-full bg-[#111] rounded-xl border border-gray-800 text-white placeholder:text-gray-500 focus:outline-none focus:border-[#0066ff] focus:ring-1 focus:ring-[#0066ff]/20 transition-all duration-200`
- Default: ``

### Heading
- Base: `font-bold tracking-tight text-white`
- Default: `text-white`
- Muted: `text-gray-500`
- Blue: `text-[#0066ff]`
- Gradient: `bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent`

### Badge
- Base: `inline-flex items-center font-medium text-xs rounded-lg px-2.5 py-1`
- Default: `bg-[#222] text-gray-300`
- Blue: `bg-[#0066ff]/10 text-[#0066ff]`
- New: `bg-[#0066ff] text-white`

### Navigation
- Base: `bg-black/80 backdrop-blur-md border-b border-gray-800 px-4 md:px-6 py-4`

## Forbidden Patterns
These classes must NEVER be used in Framer Style style:

- `bg-white` (as main background)
- `text-black` (as main text)
- `bg-gradient-to-r from-pink`
- `bg-gradient-to-br from-purple`
- `rounded-full`
- `shadow-2xl`
- `border-gray-200`

- Pattern: `^bg-white`
- Pattern: `^text-black`
- Pattern: `^border-gray-(?:100|200|300)`

### Why:
- `bg-white`: Framer style uses dark backgrounds exclusively
- `text-black`: Framer style uses white text on dark backgrounds
- `rounded-full`: Framer style uses rounded-xl for consistency

## Do's
- 使用黑色背景 #000 作为主背景
- 使用 Framer 蓝 #0066ff 作为强调色
- 使用大胆的排版和紧凑的 tracking
- 使用适中的圆角 rounded-xl
- 使用微妙的边框而非阴影来区分元素
- 使用流畅的动效和过渡
- 使用电影感的视觉语言

## Don'ts
- 禁止使用浅色背景作为主背景
- 禁止使用非品牌颜色
- 禁止使用过大的圆角
- 禁止使用花哨的装饰元素
- 禁止使用过重的阴影
- 禁止忽略动效的重要性

## Layout Archetypes
- `landing-hero-centered`: Centered headline, subtitle, and CTA.
- `site-builder`: Website builder interface with canvas.
- `template-showcase`: Template showcase with previews.
- `feature-motion`: Feature section with motion demos.
- `landing-saas-pricing`: Complete SaaS pricing page.

## Example Usage

```
Generate a landing page with:
- Style: framer-style
- Archetype: landing-hero-centered
- Sections: hero, features, site-demo, cta, footer
- Components: heading (hero variant), button (primary, lg), card (blue)
```

### Example Prompts:
- "网站构建器营销页"
- "动效优先设计"
- "深色电影感 UI"
- "设计工具网站"

---
Design System inspired by Framer · Integrated into Design Kungfu
Style: Framer 风格 (Framer Style)
