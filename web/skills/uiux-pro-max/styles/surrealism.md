---
name: surrealism
version: 1.0.0
description: Surrealism design style for web interfaces
keywords: [超现实, 梦境, Dali, 融化, 不合逻辑]
author: StyleKit
style_type: visual
---

# Surrealism Style

## Overview
灵感源自Dali等超现实主义大师，梦境般的场景构成、不合逻辑的空间关系、融化变形的形态和意想不到的色彩组合，营造神秘而引人入胜的视觉体验。

## Philosophy
Surrealism（超现实主义）是20世纪初的艺术运动，致力于释放潜意识的创造力，打破理性与非理性的界限。

## Design Tokens

### Border
- Width: `border`
- Color: `border-[#d4a574]/30`
- Radius: `rounded-2xl`

### Shadow
- Small: `shadow-md`
- Medium: `shadow-lg`
- Large: `shadow-xl`
- Hover: `hover:shadow-[0_12px_40px_rgba(26,26,62,0.2)]`

### Typography
- Heading: `font-serif italic`
- Body: `font-serif`
- Hero: `text-4xl md:text-6xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#f0ece4]`
- Secondary BG: `bg-[#1a1a3e]`
- Primary Text: `text-[#1a1a3e]`
- Primary Button: `bg-gradient-to-r from-[#1a1a3e] to-[#c38d94] text-[#f0ece4]`

## Component Recipes

### Button
- Base: `font-serif italic tracking-wide rounded-lg transition-all duration-500 ease-in-out`
- Primary: `bg-gradient-to-r from-[#1a1a3e] to-[#c38d94] text-[#f0ece4] border border-[#d4a574]/50 shadow-lg`
- Secondary: `bg-[#d4a574]/20 text-[#1a1a3e] border border-[#1a1a3e]/30`
- Outline: `bg-transparent text-[#c38d94] border-2 border-[#c38d94]/50`

- Hover: `hover:shadow-[0_8px_30px_rgba(195,141,148,0.4)] hover:scale-105`

### Card
- Base: `bg-gradient-to-br from-[#f0ece4] to-[#f0ece4]/80 rounded-2xl border border-[#d4a574]/30 shadow-lg transition-all duration-500 ease-in-out`
- Default: ``
- Midnight: `bg-gradient-to-br from-[#1a1a3e] to-[#1a1a3e]/90 border-[#c38d94]/30 text-[#f0ece4]`
- Dream: `bg-gradient-to-br from-[#c38d94]/20 to-[#d4a574]/20 border-[#c38d94]/40`

- Hover: `hover:shadow-[0_12px_40px_rgba(26,26,62,0.2)] hover:border-[#d4a574]/60`

### Input
- Base: `w-full rounded-lg border border-[#d4a574]/40 bg-[#f0ece4] text-[#1a1a3e] placeholder:text-[#c38d94]/50 focus:outline-none transition-all duration-500 ease-in-out`
- Default: ``
- Dark: `bg-[#1a1a3e]/90 border-[#c38d94]/40 text-[#f0ece4] placeholder:text-[#d4a574]/50`

### Melting Frame
- Base: `bg-gradient-to-br from-[#f0ece4] to-[#f0ece4]/80 rounded-[1rem_1rem_2rem_0.5rem] border border-[#d4a574]/30 shadow-lg transition-all duration-500 ease-in-out`
- Default: `shadow-[0_8px_30px_rgba(26,26,62,0.15)]`
- Warm: `bg-gradient-to-br from-[#d4a574]/20 to-[#c38d94]/20 border-[#c38d94]/40 shadow-[0_8px_30px_rgba(195,141,148,0.2)]`
- Cool: `bg-gradient-to-br from-[#1a1a3e]/10 to-[#c38d94]/10 border-[#1a1a3e]/30 shadow-[0_8px_30px_rgba(26,26,62,0.2)]`

- Hover: `hover:shadow-[0_12px_40px_rgba(26,26,62,0.25)] hover:rounded-[1.5rem_0.5rem_2.5rem_1rem]`

### Dream Panel
- Base: `bg-gradient-to-br from-[#f0ece4]/90 to-[#c38d94]/10 rounded-2xl border border-[#d4a574]/20 backdrop-blur-sm transition-all duration-500 ease-in-out`
- Default: `shadow-[0_4px_20px_rgba(195,141,148,0.15)]`
- Twilight: `bg-gradient-to-br from-[#1a1a3e]/80 to-[#c38d94]/30 border-[#c38d94]/30 text-[#f0ece4] shadow-[0_4px_20px_rgba(26,26,62,0.3)]`
- Dawn: `bg-gradient-to-br from-[#d4a574]/20 to-[#f0ece4] border-[#d4a574]/30 shadow-[0_4px_20px_rgba(212,165,116,0.2)]`

- Hover: `hover:shadow-[0_8px_32px_rgba(195,141,148,0.25)] hover:border-[#d4a574]/40`

### Eye Badge
- Base: `inline-flex items-center justify-center rounded-[50%/40%] border border-[#d4a574]/40 font-serif italic transition-all duration-500 ease-in-out`
- Open: `bg-gradient-to-r from-[#f0ece4] to-[#c38d94]/20 text-[#1a1a3e] shadow-[0_4px_16px_rgba(195,141,148,0.3)]`
- Closed: `bg-[#1a1a3e] text-[#f0ece4] border-[#c38d94]/40 shadow-[0_4px_16px_rgba(26,26,62,0.3)]`
- Dreaming: `bg-gradient-to-r from-[#c38d94]/30 to-[#d4a574]/30 text-[#1a1a3e] border-[#d4a574]/50 shadow-[0_4px_16px_rgba(212,165,116,0.3)]`

- Hover: `hover:shadow-[0_8px_24px_rgba(195,141,148,0.4)] hover:scale-110`

## Forbidden Patterns
These classes must NEVER be used in Surrealism style:

- `rounded-none`
- `bg-white`
- `bg-gray-50`
- `shadow-[0_0_16px_rgba(255,0,255`
- `text-[#ff00ff]`
- `text-[#00ffff]`
- `border-[#ff00ff]`
- `uppercase tracking-widest`
- `font-bold`

- Pattern: `^bg-(?:white|gray-5)`
- Pattern: `^text-\[#(?:ff00ff|00ffff|00ff00)`
- Pattern: `^shadow-\[0_0_\d+px_rgba\((?:255,0,255|0,255,255)`

### Why:
- `bg-white`: Surrealism uses warm cream tones, not pure white
- `text-[#ff00ff]`: Surrealism uses muted, dreamlike tones, not neon
- `rounded-none`: Surrealism uses soft, organic shapes

## Do's
- 使用午夜蓝和沙漠金的配色
- 创造梦境般的柔和渐变
- 使用意想不到的元素组合
- 添加柔和的阴影营造深度
- 使用衬线字体和斜体
- 保持神秘而优雅的氛围
- Dream-like Distortion: hover applies subtle geometric reality-bending `hover:skew-x-2 hover:-rotate-1` — as if the element is being pulled through a dream portal
- Timeless Easing: all transitions use `duration-700 ease-in-out` or `duration-1000 ease-in-out` — surrealist time is elastic, never hurried
- Abyssal Glow: hover shadow uses large diffuse rose/gold `hover:shadow-[0_0_50px_rgba(195,141,148,0.3)]` — light emerges from deep within, never black drop shadows
- Color Melting: blurred orb decorations expand on hover `group-hover:scale-150 transition-transform duration-[2000ms]` — colors slowly bleed and melt across the canvas

## Don'ts
- 禁止使用过于明亮的纯色
- 禁止使用严格对称的网格布局
- 禁止使用现代简约的无装饰设计
- 禁止使用刺眼的霓虹色彩
- 禁止使用 `hover:scale-105`（超现实主义使用 `skew` 和 `rotate` 扭曲现实，不是放大）
- 禁止使用黑色投影（Abyssal Glow 使用玫瑰/金色漫射光晕，黑色阴影会破坏梦境感）
- 禁止使用 `duration-200` 或更短的过渡（Timeless Easing 要求 `duration-700` 以上——梦境时间是弹性的）
- 禁止在卡片装饰光球上使用 `transition-none`（Color Melting 需要缓慢的 `duration-[2000ms]` 扩散）

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
- Style: surrealism
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "梦境画廊"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 超现实主义风 (Surrealism)