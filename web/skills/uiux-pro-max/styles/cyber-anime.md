---
name: cyber-anime
version: 1.0.0
description: Cyber Anime design style for web interfaces
keywords: [赛博动漫, HUD, 全息, 霓虹, 机甲]
author: StyleKit
style_type: visual
---

# Cyber Anime Style

## Overview
融合赛博朋克科幻UI与动漫美学，以HUD抬头显示、全息投影面板、机甲边框和多层霓虹光效，打造未来感十足的动漫界面风格。

## Philosophy
Cyber Anime fuses cyberpunk HUD interfaces with anime's expressive power. Every panel is a data terminal, every border a mecha frame.

## Design Tokens

### Border
- Width: `border`
- Color: `border-[#7c3aed]/30`
- Radius: `rounded-none`

### Shadow
- Small: `shadow-[0_0_10px_rgba(124,58,237,0.3)]`
- Medium: `shadow-[0_0_15px_rgba(124,58,237,0.4)]`
- Large: `shadow-[0_0_25px_rgba(124,58,237,0.5)]`
- Hover: `hover:shadow-[0_0_30px_rgba(124,58,237,0.6)]`

### Typography
- Heading: `font-sans font-bold uppercase tracking-widest`
- Body: `font-sans text-[#e0e0ff]/80`
- Hero: `text-5xl md:text-7xl lg:text-9xl`
- H1: `text-4xl md:text-6xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-16 md:py-24 lg:py-32`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-4 md:p-6`

### Colors
- Primary BG: `bg-[#0f0f1a]`
- Secondary BG: `bg-[#0f0f1a]/90`
- Primary Text: `text-[#e0e0ff]`
- Primary Button: `bg-[#7c3aed] text-white shadow-[0_0_15px_rgba(124,58,237,0.5)]`

## Component Recipes

### Holographic Button
- Base: `relative overflow-hidden font-sans font-bold uppercase tracking-widest border border-[#06d6a0]/50 transition-all duration-300 ease-out`
- Primary: `bg-[#7c3aed] text-white shadow-[0_0_10px_rgba(124,58,237,0.3),0_0_20px_rgba(124,58,237,0.15)]`
- Secondary: `bg-transparent text-[#06d6a0] border-[#06d6a0] shadow-[0_0_10px_rgba(6,214,160,0.3),0_0_20px_rgba(6,214,160,0.15)]`
- Accent: `bg-[#ff006e] text-white border-[#ff006e]/60 shadow-[0_0_10px_rgba(255,0,110,0.3),0_0_20px_rgba(255,0,110,0.15)]`
- Holographic: `bg-gradient-to-r from-[#7c3aed]/80 via-[#38bdf8]/80 to-[#06d6a0]/80 text-white border-[#06d6a0]/40 shadow-[0_0_15px_rgba(124,58,237,0.3),0_0_30px_rgba(6,214,160,0.1)]`

- Hover: `hover:shadow-[0_0_20px_rgba(124,58,237,0.5),0_0_40px_rgba(124,58,237,0.2)] hover:border-[#06d6a0]`

### HUD Panel
- Base: `relative overflow-hidden bg-[#0f0f1a]/90 border border-[#7c3aed]/30 backdrop-blur-sm transition-all duration-300 ease-out`
- Default: `shadow-[0_0_20px_rgba(124,58,237,0.2)]`
- Cyan: `border-[#06d6a0]/40 shadow-[0_0_20px_rgba(6,214,160,0.2)]`
- Pink: `border-[#ff006e]/30 shadow-[0_0_20px_rgba(255,0,110,0.15)]`
- Holographic: `border-[#7c3aed]/40 shadow-[0_0_15px_rgba(124,58,237,0.2),0_0_30px_rgba(6,214,160,0.1)] ca-scanlines`

- Hover: `hover:shadow-[0_0_30px_rgba(124,58,237,0.4),0_0_60px_rgba(124,58,237,0.1)] hover:border-[#7c3aed]/60`

### Terminal Input
- Base: `w-full bg-[#0f0f1a]/80 border border-[#7c3aed]/30 text-[#e0e0ff] placeholder:text-[#e0e0ff]/30 font-mono caret-[#06d6a0] focus:outline-none transition-all duration-300 ease-out`
- Default: ``
- Cyan: `border-[#06d6a0]/40 placeholder:text-[#06d6a0]/30 caret-[#06d6a0]`
- Pink: `border-[#ff006e]/30 placeholder:text-[#ff006e]/30 caret-[#ff006e]`

### HUD Status Bar
- Base: `relative flex items-center gap-2 bg-[#0f0f1a]/90 border border-[#7c3aed]/30 px-4 py-2 font-mono text-xs uppercase tracking-wider`
- Default: `text-[#7c3aed] shadow-[0_0_10px_rgba(124,58,237,0.2)]`
- Alert: `text-[#ff006e] border-[#ff006e]/40 shadow-[0_0_10px_rgba(255,0,110,0.2)]`
- Success: `text-[#06d6a0] border-[#06d6a0]/40 shadow-[0_0_10px_rgba(6,214,160,0.2)]`

### Hologram Panel
- Base: `relative bg-[#0f0f1a]/60 backdrop-blur-md border border-[#7c3aed]/20 overflow-hidden bg-[repeating-linear-gradient(0deg,transparent_0px,transparent_2px,rgba(124,58,237,0.03)_2px,rgba(124,58,237,0.03)_4px)] transition-all duration-300 ease-out`
- Default: `shadow-[0_0_20px_rgba(124,58,237,0.15)]`
- Cyan: `border-[#06d6a0]/30 shadow-[0_0_20px_rgba(6,214,160,0.15)]`
- Pink: `border-[#ff006e]/25 shadow-[0_0_20px_rgba(255,0,110,0.15)]`

- Hover: `hover:shadow-[0_0_30px_rgba(124,58,237,0.3)] hover:border-[#7c3aed]/40`

### Cockpit Nav
- Base: `flex items-center gap-1 bg-[#0f0f1a]/95 border-b border-[#7c3aed]/30 px-4 py-2 font-mono text-xs uppercase tracking-widest text-[#e0e0ff]/70`
- Default: `shadow-[0_2px_15px_rgba(124,58,237,0.15)]`
- Compact: `py-1 gap-0.5 text-[10px]`

### Data Stream
- Base: `relative bg-[#0f0f1a] border-l-2 border-[#7c3aed]/40 p-4 font-mono text-xs leading-relaxed overflow-hidden bg-[linear-gradient(180deg,rgba(124,58,237,0.08)_0%,transparent_15%,transparent_85%,rgba(124,58,237,0.08)_100%)]`
- Default: `text-[#7c3aed]/80`
- Cyan: `text-[#06d6a0]/80 border-l-[#06d6a0]/40`
- Pink: `text-[#ff006e]/80 border-l-[#ff006e]/40`

### Mission Briefing
- Base: `relative bg-[#0f0f1a]/90 border border-[#7c3aed]/30 p-4 font-mono text-sm [clip-path:polygon(0_0,calc(100%-8px)_0,100%_8px,100%_100%,8px_100%,0_calc(100%-8px))]`
- Info: `border-[#38bdf8]/40 text-[#38bdf8] shadow-[0_0_10px_rgba(56,189,248,0.1)]`
- Warning: `border-[#fbbf24]/40 text-[#fbbf24] shadow-[0_0_10px_rgba(251,191,36,0.1)]`
- Critical: `border-[#ff006e]/50 text-[#ff006e] shadow-[0_0_15px_rgba(255,0,110,0.2)]`

## Forbidden Patterns
These classes must NEVER be used in Cyber Anime style:

- `rounded-full`
- `bg-white`
- `bg-[#fafaf8]`
- `bg-[#fffbf0]`
- `shadow-sm`
- `shadow-md`
- `shadow-lg`
- `font-serif`
- `text-[#1a1a1a]`
- `border-2`

- Pattern: `^rounded-full$`
- Pattern: `^bg-white$`
- Pattern: `^bg-\[#f[a-f]`
- Pattern: `^shadow-(?:sm|md|lg|xl)$`
- Pattern: `^font-serif$`

### Why:
- `rounded-full`: Cyber Anime uses sharp geometric shapes with angled mecha corners, not circles
- `bg-white`: Cyber Anime uses dark backgrounds only, light surfaces break the HUD illusion
- `shadow-sm`: Cyber Anime uses neon glow shadows only, not soft elevation shadows

## Do's
- Use HUD corner frame decorations on major containers (angled bracket corners)
- Layer vertical scan line overlays on holographic panels
- Apply multi-layer neon glow (2-3 shadow layers with decreasing opacity)
- Use mecha-style angled corners via clip-path on panel borders
- Include terminal/data readout style text with monospace font
- Use hexagonal grid background pattern instead of square grid
- Keep all backgrounds dark (#0f0f1a) with semi-transparent overlays
- Use cockpit-like micro interactions: fast hover lift, active press, and glow amplification within 180-280ms

## Don'ts
- Never use soft pastel colors or natural organic tones
- Never use serif fonts - only geometric sans-serif or monospace
- Never use rounded-full - all shapes must be angular/geometric
- Never use light or white backgrounds as primary surfaces
- Never use bouncy spring animations or playful elastic motion
- Never use slow cinematic transitions over 400ms for controls

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
- Style: cyber-anime
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "HUD仪表盘"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 赛博动漫风 (Cyber Anime)