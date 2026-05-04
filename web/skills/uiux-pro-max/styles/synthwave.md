---
name: synthwave
version: 1.0.0
description: Synthwave design style for web interfaces
keywords: [合成波, 80年代, 霓虹, 复古未来, 网格]
author: StyleKit
style_type: visual
---

# Synthwave Style

## Overview
80年代复古未来主义音乐美学，霓虹粉紫配色、网格地平线、日落渐变和复古科技感，充满怀旧的未来想象。

## Philosophy
Synthwave（合成波）是一种源于2000年代中期的电子音乐流派和视觉美学，致敬80年代的科幻电影、电子游戏和合成器音乐。

## Design Tokens

### Border
- Width: `border`
- Color: `border-[#ff00ff]/50`
- Radius: `rounded-lg`

### Shadow
- Small: `shadow-[0_0_8px_rgba(255,0,255,0.4)] md:shadow-[0_0_12px_rgba(255,0,255,0.4)]`
- Medium: `shadow-[0_0_16px_rgba(255,0,255,0.5)] md:shadow-[0_0_24px_rgba(255,0,255,0.5)]`
- Large: `shadow-[0_0_24px_rgba(255,0,255,0.6)] md:shadow-[0_0_40px_rgba(255,0,255,0.6)]`
- Hover: `hover:shadow-[0_0_32px_rgba(0,255,255,0.7)]`

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
- Primary BG: `bg-[#0a0a1a]`
- Secondary BG: `bg-[#1a0a2e]`
- Primary Text: `text-[#ff00ff]`
- Primary Button: `bg-gradient-to-r from-[#ff00ff] to-[#a020f0] text-white`

## Component Recipes

### Button
- Base: `font-bold uppercase tracking-widest rounded-lg transition-all duration-300 ease-in-out`
- Primary: `bg-gradient-to-r from-[#ff00ff] to-[#a020f0] text-white shadow-[0_0_16px_rgba(255,0,255,0.5)] md:shadow-[0_0_24px_rgba(255,0,255,0.5)]`
- Secondary: `bg-[#00ffff]/10 text-[#00ffff] border border-[#00ffff]/50 shadow-[0_0_12px_rgba(0,255,255,0.3)]`
- Outline: `bg-transparent text-[#ff00ff] border border-[#ff00ff]/50 shadow-[0_0_10px_rgba(255,0,255,0.3)]`

- Hover: `hover:shadow-[0_0_32px_rgba(0,255,255,0.7)] hover:scale-105`

### Card
- Base: `bg-[#0a0a1a]/80 rounded-lg border border-[#ff00ff]/50 shadow-[0_0_16px_rgba(255,0,255,0.5)] md:shadow-[0_0_24px_rgba(255,0,255,0.5)] transition-all duration-300 ease-in-out`
- Default: ``
- Cyan: `border-[#00ffff]/50 shadow-[0_0_16px_rgba(0,255,255,0.4)] md:shadow-[0_0_24px_rgba(0,255,255,0.4)]`
- Sunset: `border-[#ff1493]/50 shadow-[0_0_16px_rgba(255,20,147,0.4)] md:shadow-[0_0_24px_rgba(255,20,147,0.4)]`

- Hover: `hover:shadow-[0_0_32px_rgba(255,0,255,0.6)] hover:border-[#ff00ff]/70`

### Input
- Base: `w-full rounded-lg border border-[#a020f0]/50 bg-[#0a0a1a]/60 text-[#00ffff] placeholder:text-[#a020f0]/50 focus:outline-none transition-all duration-300 ease-in-out`
- Default: ``
- Neon: `border-[#ff00ff]/50 text-[#ff00ff] placeholder:text-[#ff00ff]/40`

## Forbidden Patterns
These classes must NEVER be used in Synthwave style:

- `rounded-none`
- `bg-white`
- `bg-gray-50`
- `bg-gray-100`
- `bg-[#f5f0e8]`
- `text-black`
- `text-gray-900`
- `text-[#3a3226]`
- `border-black`
- `shadow-[2px_2px_0px`

- Pattern: `^rounded-none$`
- Pattern: `^shadow-\[\d+px_\d+px_0px`
- Pattern: `^bg-(?:white|gray-|stone-|amber-|yellow-)`
- Pattern: `^text-(?:black|gray-(?:[7-9])|stone-|amber-)`

### Why:
- `rounded-none`: Synthwave uses rounded shapes (rounded-lg) for a retro-futuristic feel
- `bg-white`: Synthwave uses dark backgrounds with neon accents, not light colors
- `shadow-[4px_4px_0px`: Synthwave uses neon glow shadows (0_0_Xpx_rgba), not hard-edge

## Do's
- 使用粉紫青霓虹配色
- 添加透视网格背景
- 使用日落渐变（橙→粉→紫）
- 添加霓虹发光效果
- 使用复古风格字体
- 添加太阳/山脉剪影元素
- Arcade Pulse: neon border and glow elements use `hover:animate-pulse` or flicker on hover — the arcade machine's CRT screen energizes when touched
- Multidimensional Neon: button uses simultaneous inset cyan + outer pink shadows `shadow-[0_0_15px_rgba(255,0,255,0.4),inset_0_0_10px_rgba(0,255,255,0.2)]` — two neon tubes glow from opposite directions, intensify together on hover
- Virtual Grid Shift: background pixel grid uses `group-hover:opacity-30 group-hover:scale-110 transition-all duration-500` — the virtual space expands as the player approaches
- Overvoltage Press: active state causes power surge `active:scale-90 active:bg-white active:text-black active:shadow-[0_0_50px_#ffffff]` — all neon goes white as the circuit overloads at the moment of contact

## Don'ts
- 禁止使用明亮的白色背景
- 禁止使用现代简约的设计
- 禁止省略霓虹发光效果
- 禁止使用过于正式的字体
- 禁止使用单向霓虹光（Multidimensional Neon 要求 inset + outer 双向同时发光）
- 禁止 Virtual Grid 在非 group-hover 时变化（网格只在玩家接近时才激活）

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
- Style: synthwave
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "复古游戏界面"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 合成波 (Synthwave)