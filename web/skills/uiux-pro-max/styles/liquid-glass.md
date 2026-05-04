---
name: liquid-glass
version: 1.0.0
description: Apple Liquid Glass design style for web interfaces
keywords: [Apple, Liquid Glass, 流动玻璃, 彩虹边缘, 折射]
author: StyleKit
style_type: visual
---

# Apple Liquid Glass Style

## Overview
Apple WWDC 2025 发布的全新设计语言，通过 SVG 折射滤镜、彩虹边缘光晕、流体形变动画和多层玻璃堆叠，创造出超越传统毛玻璃的有机流动视觉体验。

## Philosophy
Liquid Glass（流动玻璃）是 Apple WWDC 2025 发布的革命性设计语言，超越传统毛玻璃效果，通过光线折射、彩虹边缘和流体动画创造出真正有机、流动的视觉体验。

## Design Tokens

### Border
- Width: `border`
- Color: `border-white/20`
- Radius: `rounded-[24px]`

### Shadow
- Small: `shadow-lg shadow-black/5`
- Medium: `shadow-xl shadow-black/10`
- Large: `shadow-2xl shadow-black/15`
- Hover: `hover:shadow-xl hover:shadow-black/15`

### Typography
- Heading: `font-black bg-gradient-to-r from-[#a855f7] via-[#ff2d92] to-[#a855f7] bg-clip-text text-transparent`
- Body: `text-white/80`
- Hero: `text-5xl md:text-7xl lg:text-8xl`
- H1: `text-4xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-16 md:py-24`
- Container: `px-6 md:px-8`
- Card: `p-6 md:p-8`

### Colors
- Primary BG: `bg-white/10 backdrop-blur-[40px] backdrop-saturate-[1.8]`
- Secondary BG: `bg-white/15 backdrop-blur-[40px] backdrop-saturate-[1.8]`
- Primary Text: `text-white`
- Primary Button: `bg-gradient-to-r from-[#ff2d92] to-[#a855f7] text-white font-bold`

## Component Recipes

### Button
- Base: `relative font-medium backdrop-blur-[40px] backdrop-saturate-[1.8] rounded-[20px] text-white before:absolute before:inset-0 before:rounded-[20px] before:p-[1px] before:-z-10 before:bg-gradient-to-r before:from-[#ff6b6b] before:via-[#4ecdc4] before:to-[#a855f7] after:absolute after:inset-[1px] after:rounded-[19px] after:-z-10 after:bg-gradient-to-b after:from-white/20 after:to-transparent transition-all duration-500 ease-out`
- Primary: `bg-white/10 shadow-lg shadow-black/5`
- Secondary: `bg-white/5 shadow-md shadow-black/5`
- Accent: `bg-[#007AFF]/20 shadow-lg shadow-[#007AFF]/20 before:bg-gradient-to-r before:from-[#007AFF] before:to-[#5AC8FA]`
- Outline: `bg-transparent border border-white/30 before:bg-transparent`

- Hover: `hover:bg-white/15 hover:shadow-xl hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]`

### Card
- Base: `relative bg-white/10 backdrop-blur-[40px] backdrop-saturate-[1.8] rounded-[24px] shadow-xl shadow-black/10 before:absolute before:inset-0 before:rounded-[24px] before:p-[1px] before:-z-10 before:bg-gradient-to-br before:from-[#ff6b6b] before:via-[#4ecdc4] before:to-[#a855f7] after:absolute after:inset-[1px] after:rounded-[23px] after:-z-10 after:bg-gradient-to-b after:from-white/15 after:to-transparent [box-shadow:inset_0_1px_0_rgba(255,255,255,0.4)] transition-all duration-500 ease-out`
- Default: ``
- Light: `bg-white/15`
- Dark: `bg-black/20`
- Accent: `bg-[#007AFF]/15 before:bg-gradient-to-br before:from-[#007AFF] before:to-[#5AC8FA]`

- Hover: `hover:bg-white/15 hover:shadow-2xl hover:shadow-[0_0_30px_rgba(168,85,247,0.2)]`

### Input
- Base: `w-full bg-white/10 backdrop-blur-[40px] backdrop-saturate-[1.8] rounded-[16px] border border-white/20 text-white placeholder:text-white/50 focus:outline-none transition-all duration-500 ease-out`
- Default: ``
- Filled: `bg-white/15`

### Glass Panel
- Base: `relative bg-white/8 backdrop-blur-[40px] backdrop-saturate-[1.8] rounded-[32px] shadow-2xl shadow-black/20 before:absolute before:inset-0 before:rounded-[32px] before:p-[1px] before:-z-10 before:bg-gradient-to-br before:from-[#ff6b6b] before:via-[#4ecdc4] before:to-[#a855f7] after:absolute after:inset-[1px] after:rounded-[31px] after:-z-10 after:bg-gradient-to-b after:from-white/20 after:to-transparent`
- Default: ``

### Refraction Badge
- Base: `relative inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-[40px] backdrop-saturate-[1.8] rounded-full before:absolute before:inset-0 before:rounded-full before:p-[1px] before:-z-10 before:bg-gradient-to-r before:from-[#ff6b6b] before:via-[#4ecdc4] before:to-[#a855f7] after:absolute after:inset-[1px] after:rounded-full after:-z-10 after:bg-gradient-to-b after:from-white/30 after:to-transparent text-white`
- Default: ``
- Success: `before:bg-gradient-to-r before:from-[#34C759] before:to-[#30D158]`
- Warning: `before:bg-gradient-to-r before:from-[#FF9500] before:to-[#FFCC00]`
- Error: `before:bg-gradient-to-r before:from-[#FF2D55] before:to-[#FF3B30]`

### Glass Stack
- Base: `relative`
- Default: ``

### Navigation
- Base: `bg-white/5 backdrop-blur-[40px] backdrop-saturate-[1.8] border-b border-white/10 [box-shadow:0_1px_0_0_rgba(255,255,255,0.1),inset_0_-1px_0_0_rgba(168,85,247,0.2)] px-4 md:px-8 py-3 md:py-4`
- Default: ``
- Solid: `bg-white/10`

### Toggle Switch
- Base: `relative w-12 h-7 bg-white/15 backdrop-blur-[40px] backdrop-saturate-[1.8] rounded-full border border-white/20 transition-all duration-500 ease-out`
- Default: ``

### Slider
- Base: `relative h-2 bg-white/10 backdrop-blur-[40px] rounded-full border border-white/15`
- Default: ``
- Accent: `[&>.fill]:bg-gradient-to-r [&>.fill]:from-[#007AFF] [&>.fill]:to-[#5AC8FA]`

## Forbidden Patterns
These classes must NEVER be used in Apple Liquid Glass style:

- `rounded-none`
- `rounded-sm`
- `rounded`
- `bg-white`
- `bg-black`
- `bg-gray-100`
- `bg-gray-900`
- `shadow-[0px_0px_0px`
- `backdrop-blur-sm`
- `backdrop-blur`

- Pattern: `^rounded-none`
- Pattern: `^rounded-sm$`
- Pattern: `^rounded$`
- Pattern: `^bg-(?!white\/|gradient|transparent)`
- Pattern: `^border-(?!white\/|transparent)`

### Why:
- `rounded-none`: Liquid Glass requires large rounded corners (rounded-[24px] or rounded-3xl)
- `rounded-sm`: Liquid Glass requires large rounded corners (rounded-[24px] or rounded-3xl)
- `bg-white`: Liquid Glass uses semi-transparent backgrounds (bg-white/10 to bg-white/15)

## Do's
- Hero标题使用粗描边 -webkit-text-stroke: 3px #4ecdc4
- Hero标题使用3D偏移阴影 text-shadow: 4px 4px 0 rgba(0,0,0,0.5)
- Hero标题使用渐变填充 bg-gradient-to-r from-[#a855f7] via-[#ff2d92] to-[#a855f7]
- 副标题使用青色发光 text-shadow: 0 0 20px rgba(78, 205, 196, 0.8)
- 使用超高模糊值 backdrop-blur-[40px] 或 backdrop-blur-3xl
- 添加饱和度增强 backdrop-saturate-[1.8] 或 backdrop-saturate-200
- 使用彩虹渐变边框模拟光线折射效果
- 使用超大圆角 rounded-3xl 或 rounded-[24px]
- 使用流体动画 transition-all duration-500 ease-out

## Don'ts
- 禁止使用普通白色标题（必须使用渐变+粗描边+3D阴影）
- 禁止省略3D偏移阴影（4px 4px是必须的）
- 禁止使用细描边（Hero必须3px，h1/h2至少2px）
- 禁止省略文字发光效果（缺少霓虹感）
- 禁止使用低模糊值 backdrop-blur-sm（太弱）
- 禁止省略饱和度增强（颜色会显得暗淡）
- 禁止使用快速过渡（duration-100, duration-150）

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
- Style: liquid-glass
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "Apple 风格控制中心"
- "流动玻璃音乐播放器"
- "流动玻璃登录页面"

---
Generated by StyleKit · https://stylekit.dev
Style: Apple 流动玻璃 (Apple Liquid Glass)