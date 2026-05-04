---
name: impressionist-oil
version: 1.0.0
description: Impressionist Oil design style for web interfaces
keywords: [油画, 印象派, 笔触, 光影, 莫奈]
author: StyleKit
style_type: visual
---

# Impressionist Oil Style

## Overview
受莫奈、雷诺阿等印象派大师启发，大胆的笔触纹理、斑驳光影、点彩色彩和温暖的画布质感，呈现如油画般的浓郁视觉体验。

## Philosophy
油画印象派风格汲取19世纪法国印象派绘画的精髓，强调光影变化和色彩的即兴表达。

## Design Tokens

### Border
- Width: `border`
- Color: `border-[#e8a87c]/25`
- Radius: `rounded-lg`

### Shadow
- Small: `shadow-[0_2px_0_rgba(192,57,43,0.10),0_3px_8px_rgba(232,168,124,0.15)]`
- Medium: `shadow-[0_3px_0_rgba(192,57,43,0.12),0_5px_16px_rgba(232,168,124,0.20)]`
- Large: `shadow-[0_4px_0_rgba(192,57,43,0.15),0_8px_24px_rgba(44,62,80,0.12)]`
- Hover: `hover:shadow-[0_4px_0_rgba(192,57,43,0.15),0_10px_28px_rgba(44,62,80,0.12)]`

### Typography
- Heading: `font-serif font-bold tracking-wide`
- Body: `font-serif`
- Hero: `text-5xl md:text-7xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-14 md:py-20 lg:py-28`
- Container: `px-6 md:px-10 lg:px-14`
- Card: `p-6 md:p-8`

### Colors
- Primary BG: `bg-[#f5f0e1]`
- Secondary BG: `bg-[#ede5d0]`
- Primary Text: `text-[#2c3e50]`
- Primary Button: `text-[#2c3e50] shadow-[0_4px_0_#c0392b,0_6px_16px_rgba(232,168,124,0.30)]`

## Component Recipes

### Button
- Base: `font-serif font-bold tracking-wide rounded-lg transition-all duration-300 ease-in-out`
- Warm Orange: `bg-[#e8a87c] text-[#2c3e50] shadow-[0_4px_0_#c0392b,0_6px_16px_rgba(232,168,124,0.30)]`
- Deep Blue: `bg-[#2c3e50] text-[#f5f0e1] shadow-[0_4px_0_#1abc9c,0_6px_16px_rgba(44,62,80,0.30)]`
- Vermillion: `bg-[#c0392b] text-[#f5f0e1] shadow-[0_4px_0_#2c3e50,0_6px_16px_rgba(192,57,43,0.30)]`
- Outline: `bg-transparent text-[#e8a87c] border-2 border-[#e8a87c]`

- Hover: `hover:brightness-110`

### Card
- Base: `bg-[#f5f0e1] rounded-lg border border-[#e8a87c]/25 transition-all duration-300 ease-in-out`
- Default: `shadow-[0_3px_0_rgba(192,57,43,0.12),0_8px_24px_rgba(44,62,80,0.08)]`
- Warm Tone: `border-[#c0392b]/15 shadow-[0_3px_0_rgba(44,62,80,0.10),0_6px_16px_rgba(192,57,43,0.06)]`
- Cool Tone: `border-[#1abc9c]/15 shadow-[0_3px_0_rgba(26,188,156,0.15),0_6px_16px_rgba(26,188,156,0.06)]`

- Hover: `hover:border-[#e8a87c]/40 hover:shadow-[0_4px_0_rgba(192,57,43,0.15),0_10px_28px_rgba(44,62,80,0.12)]`

### Input
- Base: `w-full rounded-lg border-2 border-[#e8a87c]/25 bg-[#f5f0e1] text-[#2c3e50] placeholder:text-[#2c3e50]/30 font-serif focus:outline-none transition-all duration-300 ease-in-out`
- Default: `shadow-[inset_0_2px_4px_rgba(44,62,80,0.04)]`
- Warm: `border-[#e8a87c]/40 placeholder:text-[#e8a87c]/30`
- Turquoise: `border-[#1abc9c]/25 placeholder:text-[#1abc9c]/30`

### Canvas Panel
- Base: `bg-[#f5f0e1] rounded-lg border border-[#e8a87c]/20 font-serif transition-all duration-300 ease-in-out relative bg-[repeating-linear-gradient(90deg,transparent_0px,transparent_3px,rgba(232,168,124,0.03)_3px,rgba(232,168,124,0.03)_4px)]`
- Default: `shadow-[0_3px_0_rgba(192,57,43,0.08),0_6px_16px_rgba(44,62,80,0.06)]`
- Warm: `border-[#e8a87c]/30 shadow-[0_3px_0_rgba(232,168,124,0.12),0_6px_16px_rgba(232,168,124,0.06)]`
- Cool: `border-[#1abc9c]/20 shadow-[0_3px_0_rgba(26,188,156,0.12),0_6px_16px_rgba(26,188,156,0.06)]`

- Hover: `hover:border-[#e8a87c]/35 hover:shadow-[0_4px_0_rgba(192,57,43,0.12),0_8px_20px_rgba(44,62,80,0.10)]`

### Brushstroke Badge
- Base: `inline-flex items-center justify-center rounded-[60%_40%_50%_50%/40%_60%_50%_50%] font-serif font-bold transition-all duration-300 ease-in-out`
- Warm: `bg-[#e8a87c] text-[#2c3e50] shadow-[0_2px_0_#c0392b,0_4px_10px_rgba(232,168,124,0.25)]`
- Cool: `bg-[#1abc9c] text-[#f5f0e1] shadow-[0_2px_0_#2c3e50,0_4px_10px_rgba(26,188,156,0.25)]`
- Earth: `bg-[#2c3e50] text-[#f5f0e1] shadow-[0_2px_0_#c0392b,0_4px_10px_rgba(44,62,80,0.25)]`

- Hover: `hover:brightness-110 hover:scale-105`

### Palette Nav
- Base: `bg-[#f5f0e1] rounded-[50%_50%_50%_50%/60%_60%_40%_40%] border border-[#e8a87c]/20 px-4 py-2 md:px-6 md:py-3 flex items-center gap-2 font-serif transition-all duration-300 ease-in-out`
- Default: `shadow-[0_2px_0_rgba(192,57,43,0.08),0_4px_12px_rgba(44,62,80,0.06)]`
- Warm: `border-[#e8a87c]/30 shadow-[0_2px_0_rgba(232,168,124,0.12),0_4px_12px_rgba(232,168,124,0.08)]`
- Cool: `border-[#1abc9c]/20 shadow-[0_2px_0_rgba(26,188,156,0.10),0_4px_12px_rgba(26,188,156,0.06)]`

- Hover: `hover:shadow-[0_3px_0_rgba(192,57,43,0.12),0_6px_16px_rgba(44,62,80,0.10)]`

### Gallery Frame
- Base: `bg-[#f5f0e1] rounded-sm transition-all duration-300 ease-in-out relative`
- Gold: `border-4 border-[#e8a87c] shadow-[inset_0_0_0_2px_#f5f0e1,inset_0_0_0_4px_#e8a87c/40,0_4px_16px_rgba(232,168,124,0.20)]`
- Dark: `border-4 border-[#2c3e50] shadow-[inset_0_0_0_2px_#f5f0e1,inset_0_0_0_4px_#2c3e50/30,0_4px_16px_rgba(44,62,80,0.20)]`
- Minimal: `border-2 border-[#e8a87c]/30 shadow-[0_3px_12px_rgba(44,62,80,0.08)]`

- Hover: `hover:shadow-[inset_0_0_0_2px_#f5f0e1,inset_0_0_0_4px_#e8a87c/50,0_6px_20px_rgba(232,168,124,0.25)]`

### Impasto Alert
- Base: `bg-[#f5f0e1] rounded-lg border-l-4 p-4 md:p-5 font-serif transition-all duration-300 ease-in-out`
- Info: `border-l-[#1abc9c] shadow-[0_2px_0_rgba(26,188,156,0.15),0_4px_12px_rgba(26,188,156,0.06)]`
- Warning: `border-l-[#e8a87c] shadow-[0_2px_0_rgba(232,168,124,0.15),0_4px_12px_rgba(232,168,124,0.06)]`
- Success: `border-l-[#2c3e50] shadow-[0_2px_0_rgba(44,62,80,0.10),0_4px_12px_rgba(44,62,80,0.06)]`

- Hover: `hover:shadow-[0_3px_0_rgba(192,57,43,0.12),0_6px_16px_rgba(44,62,80,0.10)]`

## Forbidden Patterns
These classes must NEVER be used in Impressionist Oil style:

- `rounded-none`
- `rounded-sm`
- `shadow-[2px_2px_0px`
- `shadow-[3px_3px_0px`
- `shadow-[4px_4px_0px`
- `font-mono`
- `bg-black`
- `bg-[#0a0a1a]`
- `uppercase`
- `rounded-full`

- Pattern: `^shadow-\[\d+px_\d+px_0px`
- Pattern: `^font-mono$`
- Pattern: `^bg-black$`
- Pattern: `^uppercase$`
- Pattern: `^rounded-full$`

### Why:
- `font-mono`: Impressionist Oil uses serif fonts for artistic painterly feel
- `bg-black`: Impressionist Oil uses warm canvas backgrounds (#f5f0e1), never dark
- `rounded-none`: Impressionist Oil uses rounded-lg for soft painterly edges

## Do's
- 使用温暖的画布色 bg-[#f5f0e1] 作为背景
- 按钮使用 linear-gradient 模拟颜料管挤出的渐变质感
- 使用 layered box-shadow（实色底部 + 模糊扩散）模拟厚涂阴影
- 卡片使用 repeating-linear-gradient 作为背景纹理模拟笔触方向
- 添加 radial-gradient 光斑叠加模拟斑驳光影
- 采用粗体衬线字体 font-serif font-bold 表达艺术感
- 边角使用 rounded-lg 保持柔和的画布边缘
- 按钮 hover:brightness-110 hover:contrast-125（颜料在阳光下闪耀）
- 按钮 active:translate-y-[3px]（与 4px 实色阴影配合产生按压陷入感）
- 卡片使用 group 类，笔触底划线从 w-16 扩展至 group-hover:w-24（duration-500）
- focus:ring-2 focus:ring-[#e8a87c] focus:ring-offset-2 focus:ring-offset-[#f5f0e1]

## Don'ts
- 禁止使用纯平色块（应有纹理感和渐变）
- 禁止使用霓虹色或荧光色
- 禁止使用等宽字体（font-mono）
- 禁止使用大写文字（uppercase）
- 禁止按钮缺少 active:translate-y-[3px]（实色阴影不做陷入感 = 按钮失真）
- 禁止 focus:ring 缺少 focus:ring-offset-[#f5f0e1]（画布色背景下焦点环需与元素分离）
- 禁止动画 duration 低于 300ms（印象派节奏是缓慢流动的）

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
- Style: impressionist-oil
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "印象派画廊页面"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 油画印象派风 (Impressionist Oil)