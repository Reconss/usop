---
name: hand-drawn-doodle
version: 1.0.0
description: Hand-Drawn Doodle design style for web interfaces
keywords: [手绘, 涂鸦, 笔记本, 虚线, 标记笔]
author: StyleKit
style_type: visual
---

# Hand-Drawn Doodle Style

## Overview
手绘线条、涂鸦插画、不规则形状和手写字体。像在笔记本上随手画出的设计，充满创意和趣味性，传达温暖亲切的手工感。

## Philosophy
Hand-Drawn Doodle 风格模拟手工绘制的质感，营造温暖、亲切、创意十足的视觉体验。

## Design Tokens

### Border
- Width: `border-2`
- Color: `border-[#2c2c2c]`
- Radius: `rounded-sm`

### Shadow
- Small: `shadow-[2px_2px_0px_#4ecdc4]`
- Medium: `shadow-[3px_3px_0px_#4ecdc4]`
- Large: `shadow-[4px_4px_0px_#4ecdc4]`
- Hover: `hover:shadow-[6px_6px_0px_#4ecdc4]`

### Typography
- Heading: `font-sans font-bold`
- Body: `font-sans`
- Hero: `text-4xl md:text-6xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#fffef5]`
- Secondary BG: `bg-[#f8f7f0]`
- Primary Text: `text-[#2c2c2c]`
- Primary Button: `bg-[#2c2c2c] text-[#fffef5] shadow-[3px_3px_0px_#ff6b6b]`

## Component Recipes

### Button
- Base: `font-sans font-semibold tracking-wide rounded-sm border-2 border-dashed transition-all duration-200 ease-in-out`
- Ink: `bg-[#2c2c2c] text-[#fffef5] border-[#2c2c2c] shadow-[3px_3px_0px_#ff6b6b]`
- Red Marker: `bg-[#ff6b6b] text-[#fffef5] border-[#2c2c2c] shadow-[3px_3px_0px_#4ecdc4]`
- Teal Marker: `bg-[#4ecdc4] text-[#fffef5] border-[#2c2c2c] shadow-[3px_3px_0px_#ffd93d]`
- Sketch: `bg-transparent text-[#2c2c2c] border-[#2c2c2c] shadow-[2px_2px_0px_#ffd93d]`

- Hover: `hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_#ff6b6b] hover:rotate-[-0.5deg]`

### Card
- Base: `bg-[#fffef5] rounded-sm border-2 border-dashed border-[#2c2c2c] shadow-[4px_4px_0px_#4ecdc4] transition-all duration-200 ease-in-out`
- Default: ``
- Red Marker: `shadow-[4px_4px_0px_#ff6b6b]`
- Yellow Marker: `shadow-[4px_4px_0px_#ffd93d]`
- Teal Marker: `shadow-[4px_4px_0px_#4ecdc4]`

- Hover: `hover:shadow-[6px_6px_0px_#4ecdc4] hover:rotate-[0.5deg]`

### Input
- Base: `w-full rounded-sm border-2 border-dashed border-[#2c2c2c] bg-[#fffef5] text-[#2c2c2c] placeholder:text-[#2c2c2c]/30 font-sans focus:outline-none transition-all duration-200 ease-in-out`
- Default: ``
- Teal: `border-[#4ecdc4] placeholder:text-[#4ecdc4]/30`
- Red: `border-[#ff6b6b] placeholder:text-[#ff6b6b]/30`

### Sticky Note
- Base: `rounded-sm font-sans shadow-[3px_3px_8px_rgba(0,0,0,0.15)] transition-all duration-200 ease-in-out relative`
- Yellow: `bg-[#ffd93d] text-[#2c2c2c] p-4 md:p-6`
- Pink: `bg-[#ff6b6b]/80 text-[#fffef5] p-4 md:p-6`
- Blue: `bg-[#4ecdc4]/80 text-[#fffef5] p-4 md:p-6`
- Green: `bg-[#a8e6cf] text-[#2c2c2c] p-4 md:p-6`

- Hover: `hover:rotate-0 hover:shadow-[4px_4px_12px_rgba(0,0,0,0.2)] hover:-translate-y-1`

### Doodle Border
- Base: `bg-[#fffef5] rounded-sm transition-all duration-200 ease-in-out relative`
- Default: `border-2 border-dashed border-[#2c2c2c] shadow-[3px_3px_0px_#4ecdc4]`
- Thick: `border-4 border-dashed border-[#2c2c2c] shadow-[4px_4px_0px_#ff6b6b]`
- Dotted: `border-2 border-dotted border-[#2c2c2c] shadow-[3px_3px_0px_#ffd93d]`

- Hover: `hover:shadow-[5px_5px_0px_#4ecdc4] hover:rotate-[0.3deg]`

### Pencil Divider
- Base: `w-full my-4 transition-all duration-200 ease-in-out`
- Default: `h-0.5 bg-[#2c2c2c]/60 rotate-[-0.3deg]`
- Wavy: `border-b-2 border-dashed border-[#2c2c2c]/50 rotate-[0.2deg]`
- Dashed: `border-b-2 border-dotted border-[#ff6b6b]/60 rotate-[-0.5deg]`

### Sketch Badge
- Base: `inline-flex items-center justify-center rounded-full border-2 border-dashed font-sans font-bold transition-all duration-200 ease-in-out`
- Red: `bg-[#ff6b6b] text-[#fffef5] border-[#2c2c2c] shadow-[2px_2px_0px_#2c2c2c]`
- Blue: `bg-[#4ecdc4] text-[#fffef5] border-[#2c2c2c] shadow-[2px_2px_0px_#2c2c2c]`
- Green: `bg-[#a8e6cf] text-[#2c2c2c] border-[#2c2c2c] shadow-[2px_2px_0px_#2c2c2c]`
- Orange: `bg-[#ffd93d] text-[#2c2c2c] border-[#2c2c2c] shadow-[2px_2px_0px_#2c2c2c]`

- Hover: `hover:rotate-[-3deg] hover:scale-110`

### Notebook List
- Base: `bg-[#fffef5] rounded-sm border-2 border-dashed border-[#2c2c2c] p-5 md:p-8 font-sans transition-all duration-200 ease-in-out relative`
- Default: `shadow-[3px_3px_0px_#4ecdc4] border-l-[6px] border-l-[#ff6b6b]`
- Grid: `shadow-[3px_3px_0px_#ffd93d] border-l-[6px] border-l-[#4ecdc4]`
- Dotted: `shadow-[3px_3px_0px_#ff6b6b] border-dotted border-l-[6px] border-l-[#ffd93d]`

- Hover: `hover:shadow-[5px_5px_0px_#4ecdc4]`

## Forbidden Patterns
These classes must NEVER be used in Hand-Drawn Doodle style:

- `bg-gradient-to-r`
- `bg-gradient-to-b`
- `bg-gradient-to-br`
- `shadow-md`
- `shadow-lg`
- `shadow-xl`
- `font-mono`
- `backdrop-blur`
- `backdrop-blur-sm`
- `rounded-none`

- Pattern: `^bg-gradient-`
- Pattern: `^shadow-(?:sm|md|lg|xl|2xl)$`
- Pattern: `^font-mono$`
- Pattern: `^backdrop-blur`
- Pattern: `^rounded-(?:none|lg|xl|2xl|full)$`

### Why:
- `bg-gradient-to-r`: Hand-Drawn Doodle uses flat marker colors only, no gradients
- `shadow-md`: Hand-Drawn Doodle uses hard offset shadows (shadow-[Npx_Npx_0px_color]) to mimic marker strokes
- `font-mono`: Hand-Drawn Doodle uses casual sans-serif fonts, never technical monospace

## Do's
- 使用虚线边框（border-dashed）模拟手绘线条
- 使用奶白纸张色 #fffef5 背景
- 使用墨黑 #2c2c2c 作为主色
- 添加微妙旋转（rotate）模拟手绘不规则感
- 使用标记笔配色：红 #ff6b6b、蓝绿 #4ecdc4、黄 #ffd93d
- 使用无衬线字体，保持随意感
- 添加笔记本横线背景
- 使用胶带/图钉/回形针等装饰元素

## Don'ts
- 禁止使用精确的几何形状和直角（rounded-none）
- 禁止使用渐变效果
- 禁止使用精确阴影（shadow-md 等）
- 禁止使用等宽字体
- 禁止使用实线边框（border-solid）
- 禁止使用大圆角（rounded-lg 及以上）

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
- Style: hand-drawn-doodle
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "手绘涂鸦着陆页"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 手绘涂鸦风 (Hand-Drawn Doodle)