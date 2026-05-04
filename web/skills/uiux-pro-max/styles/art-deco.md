---
name: art-deco
version: 1.0.0
description: Art Deco design style for web interfaces
keywords: [装饰艺术, 奢华, 金色, 几何, 1920年代]
author: StyleKit
style_type: visual
---

# Art Deco Style

## Overview
1920-30年代的奢华设计风格，几何对称图案、金色装饰、优雅线条和高端质感，传达精致与繁荣。

## Philosophy
Art Deco（装饰艺术）是1920-30年代流行的设计风格，融合了现代主义的几何形式与传统工艺的奢华感。

## Design Tokens

### Border
- Width: `border-2`
- Color: `border-[#d4af37]`
- Radius: `rounded-none`

### Shadow
- Small: `shadow-[0_2px_4px_rgba(212,175,55,0.15)]`
- Medium: `shadow-[0_4px_12px_rgba(212,175,55,0.2)]`
- Large: `shadow-[0_8px_24px_rgba(212,175,55,0.25)]`
- Hover: `hover:shadow-[0_6px_20px_rgba(212,175,55,0.3)]`

### Typography
- Heading: `font-serif font-bold tracking-widest uppercase`
- Body: `font-serif`
- Hero: `text-4xl md:text-6xl lg:text-7xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-16 md:py-28 lg:py-36`
- Container: `px-6 md:px-12 lg:px-20`
- Card: `p-6 md:p-10`

### Colors
- Primary BG: `bg-[#1a1a2e]`
- Secondary BG: `bg-[#0f0f1a]`
- Primary Text: `text-[#d4af37]`
- Primary Button: `bg-[#d4af37] text-[#1a1a2e]`

## Component Recipes

### Button
- Base: `font-serif font-semibold uppercase tracking-[0.3em] border border-[#D4AF37] transition-all duration-300`
- Primary: `bg-transparent text-[#D4AF37] border-2 border-[#D4AF37]`
- Secondary: `bg-[#D4AF37] text-gray-900 shadow-[0_0_20px_rgba(212,175,55,0.3)]`
- Outline: `bg-transparent text-[#D4AF37]/70 border border-[#D4AF37]/50`

- Hover: `hover:bg-[#D4AF37] hover:text-gray-900 hover:shadow-[0_0_30px_rgba(212,175,55,0.5)]`

### Card
- Base: `bg-gray-900 border border-[#D4AF37]/50 relative transition-all duration-300`
- Default: ``
- Gold Border: `border-2 border-[#D4AF37]`
- Gradient: `bg-gradient-to-b from-gray-900 to-gray-800`

- Hover: `hover:border-[#D4AF37] hover:shadow-[0_0_20px_rgba(212,175,55,0.15)]`

### Input
- Base: `w-full bg-gray-900 border border-[#D4AF37]/50 text-[#f5f5dc] font-serif tracking-wider placeholder:text-[#D4AF37]/40 focus:outline-none transition-all duration-300`
- Default: ``
- Gold Border: `border-[#D4AF37]`

### Ornate Frame
- Base: `bg-gray-900 border-2 border-[#D4AF37] relative font-serif transition-all duration-300 overflow-hidden bg-[repeating-linear-gradient(135deg,transparent,transparent_8px,rgba(212,175,55,0.15)_8px,rgba(212,175,55,0.15)_9px)] before:content-[''] before:absolute before:top-2 before:left-2 before:w-6 before:h-6 before:border-t-2 before:border-l-2 before:border-[#D4AF37] after:content-[''] after:absolute after:bottom-2 after:right-2 after:w-6 after:h-6 after:border-b-2 after:border-r-2 after:border-[#D4AF37]`
- Gold: `border-[#D4AF37] shadow-[inset_0_0_0_4px_rgba(212,175,55,0.15),0_0_20px_rgba(212,175,55,0.1)]`
- Silver: `border-[#C0C0C0] shadow-[inset_0_0_0_4px_rgba(192,192,192,0.15),0_0_20px_rgba(192,192,192,0.1)]`
- Dark: `bg-black border-[#D4AF37]/60 shadow-[inset_0_0_0_4px_rgba(212,175,55,0.1)]`

- Hover: `hover:shadow-[inset_0_0_0_4px_rgba(212,175,55,0.25),0_0_30px_rgba(212,175,55,0.2)]`

### Deco Separator
- Base: `w-full h-8 bg-gradient-to-r from-transparent via-[#D4AF37]/40 to-transparent relative my-4 md:my-6 flex items-center justify-center overflow-hidden before:content-[''] before:absolute before:w-8 before:h-8 before:bg-[conic-gradient(from_0deg,transparent_0deg,#D4AF37_10deg,transparent_20deg,transparent_40deg,#D4AF37_50deg,transparent_60deg,transparent_80deg,#D4AF37_90deg,transparent_100deg,transparent_120deg,#D4AF37_130deg,transparent_140deg,transparent_160deg,#D4AF37_170deg,transparent_180deg,transparent_200deg,#D4AF37_210deg,transparent_220deg,transparent_240deg,#D4AF37_250deg,transparent_260deg,transparent_280deg,#D4AF37_290deg,transparent_300deg,transparent_320deg,#D4AF37_330deg,transparent_340deg,transparent_360deg)] before:rounded-full before:opacity-60`
- Default: `h-8`
- Wide: `h-10 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent before:w-10 before:h-10 before:opacity-80`
- Narrow: `h-6 max-w-xs mx-auto before:w-5 before:h-5`

### Gold Accent Badge
- Base: `inline-flex items-center justify-center font-serif uppercase tracking-[0.2em] border border-[#D4AF37] bg-gray-900 text-[#D4AF37] transition-all duration-300 [clip-path:polygon(30%_0%,70%_0%,100%_30%,100%_70%,70%_100%,30%_100%,0%_70%,0%_30%)] bg-[repeating-linear-gradient(0deg,transparent,transparent_3px,rgba(212,175,55,0.1)_3px,rgba(212,175,55,0.1)_4px)]`
- Gold: `border-[#D4AF37] text-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.2)]`
- Silver: `border-[#C0C0C0] text-[#C0C0C0] shadow-[0_0_10px_rgba(192,192,192,0.2)]`
- Bronze: `border-[#CD7F32] text-[#CD7F32] shadow-[0_0_10px_rgba(205,127,50,0.2)]`

- Hover: `hover:shadow-[0_0_20px_rgba(212,175,55,0.4)]`

## Forbidden Patterns
These classes must NEVER be used in Art Deco style:

- `font-sans`
- `font-mono`
- `rounded-lg`
- `rounded-xl`
- `rounded-2xl`
- `rounded-full`
- `bg-[#ff71ce]`
- `bg-[#01cdfe]`
- `bg-[#ff69b4]`
- `bg-[#00ff00]`

- Pattern: `^font-(?:sans|mono)$`
- Pattern: `^rounded-(?:lg|xl|2xl|3xl|full)$`
- Pattern: `^bg-(?:pink|cyan|lime|green)-`
- Pattern: `^text-(?:pink|cyan|lime|green)-`

### Why:
- `font-sans`: Art Deco uses serif typography for elegance (font-serif)
- `rounded-xl`: Art Deco uses sharp geometric corners (rounded-none)
- `bg-pink-500`: Art Deco uses gold, navy and deep warm tones, not bright neons

## Do's
- 使用金色和深色的高对比配色
- 添加几何对称图案和放射状线条
- 使用优雅的衬线字体
- 添加金色边框和装饰线
- 保持对称和平衡的布局
- 使用细腻的线条装饰

## Don'ts
- 禁止使用过于鲜艳的配色
- 禁止使用不对称的混乱布局
- 禁止使用过于现代的无衬线字体
- 禁止省略装饰性元素

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
- Style: art-deco
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "奢侈品牌官网"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 装饰艺术风格 (Art Deco)