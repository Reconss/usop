---
name: outrun
version: 1.0.0
description: Outrun design style for web interfaces
keywords: [Outrun, 复古未来, 80年代, 日落, 跑车]
author: StyleKit
style_type: visual
---

# Outrun Style

## Overview
80年代日落、棕榈树剪影、跑车、网格地平线和复古浪潮美学。洋红与紫色霓虹、青色天空，充满速度感和怀旧未来主义。

## Philosophy
Outrun 是一种根植于80年代流行文化的视觉美学，命名自同名电子游戏。它将夕阳、跑车、棕榈树和霓虹灯光融为一体，创造出一种永恒的复古未来主义视觉语言。

## Design Tokens

### Border
- Width: `border`
- Color: `border-[#ff006e]/50`
- Radius: `rounded-lg`

### Shadow
- Small: `shadow-[0_0_8px_rgba(255,0,110,0.4)] md:shadow-[0_0_12px_rgba(255,0,110,0.4)]`
- Medium: `shadow-[0_0_16px_rgba(255,0,110,0.5)] md:shadow-[0_0_24px_rgba(255,0,110,0.5)]`
- Large: `shadow-[0_0_24px_rgba(255,0,110,0.6)] md:shadow-[0_0_40px_rgba(255,0,110,0.6)]`
- Hover: `hover:shadow-[0_0_32px_rgba(0,212,255,0.7)]`

### Typography
- Heading: `font-bold tracking-widest uppercase`
- Body: `font-sans`
- Hero: `text-4xl md:text-6xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#0a0a0a]`
- Secondary BG: `bg-[#1a0a2e]`
- Primary Text: `text-[#ff006e]`
- Primary Button: `bg-gradient-to-r from-[#ff006e] to-[#a020f0] text-white`

## Component Recipes

### Button
- Base: `font-bold uppercase tracking-widest rounded-lg transition-all duration-300 ease-in-out`
- Primary: `bg-gradient-to-r from-[#ff006e] to-[#a020f0] text-white shadow-[0_0_16px_rgba(255,0,110,0.5)] md:shadow-[0_0_24px_rgba(255,0,110,0.5)]`
- Secondary: `bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/50 shadow-[0_0_12px_rgba(0,212,255,0.3)]`
- Outline: `bg-transparent text-[#ff006e] border border-[#ff006e]/50 shadow-[0_0_10px_rgba(255,0,110,0.3)]`

- Hover: `hover:shadow-[0_0_32px_rgba(0,212,255,0.7)] hover:scale-105`

### Card
- Base: `bg-[#0a0a0a]/80 rounded-lg border border-[#ff006e]/50 shadow-[0_0_16px_rgba(255,0,110,0.4)] md:shadow-[0_0_24px_rgba(255,0,110,0.4)] transition-all duration-300 ease-in-out`
- Default: ``
- Cyan: `border-[#00d4ff]/50 shadow-[0_0_16px_rgba(0,212,255,0.4)] md:shadow-[0_0_24px_rgba(0,212,255,0.4)]`
- Sunset: `border-[#a020f0]/50 shadow-[0_0_16px_rgba(160,32,240,0.4)] md:shadow-[0_0_24px_rgba(160,32,240,0.4)]`

- Hover: `hover:shadow-[0_0_32px_rgba(255,0,110,0.6)] hover:border-[#ff006e]/70`

### Input
- Base: `w-full rounded-lg border border-[#a020f0]/50 bg-[#0a0a0a]/60 text-[#00d4ff] placeholder:text-[#a020f0]/50 focus:outline-none transition-all duration-300 ease-in-out`
- Default: ``
- Neon: `border-[#ff006e]/50 text-[#ff006e] placeholder:text-[#ff006e]/40`

### Neon Glow Panel
- Base: `relative bg-[#0a0a0a]/90 rounded-lg border p-6`
- Magenta: `border-[#ff006e] text-[#ff006e]`
- Cyan: `border-[#00d4ff] text-[#00d4ff]`
- Purple: `border-[#a020f0] text-[#a020f0]`

### Chrome Text
- Base: `font-bold uppercase tracking-widest bg-gradient-to-b from-white via-[#c0c0c0] to-[#808080] bg-clip-text text-transparent`
- Default: ``

### Sunset Progress
- Base: `relative h-3 bg-[#0a0a0a] rounded-full border border-[#a020f0]/30 overflow-hidden`
- Default: ``

### Neon Toggle
- Base: `relative w-14 h-7 bg-[#0a0a0a] border border-[#a020f0]/50 rounded-full transition-all duration-300`
- Default: ``

### VHS Badge
- Base: `inline-flex items-center gap-1 px-3 py-1 bg-[#0a0a0a] border border-[#ff006e]/50 font-mono text-xs uppercase text-[#ff006e]`
- REC: `text-[#ef4444] border-[#ef4444]/50`
- PLAY: `text-[#22c55e] border-[#22c55e]/50`
- PAUSE: `text-[#fbbf24] border-[#fbbf24]/50`

### Grid Divider
- Base: `relative h-24 overflow-hidden`
- Default: ``

## Forbidden Patterns
These classes must NEVER be used in Outrun style:

- `rounded-none`
- `bg-white`
- `bg-gray-50`
- `bg-gray-100`
- `bg-[#f5f0e8]`
- `text-black`
- `text-gray-900`
- `border-black`
- `shadow-[2px_2px_0px`
- `shadow-[4px_4px_0px`

- Pattern: `^rounded-none$`
- Pattern: `^shadow-\[\d+px_\d+px_0px`
- Pattern: `^bg-(?:white|gray-|stone-|amber-|yellow-)`
- Pattern: `^text-(?:black|gray-(?:[7-9])|stone-|amber-)`

### Why:
- `rounded-none`: Outrun uses rounded shapes (rounded-lg) for a retro-futuristic feel
- `bg-white`: Outrun uses dark backgrounds with neon accents, not light colors
- `shadow-[4px_4px_0px`: Outrun uses neon glow shadows (0_0_Xpx_rgba), not hard-edge

## Do's
- 使用洋红、紫色、青色霓虹配色
- 添加日落渐变天空背景
- 使用透视网格地面效果
- 添加霓虹发光效果
- 使用粗体无衬线字体
- 添加棕榈树或跑车剪影元素
- 交互叠加双霓虹光晕：hover:shadow-[0_0_20px_#ff006e,0_0_40px_#00d4ff]（Dual Neon Glow）
- 网格或扫描线在 hover 时可用 bg-position 产生位移，制造向地平线冲刺感（Perspective Drive）
- active 状态加入轻微屏幕闪烁（active:bg-[#ff006e]/20）与短促下压反馈

## Don'ts
- 禁止使用明亮的白色背景
- 禁止使用现代简约风格
- 禁止省略霓虹发光效果
- 禁止使用柔和低饱和配色
- 禁止只使用单色发光（Outrun 必须有洋红+青色的色散层次）
- 禁止完全静止的网格背景（缺少速度幻觉会丢失风格核心）

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
- Style: outrun
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "复古赛车界面"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: Outrun 复古未来 (Outrun)