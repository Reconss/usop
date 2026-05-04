---
name: neo-brutalist
version: 1.0.0
description: Neo-Brutalist design style for web interfaces
keywords: [粗边框, 硬阴影, 无圆角, 高对比, 功能主义]
author: StyleKit
style_type: visual
---

# Neo-Brutalist Style

## Overview
大胆的黑色粗边框、硬边缘阴影、无圆角、高对比度配色。源于建筑野兽派，强调功能与原始美学。

## Philosophy
Neo-Brutalist（新野兽派）设计风格源于建筑领域的野兽派运动，强调原始、未经修饰的功能美学。在 Web 设计中，这种风格通过大胆的黑色边框、硬边缘阴影、锐利的直角和高对比度的配色方案来表达。

## Design Tokens

### Border
- Width: `border-2 md:border-4`
- Color: `border-black`
- Radius: `rounded-none`

### Shadow
- Small: `shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] md:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`
- Medium: `shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]`
- Large: `shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] md:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]`
- Hover: `hover:shadow-none`

### Typography
- Heading: `font-black tracking-tight`
- Body: `font-mono`
- Hero: `text-4xl md:text-6xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-24 lg:py-32`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-4 md:p-6`

### Colors
- Primary BG: `bg-white`
- Secondary BG: `bg-black`
- Primary Text: `text-black`
- Primary Button: `bg-[#ff006e] text-white`

## Component Recipes

### Button
- Base: `font-black border-2 md:border-4 border-black rounded-none transition-all duration-200`
- Primary: `bg-[#ff006e] text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]`
- Secondary: `bg-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]`
- Accent: `bg-[#ccff00] text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]`
- Outline: `bg-transparent text-black`

- Hover: `hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] md:hover:translate-x-1 md:hover:translate-y-1`

### Card
- Base: `bg-white border-2 md:border-4 border-black rounded-none transition-all duration-300`
- Default: `shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]`
- Accent: `shadow-[4px_4px_0px_0px_rgba(255,0,110,1)] md:shadow-[8px_8px_0px_0px_rgba(255,0,110,1)]`
- Flat: ``

- Hover: `hover:shadow-[4px_4px_0px_0px_rgba(255,0,110,1)] md:hover:shadow-[8px_8px_0px_0px_rgba(255,0,110,1)]`

### Input
- Base: `w-full border-2 md:border-4 border-black rounded-none bg-white font-mono focus:outline-none transition-shadow`
- Default: ``
- Filled: `bg-gray-50`

### Heading
- Base: `font-black tracking-tight leading-tight`
- Default: `text-black`
- Inverted: `text-white`
- Accent: `text-[#ff006e]`

### Badge
- Base: `inline-block font-black text-xs md:text-sm uppercase tracking-wider border-2 border-black rounded-none`
- Default: `bg-black text-white`
- Accent: `bg-[#ccff00] text-black`
- Outline: `bg-transparent text-black`

### Navigation
- Base: `bg-white border-b-2 md:border-b-4 border-black px-4 md:px-8 py-3 md:py-4`
- Default: ``
- Inverted: `bg-black border-white`

## Forbidden Patterns
These classes must NEVER be used in Neo-Brutalist style:

- `rounded-sm`
- `rounded`
- `rounded-md`
- `rounded-lg`
- `rounded-xl`
- `rounded-2xl`
- `rounded-3xl`
- `shadow-sm`
- `shadow`
- `shadow-md`

- Pattern: `^rounded-(?!none)`
- Pattern: `^shadow-(?!\[|none)`
- Pattern: `^bg-gradient-`
- Pattern: `^border-gray-`
- Pattern: `^border-slate-`

### Why:
- `rounded-lg`: Neo-Brutalist uses sharp corners only (rounded-none)
- `shadow-lg`: Neo-Brutalist uses hard-edge shadows only (shadow-[Xpx_Xpx_0px_0px_...])
- `bg-gradient-to-r`: Neo-Brutalist uses solid colors, no gradients

## Do's
- 使用纯黑边框 border-black border-2 md:border-4
- 使用硬边缘阴影 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]
- 保持直角 rounded-none
- 使用高对比度配色（黑白为主 + 鲜艳强调色）
- 标题使用 font-black，正文使用 font-mono
- 所有样式包含移动端和桌面端响应式值
- 按钮 active:translate-x-[6px] active:translate-y-[6px] active:shadow-none，位移量必须等于原始阴影像素值（Physical Crushing，实体完全压平）
- Hover 时瞬间切换高对比背景色（如 hover:bg-[#ffff00]）并增大阴影（Brutal Snap，禁止使用渐变或 opacity 过渡）
- 卡片 hover 使用 ease-out duration-150，保持生猛的碰撞感
- 按钮 hover 时增大阴影并向左上角偏移：hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]

## Don'ts
- 禁止使用圆角 rounded-lg, rounded-md, rounded-xl
- 禁止使用渐变 bg-gradient-*
- 禁止使用灰色边框 border-gray-*, border-slate-*
- 禁止使用淡入淡出的半透明效果
- 禁止使用 rounded-full（装饰圆除外）
- 禁止按钮 active 状态位移量小于原始阴影像素值（未完全压平，失去碾压感）
- 禁止 hover 背景色切换使用渐变或 opacity 过渡（必须是硬切，duration-150 ease-out）
- 禁止按钮 hover 时仅用位移替代阴影消失（hover 应增大阴影强调力量，active 才是完全压平）

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
- Style: neo-brutalist
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "SaaS 产品着陆页"
- "博客文章页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 新野兽派 (Neo-Brutalist)