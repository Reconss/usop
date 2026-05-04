---
name: cyber-chinese
version: 1.0.0
description: Cyber Chinese design style for web interfaces
keywords: [赛博朋克, 中华风, 霓虹, 龙凤, 印章]
author: StyleKit
style_type: visual
---

# Cyber Chinese Style

## Overview
传统中华美学与赛博朋克科幻的碰撞融合，朱红金黄搭配霓虹蓝紫，龙凤印章与霓虹灯笼交织的未来东方幻想。

## Philosophy
Cyber Chinese（赛博中华）是传统中国美学与赛博朋克科幻风格的融合，在暗色基底上用霓虹光效重新演绎东方经典元素。

## Design Tokens

### Border
- Width: `border`
- Color: `border-[#d4553a]/40`
- Radius: `rounded-none`

### Shadow
- Small: `shadow-[0_0_8px_rgba(212,85,58,0.3)] md:shadow-[0_0_12px_rgba(212,85,58,0.3)]`
- Medium: `shadow-[0_0_16px_rgba(212,85,58,0.4)] md:shadow-[0_0_20px_rgba(212,85,58,0.4)]`
- Large: `shadow-[0_0_24px_rgba(212,85,58,0.5)] md:shadow-[0_0_36px_rgba(212,85,58,0.5)]`
- Hover: `hover:shadow-[0_0_24px_rgba(201,162,39,0.6)]`

### Typography
- Heading: `font-bold tracking-wider`
- Body: `font-sans`
- Hero: `text-4xl md:text-6xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#0a0a0a]`
- Secondary BG: `bg-[#0a0a0a]/90`
- Primary Text: `text-[#c9a227]`
- Primary Button: `bg-[#d4553a] text-white border border-[#c9a227]`

## Component Recipes

### Button
- Base: `font-bold tracking-wider rounded-none border transition-all duration-300 ease-in-out`
- Primary: `bg-[#d4553a] text-white border-[#c9a227] shadow-[0_0_16px_rgba(212,85,58,0.5)]`
- Secondary: `bg-[#0a0a0a] text-[#00d4ff] border-[#00d4ff]/50 shadow-[0_0_12px_rgba(0,212,255,0.3)]`
- Outline: `bg-transparent text-[#d4553a] border-[#d4553a]/50 shadow-[0_0_10px_rgba(212,85,58,0.3)]`

- Hover: `hover:shadow-[0_0_24px_rgba(201,162,39,0.6)] hover:border-[#c9a227]`

### Card
- Base: `bg-[#0a0a0a]/90 rounded-none border border-[#d4553a]/40 shadow-[0_0_16px_rgba(212,85,58,0.3)] transition-all duration-300 ease-in-out`
- Default: ``
- Neon: `border-[#00d4ff]/50 shadow-[0_0_16px_rgba(0,212,255,0.3)]`
- Gold: `border-[#c9a227]/50 shadow-[0_0_16px_rgba(201,162,39,0.3)]`

- Hover: `hover:shadow-[0_0_24px_rgba(212,85,58,0.5)] hover:border-[#d4553a]/60`

### Input
- Base: `w-full rounded-none border border-[#c9a227]/40 bg-[#0a0a0a]/80 text-[#00d4ff] placeholder:text-[#c9a227]/40 focus:outline-none transition-all duration-300 ease-in-out`
- Default: ``
- Vermilion: `border-[#d4553a]/50 text-[#d4553a] placeholder:text-[#d4553a]/30`

### Lantern Badge
- Base: `inline-flex items-center justify-center rounded-[15%_15%_40%_40%] border-2 transition-all duration-300 ease-in-out`
- Red: `bg-[#d4553a]/20 border-[#d4553a] text-[#d4553a] shadow-[0_0_16px_rgba(212,85,58,0.5)]`
- Gold: `bg-[#c9a227]/20 border-[#c9a227] text-[#c9a227] shadow-[0_0_16px_rgba(201,162,39,0.5)]`
- Jade: `bg-[#00d4ff]/10 border-[#00d4ff] text-[#00d4ff] shadow-[0_0_16px_rgba(0,212,255,0.5)]`

- Hover: `hover:shadow-[0_0_24px_rgba(212,85,58,0.7)] hover:scale-110`

### Dragon Scroll
- Base: `relative bg-[#0a0a0a]/90 border border-[#c9a227]/30 rounded-sm before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-1 before:bg-gradient-to-r before:from-transparent before:via-[#c9a227]/50 before:to-transparent after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1 after:bg-gradient-to-r after:from-transparent after:via-[#c9a227]/50 after:to-transparent transition-all duration-300 ease-in-out`
- Default: `shadow-[0_0_12px_rgba(201,162,39,0.2)]`
- Imperial: `border-[#d4553a]/40 before:via-[#d4553a]/50 after:via-[#d4553a]/50 shadow-[0_0_16px_rgba(212,85,58,0.3)]`
- Jade: `border-[#00d4ff]/30 before:via-[#00d4ff]/40 after:via-[#00d4ff]/40 shadow-[0_0_16px_rgba(0,212,255,0.2)]`

- Hover: `hover:shadow-[0_0_24px_rgba(201,162,39,0.4)] hover:border-[#c9a227]/50`

### Seal Stamp
- Base: `inline-flex items-center justify-center border-2 rounded-none font-bold rotate-[-2deg] shadow-[inset_1px_1px_0_rgba(255,255,255,0.1),inset_-1px_-1px_0_rgba(0,0,0,0.2)] transition-all duration-300 ease-in-out`
- Red: `bg-[#d4553a]/15 border-[#d4553a] text-[#d4553a] shadow-[0_0_12px_rgba(212,85,58,0.4)]`
- Gold: `bg-[#c9a227]/15 border-[#c9a227] text-[#c9a227] shadow-[0_0_12px_rgba(201,162,39,0.4)]`
- Jade: `bg-[#00d4ff]/10 border-[#00d4ff] text-[#00d4ff] shadow-[0_0_12px_rgba(0,212,255,0.4)]`

- Hover: `hover:shadow-[0_0_20px_rgba(212,85,58,0.6)] hover:scale-105`

### Pagoda Panel
- Base: `relative bg-[#0a0a0a]/90 border border-[#c9a227]/25 rounded-none before:content-[''] before:absolute before:top-0 before:left-[10%] before:right-[10%] before:h-1 before:bg-gradient-to-r before:from-transparent before:via-[#c9a227]/60 before:to-transparent transition-all duration-300 ease-in-out`
- Default: `shadow-[0_0_10px_rgba(201,162,39,0.15)]`
- Imperial: `border-[#d4553a]/30 before:via-[#d4553a]/60 shadow-[0_0_16px_rgba(212,85,58,0.3)]`
- Night: `border-[#00d4ff]/20 before:via-[#00d4ff]/50 shadow-[0_0_16px_rgba(0,212,255,0.2)]`

- Hover: `hover:shadow-[0_0_24px_rgba(201,162,39,0.4)] hover:border-[#c9a227]/40`

### Cloud Motif
- Base: `relative w-full h-px my-6 before:content-[''] before:absolute before:left-1/2 before:-translate-x-1/2 before:-top-1.5 before:w-8 before:h-3 before:rounded-[50%_50%_50%_50%/60%_60%_40%_40%] before:shadow-[12px_-1px_0_4px_currentColor/10,-12px_-1px_0_4px_currentColor/10] transition-all duration-300 ease-in-out`
- Default: `bg-[#c9a227]/30 before:bg-[#c9a227]/20 before:shadow-[0_0_8px_rgba(201,162,39,0.3)] shadow-[0_0_6px_rgba(201,162,39,0.2)]`
- Golden: `bg-[#c9a227]/50 before:bg-[#c9a227]/30 before:shadow-[0_0_10px_rgba(201,162,39,0.5)] shadow-[0_0_8px_rgba(201,162,39,0.3)]`
- Jade: `bg-[#00d4ff]/30 before:bg-[#00d4ff]/20 before:shadow-[0_0_10px_rgba(0,212,255,0.4)] shadow-[0_0_6px_rgba(0,212,255,0.2)]`

- Hover: `hover:shadow-[0_0_12px_rgba(201,162,39,0.4)]`

## Forbidden Patterns
These classes must NEVER be used in Cyber Chinese style:

- `rounded-lg`
- `rounded-xl`
- `rounded-2xl`
- `rounded-3xl`
- `rounded-full`
- `bg-white`
- `bg-gray-50`
- `bg-gray-100`
- `text-black`
- `bg-pink-`

- Pattern: `^rounded-(?:lg|xl|2xl|3xl|full)$`
- Pattern: `^bg-(?:white|gray-[1-3]|pink-|green-|amber-)`
- Pattern: `^text-(?:black|gray-(?:[7-9]))`
- Pattern: `^shadow-\[\d+px_\d+px_0px`

### Why:
- `rounded-lg`: Cyber Chinese uses sharp angular corners (rounded-none) for a futuristic feel
- `rounded-full`: Cyber Chinese avoids soft round shapes in favor of angular design
- `bg-white`: Cyber Chinese uses dark backgrounds with neon and vermilion accents

## Do's
- 使用朱红 #d4553a 和金黄 #c9a227 为主色调
- 搭配霓虹蓝 #00d4ff 和霓虹紫 #a020f0
- 使用直角无圆角的锐利造型
- 添加霓虹发光效果
- 融入中国传统纹样元素（如印章、云纹）
- 深色背景为主基调
- 交互动效保持仪式感：hover 提亮金边与霓虹，active 下压 1-2px
- 可在 hover/focus 使用短时扫描光带或云纹流光，强化东方赛博反馈

## Don'ts
- 禁止使用明亮白色背景
- 禁止使用柔和圆润的造型
- 禁止省略霓虹发光效果
- 禁止使用过于西式的装饰元素
- 禁止使用弹簧回弹、俏皮抖动或大幅缩放动画
- 禁止控制类组件使用超过 400ms 的缓慢过渡

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
- Style: cyber-chinese
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "东方赛博落地页"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 赛博中华风 (Cyber Chinese)