---
name: magic-circle
version: 1.0.0
description: Magic Circle design style for web interfaces
keywords: [魔法阵, 符文, 神秘, 奇幻, 光效]
author: StyleKit
style_type: visual
---

# Magic Circle Style

## Overview
同心圆环嵌套体系、六芒星几何核心、符文铭文沿圆路径排列、生命之花神圣几何、金色辉光辐射与炼金术符号交织的奇幻视觉风格。

## Philosophy
Magic Circle draws from the arcane tradition of geometric summoning circles, weaving precision geometry with radiant light effects.

## Design Tokens

### Border
- Width: `border`
- Color: `border-[#fbbf24]/15`
- Radius: `rounded-sm`

### Shadow
- Small: `shadow-[0_0_10px_rgba(251,191,36,0.1)]`
- Medium: `shadow-[0_0_20px_rgba(251,191,36,0.2)]`
- Large: `shadow-[0_0_30px_rgba(251,191,36,0.3)]`
- Hover: `hover:shadow-[0_0_30px_rgba(251,191,36,0.4)]`

### Typography
- Heading: `font-serif font-bold tracking-wide`
- Body: `font-sans`
- Hero: `text-4xl md:text-6xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-14 md:py-24 lg:py-32`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#0a0920]`
- Secondary BG: `bg-[#1e1b4b]`
- Primary Text: `text-[#e2e8f0]`
- Primary Button: `bg-[#1e1b4b] text-[#fbbf24] shadow-[0_0_20px_rgba(251,191,36,0.2)]`

## Component Recipes

### Button
- Base: `font-serif font-semibold tracking-wide border border-[#fbbf24]/30 rounded-sm transition-all duration-500 ease-in-out`
- Primary: `bg-[#1e1b4b] text-[#fbbf24] shadow-[0_0_20px_rgba(251,191,36,0.2)]`
- Secondary: `bg-[#0a0920] text-[#e2e8f0] border-[#818cf8]/30 shadow-[0_0_15px_rgba(129,140,248,0.2)]`
- Gold: `bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] text-[#0a0920] border-[#fbbf24]/60 shadow-[0_0_20px_rgba(251,191,36,0.3)]`
- Runic: `bg-[#0a0920] text-[#fbbf24] border-[#fbbf24]/20 shadow-[0_0_15px_rgba(251,191,36,0.15)] font-mono tracking-widest`

- Hover: `hover:shadow-[0_0_35px_rgba(251,191,36,0.5)] hover:border-[#fbbf24]/60`

### Card
- Base: `relative bg-[#0a0920] border border-[#fbbf24]/15 rounded-sm transition-all duration-500 ease-in-out`
- Default: ``
- Gold Glow: `shadow-[0_0_20px_rgba(251,191,36,0.15)]`
- Indigo Glow: `border-[#818cf8]/20 shadow-[0_0_20px_rgba(129,140,248,0.15)]`
- Sacred Geometry: `shadow-[0_0_25px_rgba(251,191,36,0.2)] border-[#fbbf24]/25`

- Hover: `hover:shadow-[0_0_30px_rgba(251,191,36,0.3)] hover:border-[#fbbf24]/30`

### Input
- Base: `w-full rounded-sm border border-[#fbbf24]/15 bg-[#0a0920] text-[#e2e8f0] placeholder:text-[#e2e8f0]/25 font-sans focus:outline-none transition-all duration-500 ease-in-out`
- Default: ``
- Gold: `border-[#fbbf24]/25`
- Indigo: `border-[#818cf8]/20`

### Rune Glyph
- Base: `inline-flex items-center justify-center rounded-full bg-[#0a0920] border-2 font-serif outline outline-2 outline-offset-4 outline-[#fbbf24]/20 shadow-[0_0_15px_rgba(251,191,36,0.15),inset_0_0_10px_rgba(251,191,36,0.1)]`
- Gold: `border-[#fbbf24]/50 text-[#fbbf24] shadow-[0_0_15px_rgba(251,191,36,0.2)]`
- Silver: `border-[#e2e8f0]/40 text-[#e2e8f0] shadow-[0_0_15px_rgba(226,232,240,0.15)]`
- Indigo: `border-[#818cf8]/40 text-[#818cf8] shadow-[0_0_15px_rgba(129,140,248,0.2)]`

### Summoning Panel
- Base: `relative bg-[#0a0920] border border-[#fbbf24]/15 rounded-sm overflow-hidden transition-all duration-500 ease-in-out bg-[radial-gradient(circle_at_50%_50%,rgba(251,191,36,0.04)_0%,transparent_50%)] outline outline-1 outline-offset-4 outline-[#fbbf24]/10`
- Default: `shadow-[0_0_20px_rgba(251,191,36,0.1)]`
- Golden: `border-[#fbbf24]/30 shadow-[0_0_30px_rgba(251,191,36,0.2)] bg-[radial-gradient(circle_at_50%_50%,rgba(251,191,36,0.04)_0%,transparent_70%)]`
- Ethereal: `border-[#818cf8]/25 shadow-[0_0_25px_rgba(129,140,248,0.15)] bg-[radial-gradient(circle_at_50%_50%,rgba(129,140,248,0.04)_0%,transparent_70%)]`

- Hover: `hover:shadow-[0_0_40px_rgba(251,191,36,0.3)] hover:border-[#fbbf24]/30`

### Spellbook Tab
- Base: `px-4 py-2 font-serif text-sm border-b-2 border-transparent transition-all duration-300 text-[#e2e8f0]/60`
- Active: `text-[#fbbf24] border-b-[#fbbf24] shadow-[0_2px_0_#fbbf24,0_4px_0_rgba(251,191,36,0.3)] [text-shadow:0_0_8px_rgba(251,191,36,0.4)]`
- Inactive: `text-[#e2e8f0]/40 border-b-transparent`
- Locked: `text-[#e2e8f0]/20 border-b-transparent cursor-not-allowed opacity-50`

- Hover: `hover:text-[#fbbf24]/80`

### Mana Bar
- Base: `relative h-5 bg-[#0a0920] border border-[#fbbf24]/20 rounded-sm overflow-hidden outline outline-1 outline-offset-2 outline-[#fbbf24]/15 shadow-[0_0_8px_rgba(251,191,36,0.1)]`
- Mana: `[&>.fill]:bg-gradient-to-r [&>.fill]:from-[#818cf8] [&>.fill]:to-[#6366f1] shadow-[0_0_10px_rgba(129,140,248,0.2)]`
- Health: `[&>.fill]:bg-gradient-to-r [&>.fill]:from-[#ef4444] [&>.fill]:to-[#dc2626] shadow-[0_0_10px_rgba(239,68,68,0.2)]`
- Stamina: `[&>.fill]:bg-gradient-to-r [&>.fill]:from-[#fbbf24] [&>.fill]:to-[#f59e0b] shadow-[0_0_10px_rgba(251,191,36,0.2)]`

### Enchantment Alert
- Base: `relative bg-[#0a0920] border-l-2 border-l-[#fbbf24]/30 rounded-sm p-4 font-serif text-sm shadow-[-6px_0_0_-2px_rgba(251,191,36,0.15)] bg-[radial-gradient(circle_at_0%_50%,rgba(251,191,36,0.04)_0%,transparent_50%)]`
- Blessing: `border-[#fbbf24]/30 text-[#fbbf24] shadow-[0_0_15px_rgba(251,191,36,0.15)]`
- Curse: `border-[#818cf8]/30 text-[#818cf8] shadow-[0_0_15px_rgba(129,140,248,0.15)]`
- Neutral: `border-[#e2e8f0]/20 text-[#e2e8f0] shadow-[0_0_10px_rgba(226,232,240,0.1)]`

## Forbidden Patterns
These classes must NEVER be used in Magic Circle style:

- `rounded-full`
- `rounded-2xl`
- `rounded-xl`
- `rounded-lg`
- `bg-white`
- `bg-gray-50`
- `border-4`
- `border-8`
- `shadow-md`
- `shadow-lg`

- Pattern: `^rounded-(?:full|2xl|xl|lg)$`
- Pattern: `^bg-(?:white|gray-(?:50|100))$`
- Pattern: `^border-(?:4|8)$`
- Pattern: `^shadow-(?:md|lg|xl)$`

### Why:
- `rounded-full`: Magic Circle uses rounded-sm only for refined elegance
- `bg-white`: Magic Circle requires deep dark backgrounds for mystical atmosphere
- `border-4`: Magic Circle uses thin elegant borders only

## Do's
- Use deep dark navy backgrounds (bg-[#0a0920])
- Add concentric ring decorations around focal elements
- Use hexagonal or circular card layouts
- Apply runic inscription marks along borders
- Add golden glow radiation from center of elements
- Use sacred geometry patterns as subtle backgrounds
- Place alchemical symbols at geometric intersection points
- 卡片使用 group 类，hover 时内部虚线同心圆环触发旋转：group-hover:rotate-180 transition-all duration-[3000ms] ease-linear（Arcane Rotation，法阵启动）
- 按钮 active:scale-95 active:shadow-[inset_0_0_30px_rgba(251,191,36,0.6)]（Energy Convergence，能量聚焦内爆）
- focus:ring-2 focus:ring-[#fbbf24]/50 focus:ring-offset-2 focus:ring-offset-[#0a0920]

## Don'ts
- No bright neon colors (use warm gold and cool indigo only)
- No brutalist style elements
- No pixel art aesthetics
- No heavy/thick borders
- No informal/handwritten fonts
- 禁止按钮缺少 active:scale-95（魔法施放必须有能量聚焦感）
- 禁止环形装饰在 group-hover 时静止不动（法阵启动的核心视觉语言）
- 禁止 focus:ring 缺少 focus:ring-offset-[#0a0920]（深色背景下焦点环必须有偏移分离）

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
- Style: magic-circle
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "魔法阵主题页面"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 魔法阵风 (Magic Circle)