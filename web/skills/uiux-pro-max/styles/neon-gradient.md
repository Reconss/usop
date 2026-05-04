---
name: neon-gradient
version: 1.0.0
description: Neon Gradient design style for web interfaces
keywords: [霓虹, 渐变, 深色, 发光, 科技]
author: StyleKit
style_type: visual
---

# Neon Gradient Style

## Overview
深色背景上的鲜艳渐变卡片，配合粗彩色边框和霓虹发光效果，适合科技产品、SaaS 着陆页、年轻化品牌。

## Philosophy
Neon Gradient（霓虹渐变）是一种大胆、现代的设计风格，在深色背景上使用鲜艳的渐变色卡片和粗彩色边框，营造出未来感和科技感。

## Design Tokens

### Border
- Width: `border-4`
- Color: `border-yellow-400`
- Radius: `rounded-2xl`

### Shadow
- Small: `shadow-[0_0_15px_rgba(168,85,247,0.3)]`
- Medium: `shadow-[0_0_30px_rgba(168,85,247,0.4)]`
- Large: `shadow-[0_0_40px_rgba(168,85,247,0.6)]`
- Hover: `hover:shadow-[0_0_40px_rgba(168,85,247,0.6)]`

### Typography
- Heading: `font-bold text-white`
- Body: `text-white/80`
- Hero: `text-4xl md:text-6xl lg:text-7xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-16 md:py-24`
- Container: `px-4 md:px-8`
- Card: `p-6 md:p-8`

### Colors
- Primary BG: `bg-[#0f0a1e]`
- Secondary BG: `bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500`
- Primary Text: `text-white`
- Primary Button: `bg-gradient-to-r from-cyan-400 to-pink-500 text-white`

## Component Recipes

### Button
- Base: `font-bold rounded-xl transition-all duration-300`
- Primary: `bg-gradient-to-r from-cyan-400 to-pink-500 text-white border-2 border-white/20 shadow-[0_0_20px_rgba(236,72,153,0.5)]`
- Secondary: `bg-transparent text-white border-2 border-cyan-400`
- Gradient: `bg-gradient-to-r from-cyan-400 via-green-400 to-yellow-400 text-black border-2 border-pink-400 shadow-[0_0_20px_rgba(34,211,238,0.4)]`
- Icon: `w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 border-2 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.4)] flex items-center justify-center`

- Hover: `hover:shadow-[0_0_30px_rgba(236,72,153,0.7)] hover:scale-105`

### Card
- Base: `rounded-2xl md:rounded-3xl border-4 transition-all duration-300`
- Purple Pink: `bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500 border-yellow-400 shadow-[0_0_30px_rgba(168,85,247,0.4)]`
- Cyan Green: `bg-gradient-to-br from-cyan-400 via-teal-500 to-green-500 border-pink-400 shadow-[0_0_30px_rgba(34,211,238,0.4)]`
- Pink Rose: `bg-gradient-to-br from-pink-500 via-rose-500 to-red-500 border-cyan-400 shadow-[0_0_30px_rgba(236,72,153,0.4)]`
- Yellow Green: `bg-gradient-to-br from-yellow-400 via-green-400 to-cyan-400 border-purple-500 shadow-[0_0_30px_rgba(250,204,21,0.4)]`

- Hover: `hover:shadow-[0_0_40px_rgba(168,85,247,0.6)] hover:-translate-y-2`

### Input
- Base: `w-full px-5 py-4 bg-white/5 border-2 border-purple-500/50 rounded-xl text-white placeholder:text-white/40 focus:outline-none transition-all duration-300`
- Default: ``
- With Button: `pr-24`

### Navigation
- Base: `bg-[#0f0a1e]/80 backdrop-blur-xl border-b border-purple-500/20 px-4 md:px-8 py-4`
- Default: ``

### Badge
- Base: `inline-flex items-center gap-2 px-4 py-2 border-2 border-dashed rounded-full text-sm font-medium`
- Yellow: `border-yellow-400 text-yellow-400`
- Cyan: `border-cyan-400 text-cyan-400`
- Pink: `border-pink-400 text-pink-400`

### Floating Card
- Base: `rounded-2xl border-4 p-5 absolute`
- Purple Pink: `bg-gradient-to-br from-purple-500 to-pink-500 border-yellow-400 shadow-[0_0_30px_rgba(168,85,247,0.5)]`
- Cyan Green: `bg-gradient-to-br from-green-400 to-cyan-400 border-pink-400 shadow-[0_0_30px_rgba(34,211,238,0.5)]`
- Pink Rose: `bg-gradient-to-br from-pink-500 to-rose-500 border-cyan-400 shadow-[0_0_30px_rgba(236,72,153,0.5)]`

### Decorator
- Base: `absolute`
- Star: `text-yellow-400 animate-pulse`
- Rocket: `text-pink-400`
- Sparkles: `text-cyan-400 animate-bounce`

## Forbidden Patterns
These classes must NEVER be used in Neon Gradient style:

- `bg-white`
- `bg-gray-50`
- `bg-gray-100`
- `bg-slate-50`
- `bg-gray-500`
- `text-gray-500`
- `border`
- `border-2`
- `rounded-none`
- `rounded-sm`

- Pattern: `^bg-white$`
- Pattern: `^bg-gray-[0-2]00$`
- Pattern: `^rounded-none$`
- Pattern: `^rounded-sm$`
- Pattern: `^rounded$`

### Why:
- `bg-white`: Neon Gradient uses dark background bg-[#0f0a1e]
- `rounded-none`: Neon Gradient uses large rounded corners (rounded-2xl or rounded-3xl)
- `rounded-sm`: Neon Gradient uses large rounded corners (rounded-2xl or rounded-3xl)

## Do's
- 使用深色背景 bg-[#0f0a1e] 或 bg-slate-900
- 卡片使用渐变填充 bg-gradient-to-br from-purple-500 to-pink-500
- 添加粗彩色边框 border-4 border-yellow-400
- 使用圆角 rounded-2xl 或 rounded-3xl
- 添加发光阴影 shadow-[0_0_30px_rgba(168,85,247,0.5)]
- 标题使用渐变文字或纯白色
- 装饰元素使用 Lucide 图标（Star, Rocket, Sparkles）
- 按钮使用渐变背景 + 发光效果

## Don'ts
- 禁止使用浅色背景
- 禁止使用低饱和度颜色
- 禁止使用细边框 border 或 border-2
- 禁止使用灰色调卡片
- 禁止省略发光效果
- 禁止使用 emoji（用 Lucide 图标替代）

## Layout Archetypes
- `landing-hero-centered`: Centered headline, subtitle, and CTA. Clean and focused.
- `landing-hero-split`: Text on left, image/visual on right. Great for product showcases.
- `landing-hero-fullscreen`: Full viewport hero with background image or color. High impact.
- `landing-video-hero`: Full-screen video background with overlay text. High impact for product demos.
- `landing-saas-pricing`: Complete SaaS pricing page with hero, pricing tiers, FAQ, and CTA.
- `landing-waitlist`: Minimal pre-launch page with email collection and countdown.

## Example Usage

```
Generate a landing page with:
- Style: neon-gradient
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "SaaS 产品着陆页"
- "开发者工具页面"
- "游戏平台首页"

---
Generated by StyleKit · https://stylekit.dev
Style: 霓虹渐变 (Neon Gradient)