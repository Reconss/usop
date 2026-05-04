---
name: pop-art
version: 1.0.0
description: Pop Art design style for web interfaces
keywords: [波普, Warhol, Lichtenstein, 半色调, 漫画]
author: StyleKit
style_type: visual
---

# Pop Art Style

## Overview
大胆鲜明的波普艺术风格，灵感来自 Andy Warhol 和 Roy Lichtenstein。粗黑轮廓、半色调网点、漫画式对话泡泡、高饱和度色块。适合创意品牌、潮流文化、艺术展示。

## Philosophy
Pop Art 风格来源于 20 世纪 60 年代的波普艺术运动，以 Andy Warhol 和 Roy Lichtenstein 为代表，通过大胆色块、粗黑轮廓和半色调网点创造视觉冲击。

## Design Tokens

### Border
- Width: `border-4`
- Color: `border-black`
- Radius: `rounded-lg`

### Shadow
- Small: `shadow-[2px_2px_0_#000]`
- Medium: `shadow-[4px_4px_0_#000]`
- Large: `shadow-[6px_6px_0_#000]`
- Hover: `shadow-[6px_6px_0_#000]`

### Typography
- Heading: `font-black uppercase`
- Body: `font-bold`
- Hero: `text-5xl md:text-7xl lg:text-9xl`
- H1: `text-4xl md:text-6xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-16 md:py-24`
- Container: `px-4 md:px-8`
- Card: `p-6`

### Colors
- Primary BG: `bg-white`
- Secondary BG: `bg-[#ffdd00]`
- Primary Text: `text-black`
- Primary Button: `bg-[#ffdd00] text-black border-4 border-black`

## Component Recipes

### Button
- Base: `font-black uppercase tracking-wider border-4 border-black rounded-lg transition-all duration-150`
- Primary: `bg-[#ffdd00] text-black shadow-[4px_4px_0_#000]`
- Secondary: `bg-[#ff69b4] text-white shadow-[4px_4px_0_#000]`
- Outline: `bg-white text-black shadow-[4px_4px_0_#000]`

- Hover: `hover:shadow-[6px_6px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5`

### Card
- Base: `bg-white border-4 border-black rounded-lg transition-all duration-150`
- Default: `shadow-[6px_6px_0_#000]`
- Pink: `bg-[#ff69b4] text-white shadow-[6px_6px_0_#000]`
- Blue: `bg-[#00bfff] text-white shadow-[6px_6px_0_#000]`

- Hover: `hover:shadow-[8px_8px_0_#000]`

### Input
- Base: `w-full bg-white border-4 border-black rounded-lg font-bold text-black placeholder:text-gray-400 focus:outline-none transition-all duration-150`
- Default: ``
- Pink: `focus:border-[#ff69b4] focus:shadow-[4px_4px_0_#ff69b4]`

### Halftone Card
- Base: `bg-white border-4 border-black rounded-lg bg-[radial-gradient(circle,#00000020_2px,transparent_2px)] bg-[size:12px_12px] shadow-[8px_8px_0_#000] transition-all duration-150`
- Default: `shadow-[8px_8px_0_#000]`
- Red: `bg-[#ff3b3b] bg-[radial-gradient(circle,#00000030_2px,transparent_2px)] bg-[size:12px_12px] text-white shadow-[8px_8px_0_#000]`
- Blue: `bg-[#00bfff] bg-[radial-gradient(circle,#00000030_2px,transparent_2px)] bg-[size:12px_12px] text-white shadow-[8px_8px_0_#000]`
- Yellow: `bg-[#ffdd00] bg-[radial-gradient(circle,#00000030_2px,transparent_2px)] bg-[size:12px_12px] text-black shadow-[8px_8px_0_#000]`

- Hover: `hover:shadow-[8px_8px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5`

### Bold Caption
- Base: `font-black uppercase tracking-tight [--webkit-text-stroke:2px_#000] text-2xl md:text-4xl leading-tight transition-all duration-150`
- Default: `text-black [text-shadow:3px_3px_0_rgba(0,0,0,0.2)]`
- Outline: `text-transparent [-webkit-text-stroke:3px_#000] [text-shadow:3px_3px_0_#ffdd00,-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000]`
- Shadow: `text-[#ff69b4] [text-shadow:4px_4px_0_#000,-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000]`

### Wow Badge
- Base: `inline-flex items-center justify-center font-black uppercase [clip-path:polygon(50%_0%,61%_18%,79%_2%,74%_22%,97%_18%,83%_35%,100%_50%,83%_65%,97%_82%,74%_78%,79%_98%,61%_82%,50%_100%,39%_82%,21%_98%,26%_78%,3%_82%,17%_65%,0%_50%,17%_35%,3%_18%,26%_22%,21%_2%,39%_18%)] transition-all duration-150`
- WOW: `bg-[#ffdd00] text-black [filter:drop-shadow(4px_4px_0_#000)]`
- POW: `bg-[#ff3b3b] text-white [filter:drop-shadow(4px_4px_0_#000)]`
- BAM: `bg-[#ff69b4] text-white [filter:drop-shadow(4px_4px_0_#000)]`

- Hover: `hover:[filter:drop-shadow(6px_6px_0_#000)] hover:scale-110`

## Forbidden Patterns
These classes must NEVER be used in Pop Art style:

- `bg-gradient-to-r`
- `bg-gradient-to-l`
- `bg-gradient-to-b`
- `bg-gradient-to-t`
- `shadow-sm`
- `shadow-md`
- `shadow-lg`
- `shadow-xl`
- `text-gray-300`
- `text-gray-200`

- Pattern: `^bg-gradient`
- Pattern: `^shadow-(?!\[)`
- Pattern: `^rounded-full`
- Pattern: `^border$`
- Pattern: `^text-gray-[1-3]`

### Why:
- `bg-gradient-to-r`: Pop Art uses flat color fills, not gradients
- `shadow-md`: Use hard offset shadows: shadow-[4px_4px_0_#000]
- `rounded-full`: Keep shapes angular (rounded-lg max)

## Do's
- 背景使用高饱和纯色 bg-[#ffdd00] 或 bg-white
- 所有元素使用粗黑边框 border-4 border-black
- 使用 Ben-Day 半色调网点作为背景纹理
- 文字使用粗体 font-black uppercase
- 按钮和卡片使用硬阴影 shadow-[4px_4px_0_#000]
- 使用高对比度配色：黄 #ffdd00、粉 #ff69b4、蓝 #00bfff
- hover 状态增大阴影偏移 hover:shadow-[6px_6px_0_#000]
- Comic Pow!: `hover:scale-110 hover:-rotate-3` — exaggerated tilt + scale like a comic SFX panel bursting out of the frame
- Ben-Day Dynamics: use dual dot layers — base black dots deepen `opacity-10 → opacity-30`, and a second red dot layer `opacity-0 → opacity-20` appears offset by half a grid on hover
- Punchy Motion: `duration-100 ease-out` — rubber-stamp speed, snappy but not instantaneous
- Active Snap: `active:scale-95 active:rotate-2 active:translate-x-[4px] active:translate-y-[4px] active:shadow-[2px_2px_0_#000]` — inward press pushes shadow back toward zero

## Don'ts
- 禁止使用渐变色（必须是纯色平涂）
- 禁止使用低饱和度/灰色系颜色
- 禁止使用细线条 border（必须 border-2 以上）
- 禁止使用圆角过大 rounded-full（保持 rounded-none 或 rounded-lg）
- 禁止使用极简/无装饰的设计语言
- 禁止使用 `duration-200` 或更长的 hover/active 过渡（波普艺术要求 `duration-100 ease-out` 的冲击速度）
- 禁止 Ben-Day 纹理只用单层（必须双层叠加才有颜色变换的网点效果）
- 禁止 hover 只使用 `translate-y` 而不配合 `scale` 和 `rotate`（Comic Pow! 三者缺一不可）

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
- Style: pop-art
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "波普艺术作品展示"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 波普艺术 (Pop Art)