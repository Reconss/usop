---
name: cyber-wafuu
version: 1.0.0
description: Cyber Wafuu design style for web interfaces
keywords: [赛博和风, 数字和风, 青海波, 金继ぎ, 障子]
author: StyleKit
style_type: visual
---

# Cyber Wafuu Style

## Overview
青海波纹样与电路走线融合、鸟居门导航框架、麻叶纹网格、金继ぎ金色修复线、障子屏风格栅面板、传统纹样被科技'侵入'的日式赛博美学。

## Philosophy
Cyber Wafuu reimagines traditional Japanese visual culture through digital disruption, creating a sophisticated fusion where heritage patterns are "hacked" by technology.

## Design Tokens

### Border
- Width: `border`
- Color: `border-[#1e3a5f]/30`
- Radius: `rounded-none`

### Shadow
- Small: `shadow-[0_0_8px_rgba(56,189,248,0.2)]`
- Medium: `shadow-[0_0_15px_rgba(56,189,248,0.3)]`
- Large: `shadow-[0_0_20px_rgba(56,189,248,0.4)]`
- Hover: `hover:shadow-[0_0_20px_rgba(56,189,248,0.4)]`

### Typography
- Heading: `font-sans font-bold tracking-wider`
- Body: `font-sans`
- Hero: `text-4xl md:text-6xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-14 md:py-24 lg:py-32`
- Container: `px-6 md:px-10 lg:px-16`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#080814]`
- Secondary BG: `bg-[#1e3a5f]`
- Primary Text: `text-[#e2e8f0]`
- Primary Button: `bg-[#1e3a5f] text-[#e2e8f0] shadow-[0_0_12px_rgba(30,58,95,0.4)]`

## Component Recipes

### Button
- Base: `font-sans font-semibold tracking-wider border border-[#1e3a5f]/60 transition-all duration-300 ease-in-out`
- Primary: `bg-[#1e3a5f] text-[#e2e8f0] shadow-[0_0_12px_rgba(30,58,95,0.4)]`
- Secondary: `bg-[#080814] text-[#38bdf8] border-[#38bdf8]/40 shadow-[0_0_10px_rgba(56,189,248,0.2)]`
- Vermillion: `bg-[#c41e3a] text-white border-[#c41e3a]/60 shadow-[0_0_12px_rgba(196,30,58,0.4)]`
- Kintsugi Gold: `bg-[#080814] text-[#c9a227] border-[#c9a227]/40 shadow-[0_0_10px_rgba(201,162,39,0.25)]`

- Hover: `hover:shadow-[0_0_20px_rgba(56,189,248,0.4)] hover:border-[#38bdf8]/60`

### Card
- Base: `relative bg-[#080814] border border-[#1e3a5f]/30 transition-all duration-300 ease-in-out`
- Default: ``
- Indigo: `shadow-[0_0_15px_rgba(30,58,95,0.3)]`
- Vermillion: `border-[#c41e3a]/30 shadow-[0_0_15px_rgba(196,30,58,0.2)]`
- Kintsugi Gold: `border-[#c9a227]/20 shadow-[0_0_12px_rgba(201,162,39,0.15)]`

- Hover: `hover:shadow-[0_0_20px_rgba(56,189,248,0.3)] hover:border-[#38bdf8]/40`

### Input
- Base: `w-full border border-[#1e3a5f]/30 bg-[#080814] text-[#e2e8f0] placeholder:text-[#e2e8f0]/20 font-sans focus:outline-none transition-all duration-300 ease-in-out`
- Default: ``
- Electric: `border-[#38bdf8]/30`
- Vermillion: `border-[#c41e3a]/20`

### Shoji Screen
- Base: `relative bg-[#080814]/95 border border-[#1e3a5f]/30 before:content-[''] before:absolute before:inset-0 before:bg-[linear-gradient(to_right,rgba(30,58,95,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(30,58,95,0.08)_1px,transparent_1px)] before:bg-[size:25%_33.33%] before:pointer-events-none transition-all duration-300 ease-in-out`
- Default: `shadow-[0_0_10px_rgba(30,58,95,0.2)]`
- Illuminated: `bg-[#0c0c1a]/90 border-[#38bdf8]/20 shadow-[0_0_15px_rgba(56,189,248,0.2)]`
- Dark: `bg-[#040408] border-[#1e3a5f]/15 shadow-[0_0_8px_rgba(30,58,95,0.1)]`

- Hover: `hover:shadow-[0_0_20px_rgba(56,189,248,0.3)] hover:border-[#38bdf8]/30`

### Seigaiha Banner
- Base: `relative bg-[#080814] border-t-2 border-b-2 py-4 px-6 text-center transition-all duration-300 ease-in-out`
- Default: `border-[#1e3a5f]/40 text-[#e2e8f0] shadow-[0_0_10px_rgba(30,58,95,0.2)]`
- Golden: `border-[#c9a227]/40 text-[#c9a227] shadow-[0_0_10px_rgba(201,162,39,0.2)]`
- Cyan: `border-[#38bdf8]/40 text-[#38bdf8] shadow-[0_0_10px_rgba(56,189,248,0.2)]`

- Hover: `hover:shadow-[0_0_18px_rgba(56,189,248,0.3)]`

### Origami Card
- Base: `relative bg-[#080814] border border-[#1e3a5f]/25 before:content-[''] before:absolute before:top-0 before:right-0 before:w-0 before:h-0 before:border-t-[20px] before:border-t-[#1e3a5f]/20 before:border-l-[20px] before:border-l-transparent transition-all duration-300 ease-in-out`
- Default: `shadow-[0_0_10px_rgba(30,58,95,0.15)]`
- Crane: `border-[#c9a227]/20 before:border-t-[#c9a227]/20 shadow-[0_0_12px_rgba(201,162,39,0.15)]`
- Lotus: `border-[#c41e3a]/20 before:border-t-[#c41e3a]/20 shadow-[0_0_12px_rgba(196,30,58,0.15)]`

- Hover: `hover:shadow-[0_0_20px_rgba(56,189,248,0.25)] hover:border-[#38bdf8]/30`

### Torii Divider
- Base: `relative w-full h-px my-6 before:content-[''] before:absolute before:left-1/2 before:-translate-x-1/2 before:-top-2 before:w-12 before:h-1 before:rounded-full transition-all duration-300 ease-in-out`
- Default: `bg-[#1e3a5f]/30 before:bg-[#1e3a5f]/50 shadow-[0_0_6px_rgba(30,58,95,0.2)]`
- Golden: `bg-[#c9a227]/30 before:bg-[#c9a227]/50 shadow-[0_0_6px_rgba(201,162,39,0.2)]`
- Neon: `bg-[#38bdf8]/30 before:bg-[#38bdf8]/50 shadow-[0_0_8px_rgba(56,189,248,0.3)]`

- Hover: `hover:shadow-[0_0_12px_rgba(56,189,248,0.4)]`

### Furoshiki Wrap
- Base: `relative bg-[#080814] border border-[#1e3a5f]/20 rounded-sm before:content-[''] before:absolute before:-top-1 before:-right-1 before:w-3 before:h-3 before:rounded-full after:content-[''] after:absolute after:-bottom-1 after:-left-1 after:w-3 after:h-3 after:rounded-full transition-all duration-300 ease-in-out`
- Default: `before:bg-[#1e3a5f]/40 after:bg-[#1e3a5f]/40 shadow-[0_0_10px_rgba(30,58,95,0.15)]`
- Silk: `border-[#c9a227]/15 before:bg-[#c9a227]/40 after:bg-[#c9a227]/40 shadow-[0_0_10px_rgba(201,162,39,0.15)]`
- Digital: `border-[#38bdf8]/15 before:bg-[#38bdf8]/40 after:bg-[#38bdf8]/40 shadow-[0_0_10px_rgba(56,189,248,0.2)]`

- Hover: `hover:shadow-[0_0_18px_rgba(56,189,248,0.3)] hover:border-[#38bdf8]/25`

## Forbidden Patterns
These classes must NEVER be used in Cyber Wafuu style:

- `rounded-full`
- `rounded-2xl`
- `rounded-xl`
- `rounded-lg`
- `bg-white`
- `bg-gray-50`
- `bg-gray-100`
- `font-serif`
- `shadow-md`
- `shadow-lg`

- Pattern: `^rounded-(?:full|2xl|xl|lg)$`
- Pattern: `^bg-(?:white|gray-(?:50|100))$`
- Pattern: `^bg-(?:pink|rose)-(?:50|100|200)$`
- Pattern: `^font-serif$`
- Pattern: `^shadow-(?:md|lg|xl)$`

### Why:
- `rounded-full`: Cyber Wafuu uses sharp shoji-grid geometry, no rounded shapes
- `bg-white`: Cyber Wafuu requires dark indigo backgrounds
- `font-serif`: Cyber Wafuu uses clean geometric sans-serif fonts

## Do's
- Use dark indigo backgrounds (bg-[#080814])
- Add seigaiha wave pattern backgrounds with CSS repeating-radial-gradient
- Use shoji screen grid as card frame structure
- Apply kintsugi gold crack line borders and accents
- Use torii gate shape for navigation framing
- Add circuit trace connecting lines between elements
- Layer traditional patterns with digital overlay effects
- Use restrained interaction motion: subtle hover lift (1-2px) with circuit-glow amplification
- Trigger directional circuit sweeps or shoji-line brightening on hover/focus for ritual feedback

## Don'ts
- No soft pastel colors
- No organic irregular rounded shapes
- No Western serif fonts
- No rounded-full borders
- No light backgrounds (bg-white, bg-gray-50)
- No bouncy spring motion or large scale transforms
- No slow dreamy transitions beyond 320ms on interactive controls

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
- Style: cyber-wafuu
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "赛博和风着陆页"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 赛博和风 (Cyber Wafuu)