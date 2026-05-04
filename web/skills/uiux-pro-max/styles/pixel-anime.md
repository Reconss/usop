---
name: pixel-anime
version: 1.0.0
description: Pixel Anime design style for web interfaces
keywords: [像素动漫, JRPG, 8-bit, RPG对话框, 像素]
author: StyleKit
style_type: visual
---

# Pixel Anime Style

## Overview
将经典JRPG游戏UI与像素动漫美学融合，以RPG对话框、状态条、像素边框和NES色板打造怀旧8-bit游戏界面风格。

## Philosophy
Pixel Anime merges classic JRPG game UI with pixel-art anime aesthetics. Every element feels like it belongs in a 16-bit RPG menu screen.

## Design Tokens

### Border
- Width: `border-2`
- Color: `border-[#1a1040]`
- Radius: `rounded-none`

### Shadow
- Small: `shadow-[2px_2px_0px_#1a1040]`
- Medium: `shadow-[4px_4px_0px_#1a1040]`
- Large: `shadow-[6px_6px_0px_#1a1040]`
- Hover: `hover:shadow-[6px_6px_0px_#1a1040]`

### Typography
- Heading: `font-mono font-bold uppercase tracking-wider`
- Body: `font-mono text-[#e0e0ff]/80`
- Hero: `text-4xl md:text-6xl lg:text-7xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-xs md:text-sm`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-4 md:p-6`

### Colors
- Primary BG: `bg-[#2d1b69]`
- Secondary BG: `bg-[#1a1040]`
- Primary Text: `text-[#e0e0ff]`
- Primary Button: `bg-[#4a90d9] text-white shadow-[4px_4px_0px_#1a1040]`

## Component Recipes

### RPG Menu Button
- Base: `relative font-mono font-bold uppercase tracking-wider border-2 border-[#1a1040] shadow-[4px_4px_0px_#1a1040] transition-all duration-150 ease-linear`
- Primary: `bg-[#4a90d9] text-white`
- Secondary: `bg-[#ff6b6b] text-white`
- Gold: `bg-transparent text-[#ffd93d] border-2 border-[#ffd93d] shadow-[3px_3px_0px_#1a1040]`
- Green: `bg-[#50c878] text-white`

- Hover: `hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#1a1040]`

### RPG Dialogue Box
- Base: `relative bg-[#1a1040] border-2 border-[#4a90d9] shadow-[4px_4px_0px_#1a1040] transition-all duration-150 ease-linear`
- Default: `border-[#4a90d9]`
- Gold: `border-[#ffd93d]`
- Red: `border-[#ff6b6b]`
- Green: `border-[#50c878]`

- Hover: `hover:shadow-[6px_6px_0px_#1a1040] hover:border-[#ffd93d]`

### Pixel Input
- Base: `w-full bg-[#1a1040] border-2 border-[#4a90d9] text-[#e0e0ff] placeholder:text-[#e0e0ff]/40 placeholder:uppercase font-mono caret-[#ffd93d] focus:outline-none transition-all duration-150 ease-linear`
- Default: ``
- Gold: `border-[#ffd93d] placeholder:text-[#ffd93d]/40`
- Red: `border-[#ff6b6b] placeholder:text-[#ff6b6b]/40`

### Sprite Frame
- Base: `relative bg-[#1a1040] border-2 border-[#4a90d9] outline outline-2 outline-offset-2 outline-[#4a90d9]/40 shadow-[4px_4px_0px_#1a1040]`
- Default: ``
- Golden: `border-[#ffd93d] shadow-[4px_4px_0px_#8b6914]`
- Dark: `bg-[#0f0a2a] border-[#2d1b69] shadow-[4px_4px_0px_#0a0520]`

- Hover: `hover:shadow-[6px_6px_0px_#1a1040]`

### Dialogue Box
- Base: `relative bg-[#1a1040] border-2 border-[#4a90d9] p-4 pb-6 font-mono text-sm text-[#e0e0ff] after:content-[''] after:absolute after:bottom-[-8px] after:left-4 after:w-0 after:h-0 after:border-l-[8px] after:border-l-transparent after:border-r-[8px] after:border-r-transparent after:border-t-[8px] after:border-t-[#4a90d9]`
- Default: ``
- NPC: `border-[#50c878]`
- System: `border-[#ffd93d] text-[#ffd93d]`

### Pixel Badge
- Base: `inline-flex items-center justify-center font-mono font-bold uppercase tracking-wider border-2 bg-[#1a1040] outline outline-1 outline-offset-1 outline-current/30`
- Blue: `text-[#4a90d9] border-[#4a90d9] shadow-[2px_2px_0px_#1a1040]`
- Red: `text-[#ff6b6b] border-[#ff6b6b] shadow-[2px_2px_0px_#1a1040]`
- Yellow: `text-[#ffd93d] border-[#ffd93d] shadow-[2px_2px_0px_#1a1040]`
- Green: `text-[#50c878] border-[#50c878] shadow-[2px_2px_0px_#1a1040]`

### HP Bar
- Base: `relative h-5 bg-[#1a1040] border-2 border-[#4a90d9] overflow-hidden`
- HP: `[&>.fill]:bg-[#ff6b6b] border-[#ff6b6b]`
- MP: `[&>.fill]:bg-[#4a90d9] border-[#4a90d9]`
- EXP: `[&>.fill]:bg-[#ffd93d] border-[#ffd93d]`

### Menu Panel
- Base: `relative bg-[#1a1040] border-2 border-[#4a90d9] shadow-[4px_4px_0px_#1a1040] font-mono text-[#e0e0ff]`
- Default: ``
- Dark: `bg-[#0f0a2a] border-[#2d1b69]`
- Golden: `border-[#ffd93d] shadow-[4px_4px_0px_#8b6914]`

- Hover: `hover:shadow-[6px_6px_0px_#1a1040]`

## Forbidden Patterns
These classes must NEVER be used in Pixel Anime style:

- `rounded-lg`
- `rounded-xl`
- `rounded-2xl`
- `rounded-full`
- `bg-gradient-to-r`
- `bg-gradient-to-b`
- `bg-gradient-to-br`
- `shadow-sm`
- `shadow-md`
- `shadow-lg`

- Pattern: `^rounded-(?:lg|xl|2xl|full)$`
- Pattern: `^bg-gradient-`
- Pattern: `^shadow-(?:sm|md|lg|xl)$`
- Pattern: `^backdrop-blur`
- Pattern: `^font-serif$`

### Why:
- `rounded-lg`: Pixel Anime uses sharp corners only -- pixels cannot be round
- `bg-gradient-to-r`: Pixel Anime uses flat solid colors, no smooth gradients allowed
- `shadow-md`: Pixel Anime uses hard offset pixel shadows only, never soft shadows

## Do's
- Use RPG dialogue box frames with 4px borders and corner block decorations
- Include HP/MP/EXP status bar UI elements with flat fills
- Apply hard offset shadows (4px_4px_0px) for pixel depth
- Use monospace font exclusively for all text
- Keep interactions step-based (translate-x/y in 2px increments)
- Use NES-palette colors: blue #4a90d9, red #ff6b6b, gold #ffd93d, green #50c878
- Add pixel corner block decorations on major containers
- Framerate Drop: use `duration-75 ease-linear` for all transitions to simulate 15fps GBA/NDS-era animation cadence
- Blocky Aura: hover glow must be hard-edge multi-directional colored shadows with zero blur: `hover:shadow-[4px_4px_0_#ffd93d,-2px_-2px_0_#ffd93d]`
- Anime Action: button active state applies squash-and-stretch `active:scale-x-110 active:scale-y-90` — classic Japanese animation physics on press
- Corner Blink: card corner pixel squares use `group-hover:animate-pulse` to simulate game UI idle standby animation; never animate in non-hover state

## Don'ts
- Never use smooth gradients (linear-gradient, radial-gradient)
- Never use rounded corners (rounded-lg/xl/full)
- Never use blur effects (blur, backdrop-blur)
- Never use serif fonts
- Never use `ease-in-out` or `ease` curves — only `ease-linear` or `transition-none` (pixel animations are abrupt, not organic)
- Never use blurred glow shadows for the Blocky Aura effect — zero blur is mandatory for 8-bit authenticity
- Never trigger Corner Blink animation outside of `group-hover` state — idle blinking on load creates visual noise

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
- Style: pixel-anime
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "JRPG角色面板"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 像素动漫风 (Pixel Anime)