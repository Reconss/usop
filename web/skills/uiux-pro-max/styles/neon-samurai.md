---
name: neon-samurai
version: 1.0.0
description: Neon Samurai design style for web interfaces
keywords: [霓虹武士, 赛博武士, 日本, 霓虹, 传统融合]
author: StyleKit
style_type: visual
---

# Neon Samurai Style

## Overview
日本传统武士美学与霓虹赛博朋克的碰撞融合，刀锋斜切线条、朱红的鸟居门框架、书法笔触与双色霓虹光效交织，浮世绘遇见霓虹灯的未来都市武道。

## Philosophy
Neon Samurai fuses Japanese bushido aesthetics with cyberpunk neon luminance, forging a style of relentless tension and kinetic energy.

## Design Tokens

### Border
- Width: `border`
- Color: `border-[#dc2626]/30`
- Radius: `rounded-none`

### Shadow
- Small: `shadow-[0_0_8px_rgba(220,38,38,0.3)]`
- Medium: `shadow-[0_0_15px_rgba(220,38,38,0.4)]`
- Large: `shadow-[0_0_25px_rgba(220,38,38,0.5)]`
- Hover: `hover:shadow-[0_0_25px_rgba(220,38,38,0.7)]`

### Typography
- Heading: `font-sans font-bold uppercase tracking-widest`
- Body: `font-sans`
- Hero: `text-4xl md:text-6xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#080818]`
- Secondary BG: `bg-[#111122]`
- Primary Text: `text-white`
- Primary Button: `bg-[#dc2626] text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]`

## Component Recipes

### Button
- Base: `relative font-sans font-bold uppercase tracking-widest border border-[#dc2626]/60 transition-all duration-300 ease-in-out`
- Primary: `bg-[#dc2626] text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]`
- Secondary: `bg-[#080818] text-[#dc2626] border-[#dc2626] shadow-[0_0_10px_rgba(220,38,38,0.3)]`
- Accent: `bg-[#a020f0] text-white border-[#a020f0]/60 shadow-[0_0_15px_rgba(160,32,240,0.5)]`
- Dual Glow: `bg-[#080818] text-[#a020f0] border-[#a020f0]/50 shadow-[0_0_15px_rgba(56,189,248,0.4)]`

- Hover: `hover:shadow-[0_0_25px_rgba(56,189,248,0.5)] hover:border-[#dc2626]`

### Card
- Base: `relative bg-[#080818] border border-[#dc2626]/30 transition-all duration-300 ease-in-out`
- Default: ``
- Neon Red: `shadow-[0_0_15px_rgba(220,38,38,0.3)]`
- Neon Purple: `border-[#a020f0]/30 shadow-[0_0_15px_rgba(160,32,240,0.3)]`
- Dual Glow: `border-[#a020f0]/30 shadow-[0_0_15px_rgba(56,189,248,0.25)]`

- Hover: `hover:shadow-[0_0_25px_rgba(220,38,38,0.5)] hover:border-[#dc2626]/60`

### Input
- Base: `w-full border-b-2 border-[#dc2626]/30 bg-transparent text-white placeholder:text-white/25 font-sans focus:outline-none transition-all duration-300 ease-in-out`
- Default: ``
- Neon: `border-[#dc2626]/40`
- Purple: `border-[#a020f0]/30`

### Katana Slash
- Base: `relative w-full h-3 my-6 rotate-[-2deg] bg-[linear-gradient(105deg,#e2e8f0_0%,#94a3b8_30%,#e2e8f0_50%,#64748b_70%,#e2e8f0_100%)] [clip-path:polygon(0_30%,10%_60%,20%_20%,30%_50%,40%_10%,50%_40%,60%_5%,70%_35%,80%_15%,90%_45%,100%_25%,100%_75%,90%_55%,80%_85%,70%_65%,60%_95%,50%_60%,40%_90%,30%_50%,20%_80%,10%_40%,0_70%)] transition-all duration-300 ease-in-out`
- Red: `bg-[#dc2626] shadow-[0_0_12px_rgba(220,38,38,0.6),0_0_4px_rgba(220,38,38,0.8)]`
- Purple: `bg-[#a020f0] shadow-[0_0_12px_rgba(160,32,240,0.6),0_0_4px_rgba(160,32,240,0.8)]`
- Blue: `bg-[#38bdf8] shadow-[0_0_12px_rgba(56,189,248,0.6),0_0_4px_rgba(56,189,248,0.8)]`

- Hover: `hover:shadow-[0_0_20px_rgba(220,38,38,0.8)] hover:scale-x-105`

### Kamon Badge
- Base: `inline-flex items-center justify-center rounded-full border-2 outline outline-2 outline-offset-4 shadow-[0_0_0_6px_#080818,0_0_0_8px_currentColor] bg-[radial-gradient(circle,transparent_30%,currentColor_31%,currentColor_33%,transparent_34%)] transition-all duration-300 ease-in-out`
- Fire: `bg-[#080818] border-[#dc2626] text-[#dc2626] outline-[#dc2626] shadow-[0_0_15px_rgba(220,38,38,0.5)]`
- Water: `bg-[#080818] border-[#38bdf8] text-[#38bdf8] outline-[#38bdf8] shadow-[0_0_15px_rgba(56,189,248,0.5)]`
- Wind: `bg-[#080818] border-[#a020f0] text-[#a020f0] outline-[#a020f0] shadow-[0_0_15px_rgba(160,32,240,0.5)]`

- Hover: `hover:shadow-[0_0_25px_rgba(220,38,38,0.7)] hover:scale-110`

### Dojo Panel
- Base: `relative bg-[#1a0f0a] bg-[repeating-linear-gradient(180deg,transparent,transparent_12px,rgba(139,90,43,0.08)_12px,rgba(139,90,43,0.08)_24px)] border border-[#dc2626]/20 border-b-4 border-b-[#dc2626]/30 transition-all duration-300 ease-in-out`
- Default: `border-[#dc2626]/20 shadow-[0_0_10px_rgba(220,38,38,0.15)]`
- Combat: `border-[#dc2626]/50 shadow-[0_0_20px_rgba(220,38,38,0.4)] bg-[#1a0f0a]/95 bg-[repeating-linear-gradient(180deg,transparent,transparent_12px,rgba(139,90,43,0.08)_12px,rgba(139,90,43,0.08)_24px)]`
- Meditation: `border-[#a020f0]/30 shadow-[0_0_15px_rgba(160,32,240,0.2)] bg-[#12080a]/90 bg-[repeating-linear-gradient(180deg,transparent,transparent_12px,rgba(139,90,43,0.06)_12px,rgba(139,90,43,0.06)_24px)]`

- Hover: `hover:shadow-[0_0_25px_rgba(220,38,38,0.5)] hover:border-[#dc2626]/40`

### Bushido Alert
- Base: `relative border-l-4 border-t-2 border-t-[#dc2626]/20 bg-[#080818]/90 font-serif tracking-[0.15em] before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-[#dc2626]/30 before:to-transparent transition-all duration-300 ease-in-out p-4 md:p-6`
- Honor: `border-l-[#38bdf8] shadow-[0_0_12px_rgba(56,189,248,0.3)] text-[#38bdf8]`
- Warning: `border-l-[#dc2626] shadow-[0_0_12px_rgba(220,38,38,0.3)] text-[#dc2626]`
- Defeat: `border-l-[#a020f0] shadow-[0_0_12px_rgba(160,32,240,0.3)] text-[#a020f0]`

- Hover: `hover:shadow-[0_0_20px_rgba(220,38,38,0.5)]`

### Blade Progress
- Base: `relative w-full h-2 bg-[#080818] border border-[#dc2626]/20 overflow-hidden shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)] transition-all duration-300 ease-in-out`
- Steel: `after:bg-[linear-gradient(105deg,#e2e8f0_0%,#cbd5e1_20%,#f1f5f9_40%,#94a3b8_60%,#e2e8f0_80%,#cbd5e1_100%)] shadow-[0_0_8px_rgba(226,232,240,0.3)]`
- Flame: `after:bg-[linear-gradient(105deg,#dc2626_0%,#f97316_30%,#dc2626_50%,#ef4444_70%,#f97316_100%)] shadow-[0_0_8px_rgba(220,38,38,0.4)]`
- Lightning: `after:bg-[linear-gradient(105deg,#a020f0_0%,#38bdf8_30%,#a020f0_50%,#818cf8_70%,#38bdf8_100%)] shadow-[0_0_8px_rgba(160,32,240,0.4)]`

- Hover: `hover:shadow-[0_0_15px_rgba(220,38,38,0.5)]`

## Forbidden Patterns
These classes must NEVER be used in Neon Samurai style:

- `rounded-full`
- `rounded-2xl`
- `rounded-xl`
- `rounded-lg`
- `bg-white`
- `bg-gray-50`
- `bg-gray-100`
- `text-gray-900`
- `shadow-md`
- `shadow-lg`

- Pattern: `^rounded-(?:full|2xl|xl|lg)$`
- Pattern: `^bg-(?:white|gray-(?:50|100))$`
- Pattern: `^bg-(?:pink|rose|sky|teal)-(?:50|100|200)$`
- Pattern: `^font-serif$`
- Pattern: `^shadow-(?:md|lg|xl)$`

### Why:
- `rounded-full`: Neon Samurai uses sharp angular geometry, no rounded shapes
- `bg-white`: Neon Samurai requires dark navy/black backgrounds only
- `shadow-md`: Use neon glow shadows with dual-color effects instead

## Do's
- Use dark navy backgrounds (bg-[#080818])
- Add katana diagonal slash-stroke decorations
- Use torii gate shapes as section frames
- Apply dual-color glow (stroke != glow color)
- Use armor-plate angular card shapes
- Add ink splatter burst accents on hover
- Use calligraphy brush-stroke dividers with neon glow

## Don'ts
- No soft pastel colors or light backgrounds
- No rounded-full or large border radius
- No organic/irregular rounded shapes
- No serif fonts
- No standard drop shadows (use neon glow only)

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
- Style: neon-samurai
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "霓虹武士着陆页"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 霓虹武士风 (Neon Samurai)