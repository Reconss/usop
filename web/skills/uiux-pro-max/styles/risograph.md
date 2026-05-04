---
name: risograph
version: 1.0.0
description: Risograph design style for web interfaces
keywords: [Risograph, 印刷, 套印, 半调, 网点]
author: StyleKit
style_type: visual
---

# Risograph Style

## Overview
Risograph 印刷机的独特美学，2-3色套印效果、半调网点、套印错位和有限色彩，呈现独特的印刷质感和手工批量感。

## Philosophy
Risograph 是一种源于日本的快速印刷技术，因其独特的视觉效果而被艺术家和设计师广泛采用。

## Design Tokens

### Border
- Width: `border-2`
- Color: `border-[#1a1a1a]`
- Radius: `rounded-sm`

### Shadow
- Small: `shadow-[2px_2px_0px_#ff6b9d]`
- Medium: `shadow-[3px_3px_0px_#ff6b9d]`
- Large: `shadow-[4px_4px_0px_#ff6b9d]`
- Hover: `hover:shadow-[6px_6px_0px_#ff6b9d]`

### Typography
- Heading: `font-mono font-bold uppercase tracking-wider`
- Body: `font-mono`
- Hero: `text-4xl md:text-6xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#fffbf0]`
- Secondary BG: `bg-[#f5f0e6]`
- Primary Text: `text-[#1a1a1a]`
- Primary Button: `bg-[#ff6b9d] text-white shadow-[3px_3px_0px_#2563eb]`

## Component Recipes

### Button
- Base: `font-mono font-bold uppercase tracking-wider rounded-sm transition-all duration-200 ease-in-out`
- Primary: `bg-[#ff6b9d] text-white shadow-[3px_3px_0px_#2563eb]`
- Secondary: `bg-[#2563eb] text-white shadow-[3px_3px_0px_#ff6b9d]`
- Outline: `bg-transparent text-[#ff6b9d] border-2 border-[#ff6b9d] shadow-[2px_2px_0px_#2563eb]`

- Hover: `hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0px_#2563eb]`

### Card
- Base: `bg-[#fffbf0] rounded-sm border-2 border-[#1a1a1a] shadow-[4px_4px_0px_#ff6b9d] transition-all duration-200 ease-in-out`
- Default: ``
- Blue: `shadow-[4px_4px_0px_#2563eb]`
- Green: `shadow-[4px_4px_0px_#22c55e]`

- Hover: `hover:shadow-[6px_6px_0px_#ff6b9d] hover:border-[#ff6b9d]`

### Input
- Base: `w-full rounded-sm border-2 border-[#1a1a1a] bg-[#fffbf0] text-[#1a1a1a] placeholder:text-[#1a1a1a]/40 font-mono focus:outline-none transition-all duration-200 ease-in-out`
- Default: ``
- Pink: `border-[#ff6b9d] placeholder:text-[#ff6b9d]/40`

### Overprint Badge
- Base: `inline-flex items-center justify-center font-mono font-bold uppercase tracking-wider rounded-sm relative transition-all duration-200 ease-in-out`
- Pink: `bg-[#ff6b9d] text-white shadow-[3px_3px_0px_#2563eb]`
- Blue: `bg-[#2563eb] text-white shadow-[3px_3px_0px_#ff6b9d]`
- Orange: `bg-[#f97316] text-white shadow-[3px_3px_0px_#2563eb]`

- Hover: `hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0px_#2563eb]`

### Misprint Card
- Base: `bg-[#fffbf0] rounded-sm border-2 border-[#1a1a1a] relative transition-all duration-200 ease-in-out`
- Default: `shadow-[4px_4px_0px_#ff6b9d,-2px_-2px_0px_#2563eb]`
- Heavy: `shadow-[6px_6px_0px_#ff6b9d,-4px_-4px_0px_#2563eb]`
- Subtle: `shadow-[2px_2px_0px_#ff6b9d,-1px_-1px_0px_#2563eb]`

- Hover: `hover:shadow-[6px_6px_0px_#ff6b9d,-3px_-3px_0px_#2563eb] hover:-translate-y-1`

### Noise Overlay
- Base: `bg-[#fffbf0] rounded-sm border border-[#1a1a1a]/20 relative p-4 md:p-6 transition-all duration-200 ease-in-out`
- Default: `bg-[url('data:image/svg+xml,%3Csvg+viewBox%3D%220+0+256+256%22+xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cfilter+id%3D%22n%22%3E%3CfeTurbulence+baseFrequency%3D%220.7%22%2F%3E%3C%2Ffilter%3E%3Crect+width%3D%22100%25%22+height%3D%22100%25%22+filter%3D%22url%28%23n%29%22+opacity%3D%220.05%22%2F%3E%3C%2Fsvg%3E')]`
- Dense: `bg-[url('data:image/svg+xml,%3Csvg+viewBox%3D%220+0+256+256%22+xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cfilter+id%3D%22n%22%3E%3CfeTurbulence+baseFrequency%3D%220.9%22%2F%3E%3C%2Ffilter%3E%3Crect+width%3D%22100%25%22+height%3D%22100%25%22+filter%3D%22url%28%23n%29%22+opacity%3D%220.08%22%2F%3E%3C%2Fsvg%3E')]`
- Sparse: `bg-[url('data:image/svg+xml,%3Csvg+viewBox%3D%220+0+256+256%22+xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cfilter+id%3D%22n%22%3E%3CfeTurbulence+baseFrequency%3D%220.5%22%2F%3E%3C%2Ffilter%3E%3Crect+width%3D%22100%25%22+height%3D%22100%25%22+filter%3D%22url%28%23n%29%22+opacity%3D%220.03%22%2F%3E%3C%2Fsvg%3E')]`

## Forbidden Patterns
These classes must NEVER be used in Risograph style:

- `rounded-lg`
- `rounded-xl`
- `rounded-2xl`
- `rounded-full`
- `bg-gradient-to-r`
- `bg-gradient-to-b`
- `bg-gradient-to-br`
- `shadow-md`
- `shadow-lg`
- `shadow-xl`

- Pattern: `^rounded-(?:lg|xl|2xl|full)$`
- Pattern: `^bg-gradient-`
- Pattern: `^shadow-(?:md|lg|xl)$`
- Pattern: `^backdrop-blur`

### Why:
- `rounded-lg`: Risograph uses minimal rounding (rounded-sm only) for a print-like feel
- `bg-gradient-to-r`: Risograph uses flat solid colors, no gradients
- `shadow-md`: Risograph uses hard offset shadows, not soft ones

## Do's
- 限制使用2-3种主色调
- 添加套印错位效果（offset shadow）
- 使用粗体等宽或无衬线字体
- 保持扁平色块无渐变
- 添加颗粒/网点纹理感
- 使用米白/奶白色纸张背景
- Misregistration Offset: hover must use dual-direction shadows simulating two Riso ink plates out of register: `hover:shadow-[6px_6px_0_#2563eb,-4px_-4px_0_#ff8a00]` — one shadow goes bottom-right (blue plate), the other top-left (orange plate)
- Instant Print: all transitions use `duration-100 ease-linear` — mechanical printing press speed, not organic motion
- Overprint Illusion: active state switches background to the secondary ink color `active:bg-[#2563eb]`, simulating two Riso ink layers fully overlapping at the press point
- Registration Shift: green corner element uses `translate-x-2 -translate-y-2` at rest and `group-hover:translate-x-0 group-hover:translate-y-0` on hover — the registration mark locks into place as the press completes its cycle

## Don'ts
- 禁止使用复杂的渐变效果
- 禁止使用太多颜色（最多3-4种）
- 禁止使用写实阴影或光照效果
- 禁止使用圆滑的圆角设计
- 禁止使用单方向阴影（Riso 总是两个墨版，阴影必须双向）
- 禁止使用 `ease-in-out` 或 `ease`（印刷机是机械的，必须 `ease-linear`）
- 禁止在阴影中使用 blur（所有偏移必须是零模糊的硬边）
- 禁止用 opacity 过渡实现 hover 颜色变化（必须是印刷机瞬间切换）

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
- Style: risograph
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "Risograph 海报页面"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: Risograph 印刷风 (Risograph)