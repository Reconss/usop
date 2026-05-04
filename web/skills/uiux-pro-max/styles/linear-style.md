---
name: linear-style
version: 1.0.0
description: Linear Inspired Design System - Project management. Ultra-minimal, precise, purple accent.
keywords: [Linear, 项目管理, 极简, 精确, 紫色, SaaS]
author: Design Kungfu
style_type: visual
---

# Linear Style

## Overview
Linear 风格以项目管理为核心，通过超极简设计、精确排版和紫色强调色，打造专业高效的 SaaS 产品体验。适合项目管理工具、超极简深色 UI 和 SaaS 产品页面。

## Philosophy
Linear Style 是一种源于 Linear 的超极简设计风格，以其标志性的深色界面和紫色强调色著称。通过精确的排版、微妙的动画和克制的视觉元素，传达专业性和效率。

## Design Tokens

### Border
- Width: `border`
- Color: `border-gray-800`
- Radius: `rounded-lg`

### Shadow
- Small: `shadow-none`
- Medium: `shadow-lg shadow-black/20`
- Large: `shadow-xl shadow-black/30`
- Glow: `shadow-[0_0_20px_rgba(93,93,255,0.3)]`

### Typography
- Heading: `font-semibold tracking-tight text-white`
- Body: `text-gray-400`
- Hero: `text-5xl md:text-7xl font-bold tracking-tight`
- H1: `text-4xl md:text-5xl font-semibold tracking-tight`
- Body: `text-base text-gray-400`
- Font Family: Inter, SF Pro, system-ui, sans-serif

### Spacing
- Section: `py-20 md:py-32`
- Container: `px-6 md:px-8 max-w-5xl mx-auto`
- Card: `p-6 md:p-8`

### Colors
- Primary BG: `bg-[#0e0e10]`
- Secondary BG: `bg-[#1a1a1e]`
- Elevated BG: `bg-[#232329]`
- Primary Text: `text-white`
- Secondary Text: `text-gray-400`
- Muted Text: `text-gray-500`
- Accent: `text-[#5e6ad2]` / `#5e6ad2`
- Accent Hover: `hover:text-[#6b7bf2]`
- Border: `border-gray-800`

## Component Recipes

### Button
- Base: `font-medium rounded-lg transition-all duration-200 inline-flex items-center gap-2`
- Primary: `bg-[#5e6ad2] text-white hover:bg-[#6b7bf2]`
- Secondary: `bg-[#1a1a1e] text-white border border-gray-700 hover:bg-[#232329]`
- Ghost: `bg-transparent text-gray-400 hover:text-white hover:bg-[#1a1a1e]`
- Danger: `bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20`

- Hover: `hover:opacity-90`
- Size SM: `h-7 px-3 text-sm`
- Size MD: `h-9 px-4`
- Size LG: `h-11 px-5`

### Card
- Base: `bg-[#1a1a1e] rounded-lg border border-gray-800 transition-all duration-200`
- Default: ``
- Elevated: `bg-[#232329]`
- Hover: `hover:border-gray-700 hover:bg-[#232329]`

### Input
- Base: `w-full bg-[#0e0e10] rounded-lg border border-gray-800 text-white placeholder:text-gray-500 focus:outline-none focus:border-[#5e6ad2] focus:ring-1 focus:ring-[#5e6ad2]/20 transition-all duration-200`
- Default: ``

### Heading
- Base: `font-semibold tracking-tight text-white`
- Default: `text-white`
- Muted: `text-gray-400`
- Accent: `text-[#5e6ad2]`

### Badge
- Base: `inline-flex items-center font-medium text-xs rounded-md px-2 py-0.5`
- Default: `bg-[#232329] text-gray-300`
- Accent: `bg-[#5e6ad2]/10 text-[#5e6ad2]`
- Success: `bg-green-500/10 text-green-400`
- Warning: `bg-yellow-500/10 text-yellow-400`

### Navigation
- Base: `bg-[#0e0e10]/80 backdrop-blur-md border-b border-gray-800 px-4 md:px-6 py-3`

## Forbidden Patterns
These classes must NEVER be used in Linear Style style:

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
- `bg-white`: Linear style uses dark backgrounds exclusively
- `text-black`: Linear style uses white text on dark backgrounds
- `rounded-full`: Linear style uses rounded-lg for consistency

## Do's
- 使用深色背景 #0e0e10 作为主背景
- 使用紫色 #5e6ad2 作为强调色
- 使用精确的排版和紧凑的 letter-spacing
- 使用微妙的边框而非阴影来区分元素
- 使用流畅的过渡动画
- 使用极简的图标设计
- 保持界面元素的一致性和可预测性

## Don'ts
- 禁止使用浅色背景
- 禁止使用鲜艳的非品牌颜色
- 禁止使用过大的圆角
- 禁止使用花哨的装饰元素
- 禁止使用过重的阴影
- 禁止忽略动画细节

## Layout Archetypes
- `landing-hero-centered`: Centered headline, subtitle, and CTA. Clean and focused.
- `landing-hero-split`: Text on left, image/visual on right. Great for product showcases.
- `app-dashboard`: Application dashboard with sidebar and main content.
- `app-list-view`: List-based interface with filters and actions.
- `landing-saas-pricing`: Complete SaaS pricing page with hero, pricing tiers, FAQ, and CTA.

## Example Usage

```
Generate a landing page with:
- Style: linear-style
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "项目管理工具界面"
- "SaaS 产品落地页"
- "深色主题应用"
- "效率工具网站"

---
Design System inspired by Linear · Integrated into Design Kungfu
Style: Linear 风格 (Linear Style)
