---
name: cottagecore
version: 1.0.0
description: Cottagecore design style for web interfaces
keywords: [田园, 乡村, 花卉, 刺绣, 蘑菇]
author: StyleKit
style_type: visual
---

# Cottagecore Style

## Overview
田园乡村美学，花卉图案、刺绣质感、蘑菇元素和温馨家庭感。柔和的衬线字体、圆润边角、温暖自然的配色，唤起对简单田园生活的向往。

## Philosophy
Cottagecore（田园核）是一种浪漫化田园乡村生活的美学运动，起源于2010年代末的互联网文化。

## Design Tokens

### Border
- Width: `border`
- Color: `border-[#d4a0a0]/40`
- Radius: `rounded-2xl`

### Shadow
- Small: `shadow-sm`
- Medium: `shadow-md`
- Large: `shadow-lg`
- Hover: `hover:shadow-lg`

### Typography
- Heading: `font-serif text-[#8b7355]`
- Body: `font-serif`
- Hero: `text-4xl md:text-6xl lg:text-7xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#faf6f0]`
- Secondary BG: `bg-[#f5d75f]/10`
- Primary Text: `text-[#8b7355]`
- Primary Button: `bg-[#5a8f5a] text-white`

## Component Recipes

### Button
- Base: `font-serif rounded-full transition-all duration-300 ease-in-out`
- Primary: `bg-[#5a8f5a] text-white shadow-md`
- Secondary: `bg-[#f5d75f]/20 text-[#8b7355] border border-[#8b7355]/40`
- Outline: `bg-transparent text-[#5a8f5a] border-2 border-[#5a8f5a]/50`

- Hover: `hover:shadow-lg hover:scale-105`

### Card
- Base: `bg-[#faf6f0] rounded-2xl border border-[#d4a0a0]/40 shadow-md transition-all duration-300 ease-in-out`
- Default: ``
- Floral: `border-[#d4a0a0]/60 bg-gradient-to-br from-[#faf6f0] to-[#f5d75f]/10`
- Earthy: `border-[#8b7355]/40 bg-gradient-to-br from-[#faf6f0] to-[#8b7355]/10`

- Hover: `hover:shadow-lg hover:border-[#d4a0a0]/60`

### Input
- Base: `w-full rounded-xl border border-[#8b7355]/30 bg-[#faf6f0] text-[#8b7355] placeholder:text-[#8b7355]/40 font-serif focus:outline-none transition-all duration-300 ease-in-out`
- Default: ``
- Floral: `border-[#d4a0a0]/40 placeholder:text-[#d4a0a0]/50`

### Garden Panel
- Base: `relative bg-[#faf6f0] rounded-2xl border-2 border-[#5a8f5a]/30 p-6 shadow-sm`
- Default: ``
- Floral: `border-[#d4a0a0]/40`
- Honey: `border-[#f5d75f]/50 bg-[#f5d75f]/5`

### Botanical Badge
- Base: `inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#faf6f0] border-2 border-[#5a8f5a]/40 font-serif text-sm text-[#5a8f5a]`
- Leaf: `border-[#5a8f5a]/40 text-[#5a8f5a]`
- Flower: `border-[#d4a0a0]/50 text-[#d4a0a0]`
- Berry: `border-[#8b4a5a]/40 text-[#8b4a5a]`

### Seed Packet Tag
- Base: `inline-flex items-center gap-1 px-3 py-1.5 bg-[#f5d75f]/20 border border-[#8b7355]/30 rounded-lg font-serif text-sm text-[#8b7355]`
- Default: ``
- Rose: `bg-[#d4a0a0]/20 border-[#d4a0a0]/40 text-[#8b4a5a]`
- Herb: `bg-[#5a8f5a]/10 border-[#5a8f5a]/30 text-[#5a8f5a]`

### Mason Jar Progress
- Base: `relative h-8 bg-[#faf6f0] border-2 border-[#8b7355]/40 rounded-lg overflow-hidden`
- Honey: `[&>.fill]:bg-gradient-to-t [&>.fill]:from-[#d4a03a] [&>.fill]:to-[#f5d75f]`
- Jam: `[&>.fill]:bg-gradient-to-t [&>.fill]:from-[#8b4a5a] [&>.fill]:to-[#d4a0a0]`
- Herb: `[&>.fill]:bg-gradient-to-t [&>.fill]:from-[#3d5c3d] [&>.fill]:to-[#5a8f5a]`

### Cross Stitch Divider
- Base: `relative w-full h-6 flex items-center justify-center`
- Default: ``

### Leaf Card
- Base: `relative bg-[#faf6f0] rounded-2xl border border-[#5a8f5a]/30 p-6 shadow-sm`
- Default: ``
- Autumn: `border-[#c9a227]/40`

- Hover: `hover:shadow-md hover:border-[#5a8f5a]/50`

### Journal Ornament
- Base: `flex items-center justify-center gap-3 text-[#8b7355]/50`
- Default: ``

### Garden Tab
- Base: `px-4 py-2 font-serif border-b-2 transition-all duration-200 text-[#8b7355]`
- Garden: `border-[#5a8f5a]/50`
- Kitchen: `border-[#f5d75f]/50`
- Craft: `border-[#d4a0a0]/50`

- Hover: `hover:bg-[#faf6f0]`

### Wildflower Alert
- Base: `relative p-4 rounded-xl border font-serif`
- Info: `bg-[#5a8f5a]/10 border-[#5a8f5a]/30 text-[#5a8f5a]`
- Warning: `bg-[#f5d75f]/20 border-[#d4a03a]/40 text-[#8b7355]`
- Error: `bg-[#d4a0a0]/20 border-[#8b4a5a]/40 text-[#8b4a5a]`
- Success: `bg-[#5a8f5a]/15 border-[#5a8f5a]/50 text-[#3d5c3d]`

### Harvest Table
- Base: `w-full font-serif text-sm`
- Default: ``

## Forbidden Patterns
These classes must NEVER be used in Cottagecore style:

- `rounded-none`
- `bg-[#0a0a1a]`
- `bg-[#0a0a0f]`
- `bg-black`
- `text-[#00ffff]`
- `text-[#ff00ff]`
- `border-[#ff00ff]`
- `border-[#00ffff]`
- `shadow-[0_0_16px_rgba(255,0,255`
- `shadow-[0_0_20px_rgba(0,255,255`

- Pattern: `^bg-(?:black|\[#0[0-9a-f]{5}\])`
- Pattern: `^text-(?:\[#(?:00ffff|ff00ff)\])`
- Pattern: `^shadow-\[0_0_\d+px_rgba\((?:255,0,255|0,255,255)`

### Why:
- `rounded-none`: Cottagecore uses soft, rounded shapes (rounded-2xl, rounded-full)
- `bg-black`: Cottagecore uses warm cream/linen backgrounds, not dark ones
- `font-mono`: Cottagecore uses serif fonts for a classical feel

## Do's
- 使用温暖的大地色和花卉色调
- 采用圆润的边角和柔和的阴影
- 使用衬线字体传达古典感
- 添加花朵、叶子等自然装饰元素
- 使用亚麻/纸张质感的背景
- 保持温馨舒适的整体氛围

## Don'ts
- 禁止使用冰冷的蓝灰色调
- 禁止使用尖锐的直角和硬边框
- 禁止使用霓虹色或高饱和荧光色
- 禁止使用科技感或工业风元素

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
- Style: cottagecore
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "田园风小屋页面"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 田园核风 (Cottagecore)