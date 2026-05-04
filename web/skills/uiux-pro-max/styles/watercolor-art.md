---
name: watercolor-art
version: 1.0.0
description: Watercolor Art design style for web interfaces
keywords: [水彩, 晕染, 透明, 纸张, 颜料]
author: StyleKit
style_type: visual
---

# Watercolor Art Style

## Overview
真实水彩画美学，有机的晕染边缘、颜料池化效果、纸张纹理叠加和植物水彩装饰，营造如同手绘水彩画般的自然有机视觉体验。

## Philosophy
水彩艺术风格追求真实水彩画的自然有机美学，强调颜料在湿纸上的流动、渗透和池化效果。

## Design Tokens

### Border
- Width: `border`
- Color: `border-[#d4a0a0]/15`
- Radius: `rounded-2xl`

### Shadow
- Small: `shadow-[0_2px_12px_rgba(212,160,160,0.08)]`
- Medium: `shadow-[0_4px_20px_rgba(212,160,160,0.12)]`
- Large: `shadow-[0_8px_32px_rgba(212,160,160,0.18)]`
- Hover: `hover:shadow-[0_8px_32px_rgba(212,160,160,0.18)]`

### Typography
- Heading: `font-serif font-semibold tracking-wide`
- Body: `font-serif`
- Hero: `text-5xl md:text-7xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-16 md:py-24 lg:py-32`
- Container: `px-6 md:px-12 lg:px-16`
- Card: `p-6 md:p-8 lg:p-10`

### Colors
- Primary BG: `bg-[#faf6f0]`
- Secondary BG: `bg-[#f3ede4]`
- Primary Text: `text-[#5a3e3e]`
- Primary Button: `bg-[#d4a0a0] text-[#5a3e3e] shadow-[0_4px_20px_rgba(212,160,160,0.25)]`

## Component Recipes

### Button
- Base: `font-serif font-medium tracking-wide rounded-2xl transition-all duration-500 ease-in-out`
- Primary: `bg-[#d4a0a0] text-[#5a3e3e] shadow-[0_4px_20px_rgba(212,160,160,0.25),inset_0_1px_0_rgba(255,255,255,0.15)]`
- Secondary: `bg-[#7bb8d4]/70 text-[#2a4a5a] shadow-[0_4px_20px_rgba(123,184,212,0.20)]`
- Outline: `bg-transparent text-[#d4a0a0] border border-[#d4a0a0]/25`
- Sage: `bg-[#8cc5a8]/70 text-[#2a4a3a] shadow-[0_4px_20px_rgba(140,197,168,0.20)]`

- Hover: `hover:scale-[1.02] hover:shadow-[0_6px_28px_rgba(212,160,160,0.30)]`

### Card
- Base: `bg-[#faf6f0]/80 rounded-3xl border border-[#d4a0a0]/15 shadow-[0_2px_20px_rgba(212,160,160,0.10)] transition-all duration-500 ease-in-out`
- Default: ``
- Rose: `border-[#d4a0a0]/20`
- Cerulean: `border-[#7bb8d4]/20`
- Sage: `border-[#8cc5a8]/20`

- Hover: `hover:shadow-[0_8px_32px_rgba(212,160,160,0.18)] hover:border-[#d4a0a0]/25`

### Input
- Base: `w-full rounded-2xl border border-[#d4a0a0]/20 bg-[#faf6f0] text-[#5a3e3e] placeholder:text-[#d4a0a0]/35 font-serif focus:outline-none transition-all duration-500 ease-in-out`
- Default: ``
- Cerulean: `border-[#7bb8d4]/20 placeholder:text-[#7bb8d4]/35`
- Sage: `border-[#8cc5a8]/20 placeholder:text-[#8cc5a8]/35`

### Wet Wash Panel
- Base: `bg-[#faf6f0]/80 rounded-[30%_70%_60%_40%/50%_40%_60%_50%] border border-[#d4a0a0]/15 backdrop-blur-sm transition-all duration-500 ease-in-out`
- Default: `bg-gradient-to-br from-[#faf6f0] to-[#d4a0a0]/10 shadow-[0_4px_20px_rgba(212,160,160,0.12)]`
- Warm: `bg-gradient-to-br from-[#faf6f0] to-[#d4a0a0]/20 border-[#d4a0a0]/20 shadow-[0_4px_20px_rgba(212,160,160,0.18)]`
- Cool: `bg-gradient-to-br from-[#faf6f0] to-[#7bb8d4]/15 border-[#7bb8d4]/20 shadow-[0_4px_20px_rgba(123,184,212,0.15)]`

- Hover: `hover:shadow-[0_8px_32px_rgba(212,160,160,0.20)] hover:border-[#d4a0a0]/25`

### Splatter Badge
- Base: `inline-flex items-center justify-center font-serif font-medium rounded-[40%_60%_50%_50%/50%_40%_60%_50%] transition-all duration-500 ease-in-out`
- Rose: `bg-[#d4a0a0]/60 text-[#5a3e3e] shadow-[0_4px_16px_rgba(212,160,160,0.25)]`
- Sky: `bg-[#7bb8d4]/50 text-[#2a4a5a] shadow-[0_4px_16px_rgba(123,184,212,0.25)]`
- Sage: `bg-[#8cc5a8]/50 text-[#2a4a3a] shadow-[0_4px_16px_rgba(140,197,168,0.25)]`

- Hover: `hover:scale-110 hover:shadow-[0_6px_24px_rgba(212,160,160,0.30)]`

### Bleed Divider
- Base: `w-full h-1 my-6 rounded-full transition-all duration-500 ease-in-out`
- Default: `bg-[radial-gradient(ellipse_at_center,rgba(212,160,160,0.4)_0%,transparent_70%)] shadow-[0_0_12px_rgba(212,160,160,0.15)]`
- Warm: `bg-[radial-gradient(ellipse_at_center,rgba(212,160,160,0.5)_0%,transparent_70%)] shadow-[0_0_16px_rgba(212,160,160,0.20)]`
- Cool: `bg-[radial-gradient(ellipse_at_center,rgba(123,184,212,0.4)_0%,transparent_70%)] shadow-[0_0_12px_rgba(123,184,212,0.15)]`

## Forbidden Patterns
These classes must NEVER be used in Watercolor Art style:

- `rounded-none`
- `rounded-sm`
- `shadow-[2px_2px_0px`
- `shadow-[3px_3px_0px`
- `shadow-[4px_4px_0px`
- `font-mono`
- `bg-black`
- `bg-[#0a0a1a]`
- `border-2`
- `border-4`

- Pattern: `^shadow-\[\d+px_\d+px_0px`
- Pattern: `^font-mono$`
- Pattern: `^bg-black$`
- Pattern: `^border-[2-4]$`
- Pattern: `^uppercase$`

### Why:
- `font-mono`: Watercolor Art uses serif fonts for elegance, not monospace
- `bg-black`: Watercolor Art uses warm paper backgrounds (#faf6f0), never dark
- `rounded-none`: Watercolor Art uses soft organic corners (2xl/3xl), never sharp edges

## Do's
- 使用超柔和的阴影和极低透明度（0.08-0.18）的边框
- 背景使用纸张纹理叠加（feTurbulence grain overlay）
- 按钮使用 radial-gradient 模拟颜料从中心向边缘池化
- 卡片使用有机边角 rounded-3xl 和极淡的边框
- 采用衬线字体（font-serif）配合宽松字距
- 大量留白，让水彩元素有呼吸空间
- 色彩始终保持透明感，避免实色填充

## Don'ts
- 禁止使用硬边偏移阴影（shadow-[Npx_Npx_0px]）
- 禁止使用粗边框（border-2 以上）
- 禁止使用纯黑背景或高饱和度霓虹色
- 禁止使用等宽字体（font-mono）
- 禁止使用大写文字（uppercase）

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
- Style: watercolor-art
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "水彩艺术作品集"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 水彩艺术风 (Watercolor Art)