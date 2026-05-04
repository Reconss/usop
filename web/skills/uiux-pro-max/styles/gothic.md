---
name: gothic
version: 1.0.0
description: Gothic design style for web interfaces
keywords: [哥特, 中世纪, 大教堂, 尖拱, 玫瑰窗]
author: StyleKit
style_type: visual
---

# Gothic Style

## Overview
中世纪哥特建筑美学，尖拱、玫瑰窗、手抄本装饰、大教堂氛围。深紫与血红配色，金色装饰线条，充满黑暗而庄严的神秘气息。

## Philosophy
Gothic（哥特式）设计灵感源自中世纪晚期的大教堂建筑和手抄本装饰艺术，强调垂直线条、尖拱结构和精致的装饰纹样。

## Design Tokens

### Border
- Width: `border-2`
- Color: `border-[#c9a227]/40`
- Radius: `rounded-none`

### Shadow
- Small: `shadow-[0_2px_8px_rgba(10,10,10,0.6)]`
- Medium: `shadow-[0_4px_16px_rgba(10,10,10,0.7)]`
- Large: `shadow-[0_8px_30px_rgba(10,10,10,0.8)]`
- Hover: `hover:shadow-[0_6px_24px_rgba(201,162,39,0.4)]`

### Typography
- Heading: `font-serif tracking-wider uppercase`
- Body: `font-serif`
- Hero: `text-4xl md:text-6xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#0a0a0a]`
- Secondary BG: `bg-[#2d1b4e]`
- Primary Text: `text-[#c9a227]`
- Primary Button: `bg-[#2d1b4e] text-[#c9a227] border-2 border-[#c9a227]/60`

## Component Recipes

### Button
- Base: `font-serif uppercase tracking-widest border-2 transition-all duration-300 ease-in-out`
- Primary: `bg-[#2d1b4e] text-[#c9a227] border-[#c9a227]/60 shadow-[0_4px_16px_rgba(45,27,78,0.6)]`
- Secondary: `bg-[#0a0a0a] text-[#8b1a1a] border-[#8b1a1a]/60 shadow-[0_4px_12px_rgba(139,26,26,0.4)]`
- Outline: `bg-transparent text-[#c9a227] border-[#c9a227]/50`

- Hover: `hover:shadow-[0_6px_24px_rgba(201,162,39,0.4)] hover:border-[#c9a227]`

### Card
- Base: `bg-[#0a0a0a]/90 border-2 border-[#c9a227]/40 shadow-[0_4px_20px_rgba(10,10,10,0.8)] transition-all duration-300 ease-in-out`
- Default: ``
- Blood: `border-[#8b1a1a]/50 shadow-[0_4px_20px_rgba(139,26,26,0.3)]`
- Gold: `border-[#c9a227]/60 shadow-[0_4px_20px_rgba(201,162,39,0.3)]`

- Hover: `hover:shadow-[0_8px_30px_rgba(201,162,39,0.3)] hover:border-[#c9a227]/60`

### Input
- Base: `w-full border-2 border-[#c9a227]/30 bg-[#0a0a0a]/80 text-[#c9a227] placeholder:text-[#c9a227]/30 font-serif focus:outline-none transition-all duration-300 ease-in-out`
- Default: ``
- Blood: `border-[#8b1a1a]/50 text-[#8b1a1a] placeholder:text-[#8b1a1a]/30`

### Stone Panel
- Base: `relative bg-gradient-to-b from-[#2a2a2a] to-[#1a1a1a] border-4 border-[#3a3a3a] shadow-[inset_0_2px_4px_rgba(255,255,255,0.1),inset_0_-2px_4px_rgba(0,0,0,0.3)] p-6`
- Default: ``
- Dark: `from-[#1a1a1a] to-[#0a0a0a]`

### Shield Badge
- Base: `inline-flex items-center justify-center px-4 py-2 bg-[#2d1b4e] text-[#c9a227] font-serif uppercase tracking-wider text-sm clip-path-shield`
- Purple: `bg-[#2d1b4e]`
- Blood: `bg-[#8b1a1a]`
- Gold: `bg-[#c9a227] text-[#0a0a0a]`

### Wax Seal
- Base: `inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#8b1a1a] shadow-[inset_0_2px_4px_rgba(255,255,255,0.2),inset_0_-2px_4px_rgba(0,0,0,0.3),0_4px_8px_rgba(0,0,0,0.5)]`
- Default: ``

### Tracery Divider
- Base: `relative w-full h-8 flex items-center justify-center`
- Default: ``

### Illuminated Initial
- Base: `inline-block text-6xl font-serif font-bold text-[#c9a227] float-left mr-2 leading-none`
- Gold: `text-[#c9a227] drop-shadow-[0_2px_4px_rgba(201,162,39,0.5)]`
- Blood: `text-[#8b1a1a] drop-shadow-[0_2px_4px_rgba(139,26,26,0.5)]`

### Parchment Card
- Base: `relative bg-gradient-to-br from-[#f5f0e1] to-[#e5d9c3] p-6 shadow-lg`
- Default: ``
- Aged: `from-[#e5d9c3] to-[#d4c4a8]`

## Forbidden Patterns
These classes must NEVER be used in Gothic style:

- `rounded-full`
- `rounded-xl`
- `rounded-2xl`
- `rounded-3xl`
- `bg-white`
- `bg-gray-50`
- `bg-gray-100`
- `text-pink-`
- `text-green-`
- `text-blue-`

- Pattern: `^rounded-(?:full|xl|2xl|3xl)$`
- Pattern: `^bg-(?:white|gray-|pink-|green-|blue-)`
- Pattern: `^text-(?:pink-|green-|blue-)`

### Why:
- `rounded-full`: Gothic uses sharp angular edges, not rounded shapes
- `bg-white`: Gothic uses dark backgrounds, never bright white
- `text-pink-`: Gothic uses gold, blood red, and deep purple, not pink

## Do's
- 使用深紫、血红、黑色为主色调
- 添加金色装饰线条和边框
- 使用衬线字体传达古典感
- 营造黑暗、神秘的氛围
- 使用尖拱形状和哥特式图案
- 添加精致的装饰纹样
- 交互以缓慢光影增强为主，保持庄严厚重感

## Don'ts
- 禁止使用明亮欢快的配色
- 禁止使用圆润可爱的元素
- 禁止使用现代无衬线字体作为主标题
- 禁止使用过于简约的设计
- 禁止快速抖动、弹性跳动等轻浮动效

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
- Style: gothic
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "中世纪图书馆页面"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 哥特式风 (Gothic)