---
name: swiss-poster
version: 1.0.0
description: Swiss Poster design style for web interfaces
keywords: [海报, 大字体, 网格, 实验排版, 国际主义]
author: StyleKit
style_type: visual
---

# Swiss Poster Style

## Overview
大胆排版、网格对齐、原色色块和实验性布局。源于瑞士国际主义海报设计传统，以超大字体和强烈的视觉层次构建信息传达。与 swiss-style 的区别在于更注重海报级别的实验性大排版。

## Philosophy
Swiss Poster 风格源于瑞士国际主义设计运动的海报传统，追求极致的排版表现力。

## Design Tokens

### Border
- Width: `border-2`
- Color: `border-[#000000]`
- Radius: `rounded-none`

### Shadow
- Small: `shadow-none`
- Medium: `shadow-none`
- Large: `shadow-none`
- Hover: `shadow-none`

### Typography
- Heading: `font-sans font-black uppercase tracking-tighter`
- Body: `font-sans`
- Hero: `text-6xl md:text-[10rem] lg:text-[12rem]`
- H1: `text-5xl md:text-7xl lg:text-8xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-0`
- Container: `px-0`
- Card: `p-6 md:p-8`

### Colors
- Primary BG: `bg-[#ffffff]`
- Secondary BG: `bg-[#f5f5f5]`
- Primary Text: `text-[#000000]`
- Primary Button: `bg-[#000000] text-[#ffffff]`

## Component Recipes

### Button
- Base: `font-sans font-black uppercase tracking-widest rounded-none transition-all duration-100 ease-out`
- Black: `bg-[#000000] text-[#ffffff] border-2 border-[#000000]`
- Red: `bg-[#ff0000] text-[#ffffff] border-2 border-[#ff0000]`
- Blue: `bg-[#0057b8] text-[#ffffff] border-2 border-[#0057b8]`
- Yellow: `bg-[#ffcc00] text-[#000000] border-2 border-[#ffcc00]`
- Outline: `bg-transparent text-[#000000] border-2 border-[#000000]`

- Hover: `hover:bg-[#ff0000] hover:text-[#ffffff] hover:border-[#ff0000]`

### Card
- Base: `bg-[#ffffff] rounded-none border-2 border-[#000000] transition-all duration-100 ease-out`
- Default: ``
- Black Block: `bg-[#000000] text-[#ffffff] border-[#000000]`
- Red Block: `bg-[#ff0000] text-[#ffffff] border-[#ff0000]`
- Blue Block: `bg-[#0057b8] text-[#ffffff] border-[#0057b8]`

- Hover: `hover:bg-[#ff0000] hover:text-[#ffffff] hover:border-[#ff0000]`

### Input
- Base: `w-full rounded-none border-0 border-b-2 border-[#000000] bg-transparent text-[#000000] placeholder:text-[#000000]/20 font-sans font-bold focus:outline-none transition-all duration-100 ease-out`
- Default: ``
- Red Accent: `border-[#ff0000] placeholder:text-[#ff0000]/20`

## Forbidden Patterns
These classes must NEVER be used in Swiss Poster style:

- `rounded-md`
- `rounded-lg`
- `rounded-xl`
- `rounded-2xl`
- `rounded-full`
- `bg-gradient-to-r`
- `bg-gradient-to-b`
- `bg-gradient-to-br`
- `shadow-sm`
- `shadow-md`

- Pattern: `^rounded-(?:md|lg|xl|2xl|full)$`
- Pattern: `^bg-gradient-`
- Pattern: `^shadow-(?:sm|md|lg|xl|2xl)$`
- Pattern: `^backdrop-blur`
- Pattern: `^font-serif$`

### Why:
- `rounded-lg`: Swiss Poster uses sharp edges only (rounded-none) - geometric precision
- `bg-gradient-to-r`: Swiss Poster uses flat solid color blocks only, no gradients
- `shadow-md`: Swiss Poster does not use shadows at all - relies on borders and color blocks for hierarchy

## Do's
- 使用超大号无衬线粗体字（font-sans font-black）
- 严格遵循 12 列网格对齐（grid-cols-12）
- 使用黑白为主色调
- 使用原色（红 #ff0000、蓝 #0057b8、黄 #ffcc00）作为色块强调
- 保持直角边缘（rounded-none）
- 文字全部大写（uppercase tracking-widest）
- 使用 border-2 border-[#000000] 分隔区域
- 使用 gap-0 让元素紧贴
- 使用非对称布局（如 3/9、8/4 分栏）
- Absolute Objectivity: zero translate, scale, or shadow on any element — Swiss Poster communicates through color and typography alone, motion is noise
- Snap Transitions: all interactions use `transition-none` — color changes are instantaneous hard cuts, like ink stamped onto paper
- Color Block Invasion: hover replaces background with solid black `hover:bg-[#000000]` and text inverts to white `hover:text-[#ffffff]` — the color block takes over the entire element
- Typographic Highlighting: year/label element switches to `group-hover:text-[#ff0000] transition-none` on hover — the red typographic accent activates like a stamp

## Don'ts
- 禁止使用装饰性字体或等宽字体
- 禁止使用超过 rounded-sm 的圆角
- 禁止使用渐变
- 禁止使用虚线边框（border-dashed）
- 禁止使用元素间距（gap-4 等），用 gap-0 + 边框
- 禁止使用任何 `translate`、`scale` 或 `rotate` 动画（Absolute Objectivity — Swiss Poster 用色彩和排版传达，不用运动）
- 禁止使用 `active:scale-[0.98]` 或任何 scale（海报不会因为被触碰而缩放）
- 禁止使用 `transition-all duration-*` 中任何非零延迟（必须 `transition-none` — 印刷颜色切换是瞬时的）
- 禁止 hover 只改变文字颜色而不改变背景（Color Block Invasion 要求整块颜色翻转，不只是文字变色）

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
- Style: swiss-poster
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "瑞士海报着陆页"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 瑞士海报风 (Swiss Poster)