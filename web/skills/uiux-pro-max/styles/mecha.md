---
name: mecha
version: 1.0.0
description: Mecha design style for web interfaces
keywords: [机甲, 高达, EVA, 科技面板, 警告]
author: StyleKit
style_type: visual
---

# Mecha Style

## Overview
灵感源自高达/EVA等机甲动画的设计风格，科技面板、警告标识、机械质感，军绿和深蓝底色搭配警告黄和危险红，充满工业力量感。

## Philosophy
Mecha（机甲风）是源自日本机甲动画（高达、EVA等）的设计美学，融合军事工业风和科幻面板界面。

## Design Tokens

### Border
- Width: `border-2`
- Color: `border-[#4a5c3a]`
- Radius: `rounded-none`

### Shadow
- Small: `shadow-[2px_2px_0px_rgba(251,191,36,0.3)]`
- Medium: `shadow-[4px_4px_0px_rgba(251,191,36,0.3)]`
- Large: `shadow-[6px_6px_0px_rgba(251,191,36,0.4)]`
- Hover: `hover:shadow-[6px_6px_0px_rgba(251,191,36,0.5)]`

### Typography
- Heading: `font-mono font-bold uppercase tracking-widest`
- Body: `font-mono`
- Hero: `text-4xl md:text-6xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#1a2744]`
- Secondary BG: `bg-[#4a5c3a]`
- Primary Text: `text-[#fbbf24]`
- Primary Button: `bg-[#fbbf24] text-[#1a2744] border-2 border-[#1a2744]`

## Component Recipes

### Button
- Base: `font-mono font-bold uppercase tracking-widest rounded-none transition-all duration-200 ease-in-out`
- Primary: `bg-[#fbbf24] text-[#1a2744] border-2 border-[#1a2744] shadow-[4px_4px_0px_#1a2744]`
- Secondary: `bg-[#4a5c3a] text-[#fbbf24] border-2 border-[#fbbf24]/50`
- Outline: `bg-transparent text-[#ef4444] border-2 border-[#ef4444] shadow-[3px_3px_0px_#ef4444]`

- Hover: `hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#1a2744]`

### Card
- Base: `bg-[#1a2744] rounded-none border-2 border-[#4a5c3a] shadow-[4px_4px_0px_rgba(251,191,36,0.3)] transition-all duration-200 ease-in-out`
- Default: ``
- Warning: `border-[#fbbf24] shadow-[4px_4px_0px_rgba(239,68,68,0.4)]`
- Danger: `border-[#ef4444] shadow-[4px_4px_0px_rgba(239,68,68,0.5)]`

- Hover: `hover:shadow-[6px_6px_0px_rgba(251,191,36,0.5)] hover:border-[#fbbf24]`

### Input
- Base: `w-full rounded-none border-2 border-[#4a5c3a] bg-[#1a2744]/80 text-[#fbbf24] placeholder:text-[#4a5c3a]/60 font-mono uppercase focus:outline-none transition-all duration-200 ease-in-out`
- Default: ``
- Alert: `border-[#ef4444] text-[#ef4444] placeholder:text-[#ef4444]/40`

### Hazard Stripe
- Base: `h-2 bg-[repeating-linear-gradient(45deg,#fbbf24_0px,#fbbf24_10px,#1a2744_10px,#1a2744_20px)]`
- Default: ``

### Military Panel
- Base: `relative bg-[#1a2744] border-2 border-[#4a5c3a] p-4 [clip-path:polygon(0_0,calc(100%-16px)_0,100%_16px,100%_100%,16px_100%,0_calc(100%-16px))] overflow-hidden`
- Default: `border-[#4a5c3a]`
- Warning: `border-[#fbbf24]`
- Danger: `border-[#ef4444]`
- Info: `border-[#3b82f6]`

### Status Bar
- Base: `relative h-6 bg-[#1a2744] border border-[#4a5c3a] bg-[repeating-linear-gradient(90deg,transparent_0px,transparent_18px,#1a2744_18px,#1a2744_20px)]`
- HP: `[&>.fill]:bg-[#22c55e]`
- Shield: `[&>.fill]:bg-[#3b82f6]`
- Energy: `[&>.fill]:bg-[#fbbf24]`

### Toggle Switch
- Base: `relative w-16 h-8 bg-[#1a2744] border-4 border-[#4a5c3a] rounded-none transition-all duration-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]`
- Default: ``

### Rank Badge
- Base: `inline-flex items-center gap-1 px-3 py-1 font-mono text-xs uppercase tracking-widest border-2 [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]`
- Solid: `bg-[#fbbf24] text-[#1a2744] border-[#1a2744]`
- Outline: `bg-transparent text-[#fbbf24] border-[#fbbf24]`
- Glow: `bg-[#22c55e] text-white border-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.5)]`

### Diagnostics Row
- Base: `border-b border-[#4a5c3a]/30 font-mono text-sm`
- Online: `[&_.status]:bg-[#22c55e] [&_.status]:animate-pulse`
- Offline: `[&_.status]:bg-[#ef4444]`
- Standby: `[&_.status]:bg-[#fbbf24]`

### Checkbox Array
- Base: `grid grid-cols-2 gap-2`
- Default: ``

## Forbidden Patterns
These classes must NEVER be used in Mecha style:

- `rounded-lg`
- `rounded-xl`
- `rounded-2xl`
- `rounded-full`
- `bg-white`
- `bg-[#faf6f0]`
- `bg-[#fffbf0]`
- `font-serif`
- `text-[#ff00ff]`
- `text-[#00ffff]`

- Pattern: `^rounded-(?:lg|xl|2xl|full)$`
- Pattern: `^bg-(?:white|pink-|rose-)`
- Pattern: `^font-serif$`
- Pattern: `^shadow-(?:md|lg|xl)$`
- Pattern: `^backdrop-blur`

### Why:
- `rounded-lg`: Mecha uses sharp angular shapes (rounded-none) for an industrial feel
- `bg-white`: Mecha uses dark backgrounds (navy, green) for a military aesthetic
- `font-serif`: Mecha uses monospace fonts for a technical/military look

## Do's
- 使用军绿、深蓝海军色为底色
- 添加警告黄和危险红的强调色
- 使用等宽字体和大写字母
- 设计直角无圆角的面板元素
- 添加技术标注和编号装饰
- 使用硬边阴影和边框线条

## Don'ts
- 禁止使用柔和的圆角设计
- 禁止使用柔和的粉色或浅色调
- 禁止使用花哨的渐变或毛玻璃效果
- 禁止使用手写体或花体字

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
- Style: mecha
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "机甲控制台"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 机甲风 (Mecha)