---
name: steampunk
version: 1.0.0
description: Steampunk design style for web interfaces
keywords: [蒸汽朋克, 齿轮, 黄铜, 铜质, 工业]
author: StyleKit
style_type: visual
---

# Steampunk Style

## Overview
维多利亚时代工业机械美学，黄铜与铜质金属元素、齿轮机关装饰、蒸汽管道铆钉细节。适合复古科幻、工业风格、创意展示项目。

## Philosophy
Steampunk 风格源自维多利亚时代工业革命的美学想象，通过黄铜/铜质金属质感、齿轮机关元素和精密的机械细节创造复古未来感。

## Design Tokens

### Border
- Width: `border-2`
- Color: `border-[#b87333]/40`
- Radius: `rounded`

### Shadow
- Small: `shadow-[0_0_8px_rgba(181,166,66,0.2)]`
- Medium: `shadow-[0_0_15px_rgba(181,166,66,0.3)]`
- Large: `shadow-[0_0_25px_rgba(181,166,66,0.4)]`
- Hover: `shadow-[0_0_20px_rgba(184,115,51,0.4)]`

### Typography
- Heading: `font-serif font-bold`
- Body: `font-serif`
- Hero: `text-4xl md:text-6xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-16 md:py-24`
- Container: `px-4 md:px-8`
- Card: `p-6`

### Colors
- Primary BG: `bg-[#2a1f15]`
- Secondary BG: `bg-[#3d2b1f]`
- Primary Text: `text-[#f5f0e1]`
- Primary Button: `bg-gradient-to-b from-[#b5a642] to-[#8a7d32] text-[#2a1f15]`

## Component Recipes

### Button
- Base: `font-serif font-bold uppercase tracking-wider rounded transition-all duration-300`
- Primary: `bg-gradient-to-b from-[#b5a642] to-[#8a7d32] text-[#2a1f15] border border-[#d4c85c] shadow-[0_0_12px_rgba(181,166,66,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]`
- Secondary: `bg-transparent text-[#b87333] border-2 border-[#b87333] shadow-[0_0_10px_rgba(184,115,51,0.2)]`
- Outline: `bg-gradient-to-b from-[#5a5a5a] to-[#3a3a3a] text-[#f5f0e1] border border-[#6a6a6a] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_4px_rgba(0,0,0,0.3)]`

- Hover: `hover:shadow-[0_0_20px_rgba(181,166,66,0.5)] hover:scale-105`

### Card
- Base: `bg-[#2a1f15] border-2 border-[#b87333]/40 rounded transition-all duration-300 relative overflow-hidden`
- Default: `shadow-[0_0_15px_rgba(184,115,51,0.15)]`
- Brass: `border-[#b5a642]/40 shadow-[0_0_15px_rgba(181,166,66,0.2)]`
- Iron: `bg-[#1a1a1a] border-[#4a4a4a]/50 shadow-[0_2px_8px_rgba(0,0,0,0.4)]`

- Hover: `hover:shadow-[0_0_25px_rgba(184,115,51,0.3)] hover:border-[#b87333]/60`

### Input
- Base: `w-full bg-[#2a1f15] border-2 border-[#b87333]/30 rounded font-serif text-[#f5f0e1] placeholder:text-[#b87333]/30 focus:outline-none transition-all duration-300`
- Default: ``
- Brass: `border-[#b5a642]/30 text-[#d4c85c] placeholder:text-[#b5a642]/30`

### Gear Badge
- Base: `inline-flex items-center justify-center rounded-full border-2 font-serif outline outline-2 outline-offset-3 outline-current/25 transition-all duration-300`
- Brass: `bg-gradient-to-b from-[#b5a642] to-[#8a7d32] text-[#2a1f15] border-[#d4c85c] shadow-[0_0_10px_rgba(181,166,66,0.3)]`
- Copper: `bg-gradient-to-b from-[#b87333] to-[#8a5522] text-[#f5f0e1] border-[#d4944a] shadow-[0_0_10px_rgba(184,115,51,0.3)]`
- Iron: `bg-gradient-to-b from-[#5a5a5a] to-[#3a3a3a] text-[#f5f0e1] border-[#6a6a6a] shadow-[0_0_10px_rgba(0,0,0,0.3)]`

- Hover: `hover:shadow-[0_0_20px_rgba(181,166,66,0.5)] hover:scale-110`

### Brass Panel
- Base: `bg-[#2a1f15] border-2 border-[#b87333]/40 rounded relative overflow-hidden font-serif shadow-[inset_8px_8px_0_-6px_#b87333,inset_-8px_-8px_0_-6px_#b87333,inset_8px_-8px_0_-6px_#b87333,inset_-8px_8px_0_-6px_#b87333] transition-all duration-300`
- Default: `border-[#b87333]/40 shadow-[0_0_15px_rgba(184,115,51,0.15),inset_0_1px_0_rgba(255,255,255,0.05)]`
- Aged: `bg-[#1a1510] border-[#b87333]/25 shadow-[0_0_10px_rgba(184,115,51,0.1),inset_0_0_20px_rgba(0,0,0,0.3)]`
- Polished: `border-[#b5a642]/50 shadow-[0_0_20px_rgba(181,166,66,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]`

- Hover: `hover:shadow-[0_0_25px_rgba(184,115,51,0.3)] hover:border-[#b87333]/60`

### Clockwork Progress
- Base: `w-full h-3 md:h-4 bg-[#1a1510] border border-[#b87333]/30 rounded-none overflow-hidden bg-[repeating-linear-gradient(90deg,transparent_0px,transparent_14px,rgba(184,115,51,0.15)_14px,rgba(184,115,51,0.15)_16px)] transition-all duration-300`
- Brass: `border-[#b5a642]/30 shadow-[inset_0_0_8px_rgba(181,166,66,0.1)]`
- Copper: `border-[#b87333]/30 shadow-[inset_0_0_8px_rgba(184,115,51,0.1)]`
- Iron: `border-[#6a6a6a]/30 shadow-[inset_0_0_8px_rgba(0,0,0,0.2)]`

## Forbidden Patterns
These classes must NEVER be used in Steampunk style:

- `bg-white`
- `bg-gray-50`
- `bg-slate-50`
- `shadow-sm`
- `shadow-md`
- `shadow-lg`
- `text-cyan-400`
- `text-fuchsia-500`
- `rounded-2xl`
- `rounded-3xl`

- Pattern: `^bg-white`
- Pattern: `^bg-gray-[1-3]`
- Pattern: `^bg-slate-[1-3]`
- Pattern: `^shadow-(?!\[)`
- Pattern: `^rounded-[23]xl`

### Why:
- `bg-white`: Steampunk uses dark brown backgrounds only
- `shadow-md`: Use warm brass glow shadows: shadow-[0_0_15px_rgba(181,166,66,0.3)]
- `rounded-2xl`: Keep corners subtle (rounded or rounded-lg max)

## Do's
- 背景使用深棕色 bg-[#3d2b1f] 或 bg-[#2a1f15]
- 使用 shadow-[0_0_15px_rgba(181,166,66,0.3)] 创造黄铜光泽效果
- 边框使用铜色调 border border-[#b87333]/50
- 文字使用奶油色 text-[#f5f0e1] 或黄铜色 text-[#b5a642]
- 使用装饰性边框和铆钉样式圆点元素
- 按钮使用黄铜色渐变 bg-gradient-to-b from-[#b5a642] to-[#8a7d32]
- 使用 font-serif 衬线字体体现维多利亚风格

## Don'ts
- 禁止使用纯白色背景或现代极简风格
- 禁止使用霓虹色或高饱和度荧光色
- 禁止使用扁平无质感的设计
- 禁止使用现代无衬线字体作为标题
- 禁止使用过大圆角 rounded-2xl, rounded-3xl
- 禁止使用冷色调蓝色/紫色作为主色

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
- Style: steampunk
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "机械仪表盘"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 蒸汽朋克 (Steampunk)