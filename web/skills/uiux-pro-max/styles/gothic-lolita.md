---
name: gothic-lolita
version: 1.0.0
description: Gothic Lolita design style for web interfaces
keywords: [哥特, 萝莉塔, 维多利亚, 蕾丝, 暗黑优雅]
author: StyleKit
style_type: visual
---

# Gothic Lolita Style

## Overview
维多利亚蕾丝、黑色缎带、十字架与玫瑰的暗黑优雅，融合哥特式建筑装饰与洛丽塔精致细节的暗色浪漫美学。

## Philosophy
Gothic Lolita（哥特萝莉）是一种融合维多利亚时代与哥特美学的视觉风格，起源于日本街头时尚。

## Design Tokens

### Border
- Width: `border`
- Color: `border-[#4a1a4a]/50`
- Radius: `rounded-sm`

### Shadow
- Small: `shadow-[0_2px_6px_rgba(74,26,74,0.3)] md:shadow-[0_2px_8px_rgba(74,26,74,0.3)]`
- Medium: `shadow-[0_4px_12px_rgba(74,26,74,0.4)] md:shadow-[0_4px_16px_rgba(74,26,74,0.4)]`
- Large: `shadow-[0_8px_20px_rgba(139,26,42,0.4)] md:shadow-[0_8px_28px_rgba(139,26,42,0.4)]`
- Hover: `hover:shadow-[0_8px_24px_rgba(139,26,42,0.5)]`

### Typography
- Heading: `font-serif tracking-wide`
- Body: `font-serif`
- Hero: `text-4xl md:text-6xl lg:text-7xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#0a0a0a]`
- Secondary BG: `bg-[#1a0a1a]`
- Primary Text: `text-[#e5e5e5]`
- Primary Button: `bg-[#4a1a4a] text-[#e5e5e5] border border-[#8b1a2a]/60`

## Component Recipes

### Button
- Base: `font-serif tracking-wide rounded-sm border transition-all duration-300 ease-in-out`
- Primary: `bg-[#4a1a4a] text-[#e5e5e5] border-[#8b1a2a]/60 shadow-[0_2px_8px_rgba(75,26,75,0.5)]`
- Secondary: `bg-[#0a0a0a] text-[#e5e5e5] border-[#4a1a4a]/60 shadow-[0_2px_8px_rgba(10,10,10,0.5)]`
- Outline: `bg-transparent text-[#8b1a2a] border-[#8b1a2a]/50 shadow-[0_1px_4px_rgba(139,26,42,0.3)]`

- Hover: `hover:shadow-[0_4px_16px_rgba(139,26,42,0.5)] hover:border-[#8b1a2a]`

### Card
- Base: `bg-[#0a0a0a]/90 rounded-sm border border-[#4a1a4a]/50 shadow-[0_4px_16px_rgba(74,26,74,0.4)] transition-all duration-300 ease-in-out`
- Default: ``
- Rose: `border-[#8b1a2a]/50 shadow-[0_4px_16px_rgba(139,26,42,0.3)]`
- Silver: `border-[#e5e5e5]/30 shadow-[0_4px_16px_rgba(229,229,229,0.15)]`

- Hover: `hover:shadow-[0_8px_24px_rgba(139,26,42,0.4)] hover:border-[#8b1a2a]/60`

### Input
- Base: `w-full rounded-sm border border-[#4a1a4a]/50 bg-[#0a0a0a]/80 text-[#e5e5e5] placeholder:text-[#4a1a4a]/60 font-serif focus:outline-none transition-all duration-300 ease-in-out`
- Default: ``
- Rose: `border-[#8b1a2a]/50 text-[#e5e5e5] placeholder:text-[#8b1a2a]/40`

### Lace Panel
- Base: `relative bg-[#0a0a0a]/95 border-2 border-[#4a1a4a] p-6`
- Default: ``
- Rose: `border-[#8b1a2a]`

### Ribbon Badge
- Base: `inline-flex items-center px-4 py-1 bg-[#4a1a4a] text-[#e5e5e5] font-serif text-sm relative`
- Default: `bg-[#4a1a4a]`
- Rose: `bg-[#8b1a2a]`
- Silver: `bg-[#e5e5e5]/20 border border-[#e5e5e5]/40`

### Rosette Badge
- Base: `inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#8b1a2a] text-[#e5e5e5] font-serif font-bold shadow-[0_0_0_4px_#4a1a4a,0_0_0_6px_#8b1a2a]`
- Default: ``

### Rosary Progress
- Base: `flex items-center gap-2`
- Default: ``

### Lace Divider
- Base: `w-full h-px bg-gradient-to-r from-transparent via-[#4a1a4a] to-transparent relative`
- Default: ``
- Rose: `via-[#8b1a2a]`

### Ornate Dropdown
- Base: `relative bg-[#0a0a0a] border border-[#4a1a4a] shadow-[0_4px_16px_rgba(74,26,74,0.4)]`
- Default: ``

- Hover: `hover:border-[#8b1a2a]`

## Forbidden Patterns
These classes must NEVER be used in Gothic Lolita style:

- `rounded-full`
- `rounded-xl`
- `rounded-2xl`
- `rounded-3xl`
- `bg-white`
- `bg-gray-50`
- `bg-gray-100`
- `text-black`
- `bg-pink-`
- `bg-yellow-`

- Pattern: `^rounded-(?:full|xl|2xl|3xl)$`
- Pattern: `^bg-(?:white|gray-[1-3]|pink-|yellow-|green-|blue-)`
- Pattern: `^text-(?:black|pink-|yellow-|green-)`

### Why:
- `rounded-full`: Gothic Lolita uses sharp corners (rounded-sm) for a Victorian architectural feel
- `bg-white`: Gothic Lolita uses dark backgrounds with deep purple and red accents
- `text-black`: Gothic Lolita uses silver-white text on dark backgrounds

## Do's
- 使用黑色深色为主背景
- 搭配深紫 #4a1a4a 和血红 #8b1a2a 点缀
- 使用装饰性衬线字体
- 添加蕾丝花边、缎带等装饰元素
- 使用哥特式对称花纹或十字架图案
- 保持精致典雅的整体氛围

## Don'ts
- 禁止使用明亮鲜艳的颜色
- 禁止使用可爱卡通风格元素
- 禁止使用现代极简设计
- 禁止使用过于圆润的形状

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
- Style: gothic-lolita
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "暗色优雅落地页"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 哥特萝莉风 (Gothic Lolita)