---
name: solarpunk
version: 1.0.0
description: Solarpunk design style for web interfaces
keywords: [生态未来, 可持续, 绿色科技, 植物, 太阳能]
author: StyleKit
style_type: visual
---

# Solarpunk Style

## Overview
乐观的生态未来主义风格，融合自然与科技的和谐美学。有机曲线、植物元素、温暖渐变、柔和圆角。适合环保、可持续发展、绿色科技产品。

## Philosophy
Solarpunk 风格源自对未来的乐观想象，描绘人与自然和谐共存的世界。通过有机曲线、植物元素和温暖色调传递希望与生机。

## Design Tokens

### Border
- Width: `border`
- Color: `border-green-200`
- Radius: `rounded-2xl`

### Shadow
- Small: `shadow-md shadow-green-100/40`
- Medium: `shadow-lg shadow-green-200/40`
- Large: `shadow-xl shadow-green-200/50`
- Hover: `shadow-xl shadow-green-300/50`

### Typography
- Heading: `font-bold`
- Body: `font-sans`
- Hero: `text-4xl md:text-6xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-16 md:py-24`
- Container: `px-4 md:px-8`
- Card: `p-6`

### Colors
- Primary BG: `bg-[#f0fdf4]`
- Secondary BG: `bg-[#fef3c7]`
- Primary Text: `text-gray-800`
- Primary Button: `bg-gradient-to-r from-green-400 to-emerald-500 text-white`

## Component Recipes

### Button
- Base: `font-medium rounded-2xl transition-all duration-300`
- Primary: `bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-lg shadow-green-300/40`
- Secondary: `bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-900 shadow-lg shadow-amber-300/40`
- Outline: `bg-transparent text-green-600 border-2 border-green-400`

- Hover: `hover:shadow-xl hover:shadow-green-300/50 hover:scale-105`

### Card
- Base: `bg-white/80 backdrop-blur-sm border border-green-200 rounded-3xl transition-all duration-300`
- Default: `shadow-lg shadow-green-100/50`
- Golden: `border-amber-200 shadow-lg shadow-amber-100/50`
- Sky: `border-sky-200 shadow-lg shadow-sky-100/50`

- Hover: `hover:shadow-xl hover:shadow-green-200/40 hover:border-green-300`

### Input
- Base: `w-full bg-white/80 backdrop-blur-sm border border-green-200 rounded-2xl text-gray-800 placeholder:text-green-300 focus:outline-none transition-all duration-300`
- Default: ``
- Golden: `border-amber-200 text-amber-800 placeholder:text-amber-300`

### Leaf Panel
- Base: `bg-white/80 backdrop-blur-sm border border-green-300 rounded-[60%_40%_70%_30%/40%_60%_30%_70%] bg-[linear-gradient(135deg,rgba(34,197,94,0.05)_0%,transparent_50%,rgba(34,197,94,0.03)_100%)] transition-all duration-300`
- Default: `shadow-lg shadow-green-100/50`
- Lush: `bg-gradient-to-br from-green-50 to-emerald-50 border-emerald-400 shadow-lg shadow-emerald-100/50 rounded-[70%_30%_60%_40%/30%_70%_40%_60%]`
- Minimal: `bg-white/60 border-green-200 shadow-sm rounded-[50%_50%_50%_50%/60%_60%_40%_40%]`

- Hover: `hover:shadow-xl hover:shadow-green-200/40 hover:border-green-400`

### Solar Progress
- Base: `w-full h-4 rounded-full bg-gray-200/60 overflow-hidden border border-green-300/30 [&>div]:rounded-full transition-all duration-500`
- Solar: `[&>div]:bg-[repeating-linear-gradient(90deg,#f59e0b_0px,#f59e0b_18px,#1a1a1a_18px,#1a1a1a_20px)] shadow-inner shadow-amber-100`
- Wind: `[&>div]:bg-[repeating-linear-gradient(90deg,#38bdf8_0px,#38bdf8_18px,#1a1a1a_18px,#1a1a1a_20px)] shadow-inner shadow-sky-100`
- Water: `[&>div]:bg-[repeating-linear-gradient(90deg,#22c55e_0px,#22c55e_18px,#1a1a1a_18px,#1a1a1a_20px)] shadow-inner shadow-green-100`

### Eco Alert
- Base: `relative bg-white/80 backdrop-blur-sm border-l-0 rounded-r-2xl pl-5 p-4 md:p-5 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-gradient-to-b before:from-green-500 before:via-emerald-400 before:to-sky-400 before:rounded-full transition-all duration-300`
- Info: `border-sky-400 bg-sky-50/80 text-sky-800 before:from-sky-400 before:via-sky-500 before:to-blue-400`
- Growth: `border-green-500 bg-green-50/80 text-green-800 before:from-green-500 before:via-emerald-400 before:to-green-600`
- Warning: `border-amber-400 bg-amber-50/80 text-amber-800 before:from-amber-400 before:via-yellow-500 before:to-orange-400`

- Hover: `hover:shadow-md hover:shadow-green-100/30`

## Forbidden Patterns
These classes must NEVER be used in Solarpunk style:

- `bg-black`
- `bg-gray-950`
- `bg-gray-900`
- `bg-[#0a0a0f]`
- `rounded-none`
- `rounded-sm`
- `text-cyan-400`
- `shadow-[0_0_20px`

- Pattern: `^bg-gray-9`
- Pattern: `^bg-black`
- Pattern: `^rounded-none`
- Pattern: `^rounded-sm$`
- Pattern: `shadow-\[0_0_\d+px_rgba`

### Why:
- `bg-black`: Solarpunk uses warm, light backgrounds only
- `bg-gray-950`: Dark backgrounds violate the optimistic eco aesthetic
- `rounded-none`: Use organic rounded corners (rounded-2xl or rounded-3xl)

## Do's
- 背景使用温暖浅色 bg-[#fef3c7] 或 bg-green-50
- 主色调使用叶绿 text-green-400 或 bg-green-400
- 强调色使用金黄 text-amber-400 或 bg-amber-400
- 使用大圆角 rounded-2xl 或 rounded-3xl 体现有机感
- 使用温暖渐变 bg-gradient-to-br from-green-400 to-amber-400
- 卡片添加植物主题装饰元素
- 使用柔和阴影 shadow-lg shadow-green-200/50

## Don'ts
- 禁止使用纯黑背景或暗色主题
- 禁止使用尖锐直角 rounded-none
- 禁止使用冷酷工业风元素
- 禁止使用高对比度霓虹发光效果
- 禁止使用反乌托邦、废土元素
- 禁止使用灰暗压抑的配色方案

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
- Style: solarpunk
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "生态仪表盘"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 太阳朋克 (Solarpunk)