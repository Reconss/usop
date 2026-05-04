---
name: y2k
version: 1.0.0
description: Y2K design style for web interfaces
keywords: [Y2K, 千禧, 未来主义, 金属, 透明]
author: StyleKit
style_type: visual
---

# Y2K Style

## Overview
2000年代初的未来主义美学，金属质感、透明塑料、气泡元素、银色和彩虹渐变，充满对数字时代的乐观想象。

## Philosophy
Y2K（千禧风格）是1990年代末至2000年代初的设计美学，反映了人们对新千年和数字未来的乐观想象。

## Design Tokens

### Border
- Width: `border-2`
- Color: `border-[#c0c0c0]`
- Radius: `rounded-2xl`

### Shadow
- Small: `shadow-[0_2px_8px_rgba(255,105,180,0.3)] md:shadow-[0_4px_12px_rgba(255,105,180,0.3)]`
- Medium: `shadow-[0_4px_16px_rgba(255,105,180,0.4)] md:shadow-[0_6px_24px_rgba(255,105,180,0.4)]`
- Large: `shadow-[0_8px_32px_rgba(255,105,180,0.5)] md:shadow-[0_12px_48px_rgba(255,105,180,0.5)]`
- Hover: `hover:shadow-[0_8px_32px_rgba(192,192,192,0.6)]`

### Typography
- Heading: `font-bold tracking-wide`
- Body: `font-sans`
- Hero: `text-4xl md:text-6xl lg:text-7xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-10 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-7`

### Colors
- Primary BG: `bg-gradient-to-br from-[#e0e0e0] to-[#f5f5f5]`
- Secondary BG: `bg-[#c0c0c0]`
- Primary Text: `text-[#333333]`
- Primary Button: `bg-gradient-to-r from-[#ff69b4] to-[#ff6ec7] text-white`

## Component Recipes

### Button
- Base: `font-bold rounded-full border border-white/50 transition-all duration-300`
- Primary: `bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 text-white shadow-[0_4px_20px_rgba(255,105,180,0.4)]`
- Secondary: `bg-gradient-to-b from-gray-200 via-white to-gray-300 text-gray-700 shadow-[0_4px_15px_rgba(0,0,0,0.1),inset_0_2px_3px_rgba(255,255,255,0.8)]`
- Outline: `bg-transparent text-pink-400 border-2 border-pink-400`

- Hover: `hover:scale-105 hover:shadow-[0_6px_30px_rgba(255,105,180,0.6)]`

### Card
- Base: `bg-gradient-to-br from-white/60 to-pink-100/40 backdrop-blur-md rounded-3xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.1)] transition-all duration-300`
- Default: ``
- Metallic: `bg-gradient-to-br from-gray-200/60 via-white/80 to-gray-300/60`
- Rainbow: `bg-gradient-to-br from-pink-200/40 via-purple-200/40 to-cyan-200/40`

- Hover: `hover:shadow-[0_12px_40px_rgba(255,105,180,0.2)]`

### Input
- Base: `w-full bg-gradient-to-b from-white to-gray-100 rounded-full border border-gray-200 text-gray-700 placeholder:text-gray-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] focus:outline-none transition-all duration-300`
- Default: ``
- Pink: `bg-gradient-to-b from-pink-50 to-pink-100 border-pink-200`

### Chrome Button
- Base: `font-bold rounded-full border border-white/50 transition-all duration-300`
- Silver: `bg-gradient-to-b from-gray-100 via-white to-gray-300 text-gray-700 shadow-[0_4px_15px_rgba(0,0,0,0.15),inset_0_2px_3px_rgba(255,255,255,0.9)]`
- Holographic: `bg-gradient-to-r from-pink-300 via-cyan-200 to-purple-300 text-gray-800 shadow-[0_4px_20px_rgba(255,105,180,0.3)]`
- Pink: `bg-gradient-to-b from-pink-200 via-pink-100 to-pink-300 text-pink-700 shadow-[0_4px_15px_rgba(255,105,180,0.3)]`

- Hover: `hover:scale-105 hover:shadow-[0_6px_25px_rgba(255,105,180,0.5)]`

### Bubble Frame
- Base: `rounded-3xl backdrop-blur-md border border-white/60 transition-all duration-300`
- Default: `bg-gradient-to-br from-white/50 to-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.08),inset_0_2px_4px_rgba(255,255,255,0.6)]`
- Pink: `bg-gradient-to-br from-pink-200/50 to-pink-100/20 shadow-[0_8px_32px_rgba(255,105,180,0.15),inset_0_2px_4px_rgba(255,255,255,0.6)]`
- Blue: `bg-gradient-to-br from-cyan-200/50 to-blue-100/20 shadow-[0_8px_32px_rgba(0,200,255,0.15),inset_0_2px_4px_rgba(255,255,255,0.6)]`

- Hover: `hover:shadow-[0_12px_40px_rgba(255,105,180,0.2),inset_0_2px_4px_rgba(255,255,255,0.8)]`

### Holographic Badge
- Base: `inline-flex items-center justify-center font-bold rounded-full border border-white/50 transition-all duration-300`
- Rainbow: `bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 text-white shadow-[0_2px_10px_rgba(255,105,180,0.4)]`
- Silver: `bg-gradient-to-b from-gray-100 via-white to-gray-200 text-gray-600 shadow-[0_2px_10px_rgba(0,0,0,0.1)]`
- Pink: `bg-gradient-to-r from-pink-300 to-pink-400 text-white shadow-[0_2px_10px_rgba(255,105,180,0.3)]`

- Hover: `hover:scale-105 hover:shadow-[0_4px_15px_rgba(255,105,180,0.5)]`

## Forbidden Patterns
These classes must NEVER be used in Y2K style:

- `rounded-none`
- `rounded-sm`
- `border-black`
- `border-4`
- `bg-[#1a1a2e]`
- `bg-black`
- `text-black`
- `shadow-[2px_2px_0px`
- `shadow-[4px_4px_0px`
- `font-black`

- Pattern: `^rounded-none$`
- Pattern: `^shadow-\[\d+px_\d+px_0px`
- Pattern: `^bg-amber-`
- Pattern: `^bg-stone-`
- Pattern: `^bg-yellow-(?:[7-9])`

### Why:
- `rounded-none`: Y2K uses bubble-like rounded shapes (rounded-2xl or rounded-full)
- `border-black`: Y2K uses metallic silver borders, not solid black
- `shadow-[4px_4px_0px`: Y2K uses soft metallic/pink glowing shadows, not hard-edge

## Do's
- 使用银色/金属渐变 bg-gradient-to-r from-gray-300 via-white to-gray-300
- 添加气泡/球体装饰元素
- 使用透明/半透明效果 bg-white/30 backdrop-blur
- 彩虹渐变文字效果
- 圆润的未来感造型 rounded-full
- 添加星星、闪光装饰

## Don'ts
- 禁止使用暗沉的配色
- 禁止使用过于扁平的设计
- 禁止省略光泽/反光效果
- 禁止使用粗糙的纹理

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
- Style: y2k
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "时尚品牌官网"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 千禧风格 (Y2K)