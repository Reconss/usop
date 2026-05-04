---
name: collage-art
version: 1.0.0
description: Collage Art design style for web interfaces
keywords: [拼贴, 剪贴, 混合材质, 多层, 杂志]
author: StyleKit
style_type: visual
---

# Collage Art Style

## Overview
杂志拼贴和混合材料美学，纸片剪切、多层叠加、撕纸边缘和混搭字体，营造充满创意和手工感的视觉冲击。

## Philosophy
拼贴艺术风格源于达达主义和波普艺术的混合媒材传统，强调不同材料、字体和图像的碰撞与融合。

## Design Tokens

### Border
- Width: `border-2`
- Color: `border-[#2d2d2d]`
- Radius: `rounded-none`

### Shadow
- Small: `shadow-[3px_3px_0px_#2d2d2d]`
- Medium: `shadow-[5px_5px_0px_#2d2d2d]`
- Large: `shadow-[7px_7px_0px_#2d2d2d]`
- Hover: `hover:shadow-[7px_7px_0px_#2d2d2d]`

### Typography
- Heading: `font-serif font-bold uppercase tracking-wider`
- Body: `font-sans`
- Hero: `text-5xl md:text-7xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#f5f0e8]`
- Secondary BG: `bg-[#ebe4d8]`
- Primary Text: `text-[#2d2d2d]`
- Primary Button: `bg-[#e74c3c] text-white border-2 border-[#2d2d2d] shadow-[4px_4px_0px_#2d2d2d]`

## Component Recipes

### Button
- Base: `font-bold uppercase tracking-wider rounded-sm border-2 border-[#2d2d2d] transition-all duration-200 ease-in-out`
- Red Cut: `bg-[#e74c3c] text-white shadow-[4px_4px_0px_#2d2d2d]`
- Blue Cut: `bg-[#3498db] text-white shadow-[4px_4px_0px_#2d2d2d]`
- Yellow Cut: `bg-[#f39c12] text-[#2d2d2d] shadow-[4px_4px_0px_#9b59b6]`
- Dashed: `bg-[#f5f0e8] text-[#2d2d2d] border-dashed`

- Hover: `hover:rotate-0 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_#2d2d2d]`

### Card
- Base: `bg-[#f5f0e8] rounded-none border-2 border-[#2d2d2d] transition-all duration-200 ease-in-out`
- Default: `shadow-[5px_5px_0px_#2d2d2d]`
- Red: `border-[#e74c3c] shadow-[5px_5px_0px_#e74c3c]`
- Blue: `border-[#3498db] shadow-[5px_5px_0px_#3498db]`
- Yellow: `border-[#f39c12] shadow-[5px_5px_0px_#f39c12]`
- Purple: `border-[#9b59b6] shadow-[5px_5px_0px_#9b59b6]`

- Hover: `hover:-translate-y-1 hover:shadow-[7px_7px_0px_#2d2d2d]`

### Input
- Base: `w-full rounded-none border-2 border-[#2d2d2d] bg-[#f5f0e8] text-[#2d2d2d] placeholder:text-[#2d2d2d]/30 focus:outline-none transition-all duration-200 ease-in-out`
- Default: `font-serif`
- Sans: `font-sans`
- Mono: `font-mono text-sm`
- Dashed: `font-mono text-sm border-dashed border-[#2d2d2d]/60`

### Torn Paper Card
- Base: `bg-[#f5f0e8] rounded-none border-2 border-[#2d2d2d] transition-all duration-200 ease-in-out relative`
- Default: `shadow-[5px_5px_0px_#2d2d2d] rotate-[0.3deg]`
- Vintage: `bg-[#f5f0e8]/90 border-[#2d2d2d]/60 shadow-[4px_4px_0px_#9b59b6] rotate-[-0.5deg]`
- Colorful: `border-[#e74c3c] shadow-[5px_5px_0px_#3498db] rotate-[0.7deg]`

- Hover: `hover:rotate-0 hover:-translate-y-1 hover:shadow-[7px_7px_0px_#2d2d2d]`

### Layered Stack
- Base: `bg-[#f5f0e8] rounded-none border-2 border-[#2d2d2d] p-5 md:p-8 transition-all duration-200 ease-in-out relative`
- Default: `shadow-[4px_4px_0px_#2d2d2d,8px_8px_0px_#e74c3c,12px_12px_0px_#2d2d2d]`
- Scattered: `rotate-[1deg] shadow-[5px_3px_0px_#3498db,10px_7px_0px_#f39c12,15px_10px_0px_#2d2d2d]`
- Neat: `shadow-[3px_3px_0px_#2d2d2d,6px_6px_0px_#2d2d2d,9px_9px_0px_#2d2d2d]`

- Hover: `hover:-translate-y-1 hover:shadow-[6px_6px_0px_#2d2d2d,10px_10px_0px_#e74c3c,14px_14px_0px_#2d2d2d]`

### Cutout Badge
- Base: `inline-flex items-center justify-center font-bold uppercase tracking-wider border-2 border-[#2d2d2d] rounded-none transition-all duration-200 ease-in-out`
- Red: `bg-[#e74c3c] text-white shadow-[3px_3px_0px_#2d2d2d] rotate-[-1deg]`
- Blue: `bg-[#3498db] text-white shadow-[3px_3px_0px_#2d2d2d] rotate-[0.5deg]`
- Yellow: `bg-[#f39c12] text-[#2d2d2d] shadow-[3px_3px_0px_#9b59b6] rotate-[-0.5deg]`
- Mixed: `bg-[#f5f0e8] text-[#2d2d2d] border-dashed shadow-[3px_3px_0px_#e74c3c] rotate-[1deg]`

- Hover: `hover:rotate-0 hover:scale-105`

### Masking Tape Divider
- Base: `w-full h-6 md:h-8 my-4 transition-all duration-200 ease-in-out`
- Default: `bg-[#f39c12]/60 rotate-[-0.5deg] shadow-[0_1px_3px_rgba(0,0,0,0.1)]`
- Colorful: `bg-gradient-to-r from-[#e74c3c]/50 via-[#f39c12]/50 to-[#3498db]/50 rotate-[0.3deg] shadow-[0_1px_3px_rgba(0,0,0,0.1)]`
- Vintage: `bg-[#2d2d2d]/20 rotate-[-0.3deg] border-y border-dashed border-[#2d2d2d]/30`

### Scrapbook Frame
- Base: `bg-white border-2 border-[#2d2d2d] transition-all duration-200 ease-in-out relative`
- Default: `p-3 md:p-4 shadow-[5px_5px_0px_#2d2d2d] rotate-[0.5deg]`
- Polaroid: `p-3 pb-12 md:p-4 md:pb-16 shadow-[4px_4px_0px_#2d2d2d] rotate-[-1deg]`
- Vintage: `p-4 md:p-5 border-[#2d2d2d]/60 bg-[#f5f0e8] shadow-[4px_4px_0px_#9b59b6] rotate-[1deg]`

- Hover: `hover:rotate-0 hover:-translate-y-1 hover:shadow-[7px_7px_0px_#2d2d2d]`

## Forbidden Patterns
These classes must NEVER be used in Collage Art style:

- `rounded-lg`
- `rounded-xl`
- `rounded-2xl`
- `rounded-3xl`
- `rounded-full`
- `bg-gradient-to-r`
- `bg-gradient-to-b`
- `bg-gradient-to-br`
- `backdrop-blur`
- `backdrop-blur-sm`

- Pattern: `^rounded-(?:lg|xl|2xl|3xl|full)$`
- Pattern: `^bg-gradient-`
- Pattern: `^backdrop-blur`
- Pattern: `^shadow-\[0_`

### Why:
- `rounded-full`: Collage Art uses sharp corners (rounded-sm/rounded-none) for cut-paper feel
- `rounded-lg`: Collage Art uses rounded-sm or rounded-none, never soft corners
- `bg-gradient-to-r`: Collage Art uses flat solid color blocks, not smooth gradients

## Do's
- 使用混合字体（衬线 font-serif + 无衬线 font-sans + 等宽 font-mono 交替）
- 元素使用 Tailwind 任意值旋转 rotate-[Ndeg] 而非内联 style transform（避免与 hover 冲突）
- 使用硬偏移阴影 shadow-[Npx_Npx_0px_color] 营造层叠深度
- 添加 washi tape 装饰：repeating-linear-gradient 条纹色块
- 使用 polygon clip-path 创造撕纸边缘效果
- 保持陈旧纸张色 bg-[#f5f0e8] 作为底色
- 大胆使用对比色块（红/蓝/黄/紫）
- 使用实线和虚线边框模拟剪切痕迹
- hover 时纸片上浮 -translate-y-2 + 旋转变化 + 阴影扩张，active 时阴影骤减模拟按压
- 使用 group + group-hover:* 让胶带装饰响应卡片悬停，产生视差效果

## Don'ts
- 禁止使用平滑渐变（bg-gradient-to-*）
- 禁止使用柔和圆角（rounded-lg 以上）
- 禁止使用毛玻璃效果（backdrop-blur）
- 禁止使用统一整齐的对齐方式
- 禁止对有 hover/group-hover Tailwind 变换的元素使用 style={{ transform }} 内联属性（会导致 transform 冲突）

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
- Style: collage-art
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "拼贴艺术杂志页面"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 拼贴艺术风 (Collage Art)