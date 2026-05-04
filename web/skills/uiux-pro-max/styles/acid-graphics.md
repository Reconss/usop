---
name: acid-graphics
version: 1.0.0
description: Acid Graphics design style for web interfaces
keywords: [酸性, 迷幻, 荧光, 扭曲, 锐舞]
author: StyleKit
style_type: visual
---

# Acid Graphics Style

## Overview
高饱和度荧光色彩、扭曲字体、液态流动形态和迷幻视觉。源于锐舞文化和地下俱乐部美学，以强烈的视觉冲击力呈现反叛与实验精神。

## Philosophy
Acid Graphics 源于90年代锐舞文化和地下俱乐部场景，融合了赛博朋克、迷幻艺术和实验排版。

## Design Tokens

### Border
- Width: `border-2`
- Color: `border-[#39ff14]`
- Radius: `rounded-none`

### Shadow
- Small: `shadow-[2px_2px_0px_#a020f0]`
- Medium: `shadow-[4px_4px_0px_#a020f0]`
- Large: `shadow-[6px_6px_0px_#a020f0]`
- Hover: `hover:shadow-[8px_8px_0px_#a020f0]`

### Typography
- Heading: `font-mono font-black uppercase tracking-widest`
- Body: `font-mono`
- Hero: `text-5xl md:text-7xl lg:text-9xl`
- H1: `text-4xl md:text-6xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#0a0a0a]`
- Secondary BG: `bg-[#111111]`
- Primary Text: `text-[#39ff14]`
- Primary Button: `bg-[#39ff14] text-[#0a0a0a] shadow-[4px_4px_0px_#a020f0]`

## Component Recipes

### Button
- Base: `font-mono font-bold uppercase tracking-widest rounded-none transition-all duration-150 ease-out`
- Neon Green: `bg-[#39ff14] text-[#0a0a0a] border-2 border-[#39ff14] shadow-[4px_4px_0px_#a020f0]`
- Electric Purple: `bg-[#a020f0] text-[#39ff14] border-2 border-[#a020f0] shadow-[4px_4px_0px_#e6ff00]`
- Cyber Pink: `bg-[#ff6ec7] text-[#0a0a0a] border-2 border-[#ff6ec7] shadow-[4px_4px_0px_#39ff14]`
- Wireframe: `bg-transparent text-[#39ff14] border-2 border-[#39ff14] shadow-[3px_3px_0px_#ff6ec7]`

- Hover: `hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#a020f0] hover:brightness-110`

### Card
- Base: `bg-[#0a0a0a] rounded-none border-2 border-[#39ff14] shadow-[5px_5px_0px_#a020f0] transition-all duration-150 ease-out`
- Default: ``
- Purple Glow: `border-[#a020f0] shadow-[5px_5px_0px_#39ff14]`
- Pink Glow: `border-[#ff6ec7] shadow-[5px_5px_0px_#e6ff00]`
- Acid Yellow: `border-[#e6ff00] shadow-[5px_5px_0px_#ff6ec7]`

- Hover: `hover:shadow-[8px_8px_0px_#a020f0] hover:border-[#e6ff00]`

### Input
- Base: `w-full rounded-none border-2 border-[#39ff14]/60 bg-[#0a0a0a] text-[#39ff14] placeholder:text-[#39ff14]/25 font-mono focus:outline-none transition-all duration-150 ease-out`
- Default: ``
- Purple: `border-[#a020f0]/60 text-[#a020f0] placeholder:text-[#a020f0]/25`
- Pink: `border-[#ff6ec7]/60 text-[#ff6ec7] placeholder:text-[#ff6ec7]/25`

### Warped Banner
- Base: `relative w-full py-6 px-8 bg-gradient-to-r from-[#39ff14] via-[#a020f0] to-[#ff6ec7] skew-y-[-2deg] rounded-none font-mono uppercase tracking-widest [text-shadow:2px_0_#ff0000,-2px_0_#00ffff]`
- Default: ``
- Purple: `from-[#a020f0] via-[#ff6ec7] to-[#e6ff00]`
- Pink: `from-[#ff6ec7] via-[#e6ff00] to-[#39ff14]`

### Scanline Overlay
- Base: `relative bg-[#0a0a0a] border-2 border-[#39ff14]/30 rounded-none overflow-hidden p-6 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(57,255,20,0.03)_2px,rgba(57,255,20,0.03)_4px)]`
- Default: ``
- Dense: `bg-[repeating-linear-gradient(0deg,transparent,transparent_1px,rgba(57,255,20,0.05)_1px,rgba(57,255,20,0.05)_2px)]`
- Subtle: `bg-[repeating-linear-gradient(0deg,transparent,transparent_4px,rgba(57,255,20,0.02)_4px,rgba(57,255,20,0.02)_8px)]`

### Glitch Badge
- Base: `inline-flex items-center justify-center font-mono font-bold uppercase tracking-wider rounded-none bg-[#0a0a0a]`
- Green: `text-[#39ff14] border border-[#39ff14] shadow-[2px_2px_0px_#a020f0] [text-shadow:2px_1px_#ff0000,-2px_-1px_#0000ff]`
- Purple: `text-[#a020f0] border border-[#a020f0] shadow-[2px_2px_0px_#39ff14] [text-shadow:2px_1px_#39ff14,-2px_-1px_#ff6ec7]`
- Pink: `text-[#ff6ec7] border border-[#ff6ec7] shadow-[2px_2px_0px_#e6ff00] [text-shadow:2px_1px_#a020f0,-2px_-1px_#39ff14]`
- Yellow: `text-[#e6ff00] border border-[#e6ff00] shadow-[2px_2px_0px_#ff6ec7] [text-shadow:2px_1px_#ff6ec7,-2px_-1px_#a020f0]`

### Acid Progress
- Base: `relative h-6 bg-[#0a0a0a] border-2 border-[#39ff14]/40 rounded-none overflow-hidden [&>.fill]:mix-blend-screen`
- Green: `[&>.fill]:bg-[repeating-linear-gradient(90deg,#39ff14_0px,#39ff14_4px,#0a0a0a_4px,#0a0a0a_6px)]`
- Purple: `[&>.fill]:bg-[repeating-linear-gradient(90deg,#a020f0_0px,#a020f0_4px,#0a0a0a_4px,#0a0a0a_6px)]`
- Pink: `[&>.fill]:bg-[repeating-linear-gradient(90deg,#ff6ec7_0px,#ff6ec7_4px,#0a0a0a_4px,#0a0a0a_6px)]`

### Distortion Divider
- Base: `relative w-full h-6 flex items-center justify-center bg-[linear-gradient(90deg,#39ff14,#a020f0,#ff6ec7,#e6ff00)] [clip-path:polygon(0_40%,5%_60%,10%_35%,15%_55%,20%_30%,25%_65%,30%_40%,35%_60%,40%_25%,45%_70%,50%_35%,55%_55%,60%_30%,65%_65%,70%_45%,75%_55%,80%_30%,85%_60%,90%_40%,95%_55%,100%_35%,100%_65%,95%_45%,90%_60%,85%_40%,80%_70%,75%_45%,70%_55%,65%_35%,60%_70%,55%_45%,50%_65%,45%_30%,40%_75%,35%_40%,30%_60%,25%_35%,20%_70%,15%_45%,10%_65%,5%_40%,0_60%)] shadow-[2px_0_#ff0000,-2px_0_#00ffff]`
- Default: ``
- Thick: `bg-[length:100%_4px]`
- Dotted: `bg-[repeating-linear-gradient(90deg,#39ff14_0px,#39ff14_4px,transparent_4px,transparent_8px,#ff6ec7_8px,#ff6ec7_12px,transparent_12px,transparent_16px)]`

## Forbidden Patterns
These classes must NEVER be used in Acid Graphics style:

- `rounded-md`
- `rounded-lg`
- `rounded-xl`
- `rounded-2xl`
- `rounded-full`
- `bg-gradient-to-r`
- `bg-gradient-to-b`
- `bg-gradient-to-br`
- `shadow-md`
- `shadow-lg`

- Pattern: `^rounded-(?:md|lg|xl|2xl|full)$`
- Pattern: `^bg-gradient-`
- Pattern: `^shadow-(?:sm|md|lg|xl|2xl)$`
- Pattern: `^backdrop-blur`
- Pattern: `^font-serif$`

### Why:
- `rounded-lg`: Acid Graphics uses sharp edges only (rounded-none) - digital brutalism
- `bg-gradient-to-r`: Acid Graphics uses flat fluorescent colors, no gradients - colors are raw and unblended
- `shadow-md`: Acid Graphics uses hard offset shadows (shadow-[Npx_Npx_0px_color]), never soft shadows

## Do's
- 使用纯黑 #0a0a0a 作为主背景
- 使用荧光色系（绿 #39ff14、黄 #e6ff00、紫 #a020f0、粉 #ff6ec7）
- 使用等宽字体 font-mono
- 保持直角边缘（rounded-none）
- 使用硬边偏移阴影（shadow-[Npx_Npx_0px_color]）
- 文字全部大写 uppercase tracking-widest
- 添加扫描线叠加效果
- 使用 skew/rotate 创造扭曲感
- 使用极短或无过渡的生硬动画（duration-75 或 duration-0）
- 悬停时加入故障感反馈（如 hover:-skew-x-6、瞬时反差变化）

## Don'ts
- 禁止使用柔和的粉彩色或低饱和度色
- 禁止使用圆角（rounded-md 及以上）
- 禁止使用衬线字体
- 禁止使用白色或浅色背景
- 禁止使用渐变（所有颜色必须是纯平面荧光色）
- 禁止使用平滑抛光感动效（ease-in-out、缓慢微交互）

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
- Style: acid-graphics
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "酸性平面着陆页"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 酸性平面设计 (Acid Graphics)