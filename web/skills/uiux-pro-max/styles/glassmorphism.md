---
name: glassmorphism
version: 1.0.0
description: Liquid Glass design style for web interfaces
keywords: [liquid glass, frosted, blur, refraction, translucent]
author: StyleKit
style_type: visual
---

# Liquid Glass Style

## Overview
Apple Liquid Glass 风格的高级毛玻璃效果。通过高斯模糊、饱和度增强、多层内发光和色散边缘，创造出光在玻璃中流动的真实质感。

## Philosophy
Liquid Glass 是 Apple 在 WWDC25 推出的设计语言的精髓提炼。它不是简单的半透明加模糊，而是模拟真实玻璃的光学特性：折射、色散、内发光、高光边缘。

## Design Tokens

### Border
- Width: `border`
- Color: `border-white/20`
- Radius: `rounded-3xl`

### Shadow
- Small: `shadow-[0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.25)]`
- Medium: `shadow-[0_8px_24px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.3)]`
- Large: `shadow-[0_16px_48px_rgba(0,0,0,0.16),0_0_0_1px_rgba(255,255,255,0.1),inset_0_1px_0_rgba(255,255,255,0.35)]`
- Hover: `hover:shadow-[0_20px_60px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.15),inset_0_1px_0_rgba(255,255,255,0.4)]`

### Typography
- Heading: `font-semibold text-white`
- Body: `text-white/85`
- Hero: `text-4xl md:text-6xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-16 md:py-24`
- Container: `px-6 md:px-8`
- Card: `p-6 md:p-8`

### Colors
- Primary BG: `bg-white/12 backdrop-blur-[40px] backdrop-saturate-[180%]`
- Secondary BG: `bg-white/18 backdrop-blur-[60px] backdrop-saturate-[180%]`
- Primary Text: `text-white`
- Primary Button: `bg-white/20 text-white backdrop-blur-[40px] backdrop-saturate-[180%]`

## Component Recipes

### Button
- Base: `font-medium backdrop-blur-2xl backdrop-saturate-150 rounded-2xl border border-white/40 ring-1 ring-inset ring-white/20 transition-all duration-300 ease-out`
- Primary: `bg-white/25 text-white shadow-lg shadow-black/5`
- Secondary: `bg-white/15 text-white shadow-md shadow-black/5`
- Accent: `bg-[#007AFF]/30 text-white shadow-lg shadow-[#007AFF]/20`
- Outline: `bg-transparent text-white border-white/50 ring-white/30`

- Hover: `hover:bg-white/35 hover:ring-white/30 hover:shadow-xl hover:shadow-black/10`

### Card
- Base: `bg-white/20 backdrop-blur-3xl backdrop-saturate-150 rounded-3xl border border-white/30 ring-1 ring-inset ring-white/25 shadow-xl shadow-black/10 [background-image:linear-gradient(to_bottom,rgba(255,255,255,0.15),transparent)] transition-all duration-300 ease-out`
- Default: ``
- Light: `bg-white/30 ring-white/30`
- Dark: `bg-black/20 border-white/20 ring-white/15`
- Accent: `bg-[#007AFF]/20 border-[#007AFF]/30 ring-[#007AFF]/20`

- Hover: `hover:bg-white/25 hover:ring-white/35 hover:shadow-2xl hover:shadow-black/15`

### Input
- Base: `w-full bg-white/15 backdrop-blur-2xl backdrop-saturate-150 rounded-2xl border border-white/30 ring-1 ring-inset ring-white/20 text-white placeholder:text-white/50 focus:outline-none transition-all duration-300 ease-out`
- Default: ``
- Filled: `bg-white/25`

### Modal
- Base: `bg-white/20 backdrop-blur-3xl backdrop-saturate-150 rounded-3xl border border-white/30 ring-1 ring-inset ring-white/25 shadow-2xl shadow-black/20 [background-image:linear-gradient(to_bottom,rgba(255,255,255,0.15),transparent)]`
- Default: ``

### Pill Badge
- Base: `inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-xl backdrop-saturate-150 rounded-full border border-white/30 ring-1 ring-inset ring-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)] text-white`
- Default: ``
- Success: `bg-[#34C759]/25 border-[#34C759]/40`
- Warning: `bg-[#FF9500]/25 border-[#FF9500]/40`
- Error: `bg-[#FF2D55]/25 border-[#FF2D55]/40`

### Toggle Switch
- Base: `relative w-12 h-7 bg-white/20 backdrop-blur-xl backdrop-saturate-150 rounded-full border border-white/30 ring-1 ring-inset ring-white/15 transition-all duration-300 ease-out`
- Default: ``

### Navigation
- Base: `bg-white/10 backdrop-blur-3xl backdrop-saturate-150 border-b border-white/20 shadow-[0_1px_0_0_rgba(255,255,255,0.1)] px-4 md:px-8 py-3 md:py-4`
- Default: ``
- Solid: `bg-white/20`

### Slider
- Base: `relative h-2 bg-white/15 backdrop-blur-xl rounded-full ring-1 ring-inset ring-white/20`
- Default: ``
- Accent: `[&>.fill]:bg-[#007AFF]/60`

### Control Grid
- Base: `grid grid-cols-2 gap-3 p-4 bg-white/15 backdrop-blur-3xl backdrop-saturate-150 rounded-3xl border border-white/20 ring-1 ring-inset ring-white/15`
- Default: ``

### Control Tile
- Base: `flex flex-col items-center justify-center aspect-square bg-white/20 backdrop-blur-xl backdrop-saturate-150 rounded-2xl border border-white/25 ring-1 ring-inset ring-white/20 text-white transition-all duration-300 ease-out`
- Default: ``
- Active: `bg-[#007AFF]/40 border-[#007AFF]/50 ring-[#007AFF]/30 shadow-[0_0_16px_rgba(0,122,255,0.4)]`

- Hover: `hover:bg-white/30 hover:ring-white/30`

## Forbidden Patterns
These classes must NEVER be used in Liquid Glass style:

- `rounded-none`
- `rounded-sm`
- `rounded`
- `bg-white`
- `bg-black`
- `bg-gray-100`
- `bg-gray-900`
- `shadow-none`
- `backdrop-blur-sm`
- `backdrop-blur`

- Pattern: `^rounded-none`
- Pattern: `^rounded-sm$`
- Pattern: `^rounded$`
- Pattern: `^bg-(?!white\/|gradient|transparent)`
- Pattern: `^border-(?!white\/)`

### Why:
- `rounded-none`: Liquid Glass requires large rounded corners (rounded-2xl or rounded-3xl)
- `rounded-sm`: Liquid Glass requires large rounded corners (rounded-2xl or rounded-3xl)
- `rounded`: Liquid Glass requires large rounded corners (rounded-2xl or rounded-3xl)

## Do's
- 使用高模糊值 backdrop-blur-[40px] 或 backdrop-blur-[60px]
- 添加饱和度增强 backdrop-saturate-[180%]
- 使用多层阴影：外层深度 + inset 顶部高光 + 边缘光晕
- 添加内发光渐变 background-image: linear-gradient(to bottom, rgba(255,255,255,0.18), transparent)
- 边框使用 border-white/20，hover 时提升到 border-white/40
- 圆角使用 rounded-2xl 或 rounded-3xl
- 过渡使用 duration-500 + cubic-bezier(0.16,1,0.3,1) spring easing
- hover 时轻微上浮 -translate-y-0.5 并增强阴影
- 使用丰富的渐变背景作为底层

## Don'ts
- 禁止在纯色背景上使用（必须有渐变或图片背景）
- 禁止使用低模糊值 backdrop-blur-sm 或 backdrop-blur
- 禁止省略 backdrop-saturate（饱和度增强是 Liquid Glass 的关键）
- 禁止使用不透明背景 bg-white, bg-black
- 禁止使用快速过渡 duration-100, duration-150
- 禁止使用单层扁平阴影（必须多层）
- 禁止使用频闪或高频循环发光动画

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
- Style: glassmorphism
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "Liquid Glass Dashboard"
- "Liquid Glass Login"
- "Liquid Glass Music Player"

---
Generated by StyleKit · https://stylekit.dev
Style: Liquid Glass (Liquid Glass)