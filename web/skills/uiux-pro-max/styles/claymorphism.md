---
name: claymorphism
version: 1.0.0
description: Claymorphism design style for web interfaces
keywords: [粘土, 3D, 可爱, 柔软, 圆润]
author: StyleKit
style_type: visual
---

# Claymorphism Style

## Overview
柔软的粘土质感设计，通过超大圆角、内外阴影组合和柔和渐变，创造出可爱的 3D 立体效果，适合儿童应用和趣味产品。

## Philosophy
Claymorphism（粘土拟态）是一种模拟粘土或橡皮泥质感的 UI 设计风格，通过超大圆角、内外阴影组合和柔和的渐变色彩，创造出柔软、可爱的 3D 立体效果。

## Design Tokens

### Border
- Width: `border-0`
- Color: `border-transparent`
- Radius: `rounded-3xl`

### Shadow
- Small: `shadow-[4px_4px_8px_rgba(0,0,0,0.08),inset_2px_2px_4px_rgba(255,255,255,0.5),inset_-1px_-1px_2px_rgba(0,0,0,0.05)]`
- Medium: `shadow-[8px_8px_16px_rgba(0,0,0,0.1),inset_4px_4px_8px_rgba(255,255,255,0.4),inset_-2px_-2px_4px_rgba(0,0,0,0.1)]`
- Large: `shadow-[12px_12px_24px_rgba(0,0,0,0.12),inset_6px_6px_12px_rgba(255,255,255,0.5),inset_-3px_-3px_6px_rgba(0,0,0,0.1)]`
- Hover: `hover:shadow-[4px_4px_8px_rgba(0,0,0,0.1),inset_4px_4px_8px_rgba(255,255,255,0.4),inset_-2px_-2px_4px_rgba(0,0,0,0.1)]`

### Typography
- Heading: `font-bold text-pink-700`
- Body: `text-pink-600`
- Hero: `text-4xl md:text-6xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-base`

### Spacing
- Section: `py-16 md:py-24`
- Container: `px-6 md:px-8`
- Card: `p-6 md:p-8`

### Colors
- Primary BG: `bg-gradient-to-br from-amber-100 via-pink-100 to-purple-100`
- Secondary BG: `bg-gradient-to-br from-white to-pink-50`
- Primary Text: `text-pink-700`
- Primary Button: `bg-gradient-to-b from-pink-300 to-pink-400 text-white`

## Component Recipes

### Button
- Base: `font-semibold rounded-2xl border-none transition-all duration-200`
- Primary: `bg-[#f8b4d9] text-gray-800 shadow-[0_8px_16px_rgba(0,0,0,0.1),inset_0_-4px_8px_rgba(0,0,0,0.1)]`
- Secondary: `bg-[#a7f3d0] text-gray-800 shadow-[0_8px_16px_rgba(0,0,0,0.1),inset_0_-4px_8px_rgba(0,0,0,0.1)]`
- Accent: `bg-[#c4b5fd] text-gray-800 shadow-[0_8px_16px_rgba(0,0,0,0.1),inset_0_-4px_8px_rgba(0,0,0,0.1)]`
- Warm: `bg-[#fcd34d] text-gray-800 shadow-[0_8px_16px_rgba(0,0,0,0.1),inset_0_-4px_8px_rgba(0,0,0,0.1)]`

- Hover: `hover:shadow-[0_12px_20px_rgba(0,0,0,0.15),inset_0_-4px_8px_rgba(0,0,0,0.1)] hover:-translate-y-0.5`

### Card
- Base: `rounded-3xl border-none transition-all duration-300`
- Default: `bg-[#fce7f3] shadow-[0_12px_24px_rgba(0,0,0,0.1),inset_0_-6px_12px_rgba(0,0,0,0.08)]`
- Mint: `bg-[#d1fae5] shadow-[0_12px_24px_rgba(0,0,0,0.1),inset_0_-6px_12px_rgba(0,0,0,0.08)]`
- Lavender: `bg-[#ede9fe] shadow-[0_12px_24px_rgba(0,0,0,0.1),inset_0_-6px_12px_rgba(0,0,0,0.08)]`

- Hover: `hover:shadow-[0_16px_32px_rgba(0,0,0,0.15),inset_0_-6px_12px_rgba(0,0,0,0.08)]`

### Input
- Base: `w-full bg-white/80 rounded-2xl border-none text-gray-800 focus:outline-none transition-all duration-200`
- Default: `shadow-[inset_0_4px_8px_rgba(0,0,0,0.08)]`
- Raised: `shadow-[0_4px_8px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(0,0,0,0.05)]`

### Heading
- Base: `font-bold tracking-tight leading-tight text-gray-800`
- Default: `text-gray-800`
- Pink: `text-[#ec4899]`
- Purple: `text-[#8b5cf6]`

### Badge
- Base: `inline-block font-semibold text-xs md:text-sm text-gray-800 rounded-xl`
- Default: `bg-[#f8b4d9] shadow-[0_4px_8px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(0,0,0,0.08)]`
- Mint: `bg-[#a7f3d0] shadow-[0_4px_8px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(0,0,0,0.08)]`
- Lavender: `bg-[#c4b5fd] shadow-[0_4px_8px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(0,0,0,0.08)]`

### Navigation
- Base: `bg-[#fce7f3] rounded-b-2xl px-4 md:px-8 py-3 md:py-4`
- Default: `shadow-[0_8px_16px_rgba(0,0,0,0.1),inset_0_-4px_8px_rgba(0,0,0,0.05)]`
- Mint: `bg-[#d1fae5] shadow-[0_8px_16px_rgba(0,0,0,0.1),inset_0_-4px_8px_rgba(0,0,0,0.05)]`

## Forbidden Patterns
These classes must NEVER be used in Claymorphism style:

- `rounded-none`
- `rounded-sm`
- `rounded`
- `shadow-none`
- `bg-black`
- `text-black`
- `border-black`

- Pattern: `^rounded-(?:none|sm|md)$`
- Pattern: `^shadow-\[\d+px_\d+px_0px`
- Pattern: `^bg-(?:black|gray-900|slate-900)`

### Why:
- `rounded-none`: Claymorphism requires large rounded corners (rounded-3xl or larger)
- `rounded-sm`: Claymorphism requires large rounded corners (rounded-3xl or larger)
- `shadow-none`: Claymorphism requires combined inner and outer shadows for 3D effect

## Do's
- 使用超大圆角 rounded-3xl 或 rounded-full
- 组合内阴影和外阴影创造立体感
- 使用柔和的糖果色系配色
- 添加微妙的渐变背景模拟光照
- 保持元素之间足够的间距
- 使用圆润的图标和字体
- 按下时使用 Squash & Stretch：active:scale-x-105 active:scale-y-90
- 使用弹簧缓动 ease-[cubic-bezier(0.34,1.56,0.64,1)] duration-300
- 按压时加深内阴影、减小外阴影，模拟凹陷

## Don'ts
- 禁止使用尖锐的直角 rounded-none
- 禁止使用硬边缘阴影 shadow-[Xpx_Xpx_0px]
- 禁止使用高对比度的深色配色
- 禁止使用过于复杂的渐变
- 禁止元素过于拥挤
- 禁止使用单纯的 translate-y 代替真实的形变物理
- 禁止使用线性 ease 或 ease-in-out（无弹性感）

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
- Style: claymorphism
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "儿童教育应用"
- "游戏 UI"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 粘土拟态 (Claymorphism)