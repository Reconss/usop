---
name: ukiyo-e-digital
version: 1.0.0
description: Ukiyo-e Digital design style for web interfaces
keywords: [浮世绘, 木版画, 北斋, 波浪, 和风]
author: StyleKit
style_type: visual
---

# Ukiyo-e Digital Style

## Overview
灵感源自日本浮世绘木版画，以靛蓝、朱红、金叶为主色调，扁平化设计、强烈的轮廓线、波浪纹样和北斋式构图，将传统东方美学融入现代数字界面。

## Philosophy
Ukiyo-e Digital（浮世绘数字风）将江户时代的木版画艺术转化为现代数字设计语言，保留其独特的扁平透视和色彩分区技法。

## Design Tokens

### Border
- Width: `border-2`
- Color: `border-[#1a3055]`
- Radius: `rounded-sm`

### Shadow
- Small: `shadow-[2px_2px_0px_#1a3055]`
- Medium: `shadow-[4px_4px_0px_#1a3055]`
- Large: `shadow-[6px_6px_0px_#1a3055]`
- Hover: `hover:shadow-[6px_6px_0px_#1a3055]`

### Typography
- Heading: `font-bold tracking-wider`
- Body: `font-sans`
- Hero: `text-4xl md:text-6xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#f5f0e1]`
- Secondary BG: `bg-[#1a3055]`
- Primary Text: `text-[#1a3055]`
- Primary Button: `bg-[#d4553a] text-[#f5f0e1] border-2 border-[#1a3055]`

## Component Recipes

### Button
- Base: `font-bold tracking-wider rounded-sm border-2 transition-all duration-300 ease-in-out`
- Primary: `bg-[#d4553a] text-[#f5f0e1] border-[#1a3055] shadow-[3px_3px_0px_#1a3055]`
- Secondary: `bg-[#1a3055] text-[#f5f0e1] border-[#c9a227] shadow-[3px_3px_0px_#c9a227]`
- Outline: `bg-transparent text-[#1a3055] border-[#1a3055] shadow-[3px_3px_0px_#1a3055]`

- Hover: `hover:shadow-[4px_4px_0px_#1a3055] hover:-translate-y-0.5`

### Card
- Base: `bg-[#f5f0e1] rounded-sm border-2 border-[#1a3055] shadow-[4px_4px_0px_#1a3055] transition-all duration-300 ease-in-out`
- Default: ``
- Vermilion: `border-[#d4553a] shadow-[4px_4px_0px_#d4553a]`
- Gold: `border-[#c9a227] shadow-[4px_4px_0px_#c9a227]`

- Hover: `hover:shadow-[6px_6px_0px_#1a3055] hover:border-[#d4553a]`

### Input
- Base: `w-full rounded-sm border-2 border-[#1a3055]/60 bg-[#f5f0e1] text-[#1a3055] placeholder:text-[#1a3055]/40 focus:outline-none transition-all duration-300 ease-in-out`
- Default: ``
- Vermilion: `border-[#d4553a]/60 text-[#d4553a] placeholder:text-[#d4553a]/40`

### Woodblock Panel
- Base: `relative bg-[#f5f0e1] border-3 border-[#1a3055] p-6`
- Default: ``
- Indigo: `bg-[#1a3055] text-[#f5f0e1]`

### Hanko Seal
- Base: `inline-flex items-center justify-center w-12 h-12 bg-[#d4553a] border-2 border-[#8b1a1a] rounded-sm text-[#f5f0e1] font-bold text-lg transform rotate-[-5deg]`
- Default: ``

### Wave Divider
- Base: `relative w-full h-8 overflow-hidden`
- Default: ``

### Ink Progress
- Base: `relative h-4 bg-[#f5f0e1] border-2 border-[#1a3055]`
- Indigo: `[&>.fill]:bg-[#1a3055]`
- Vermilion: `[&>.fill]:bg-[#d4553a]`

### Seasonal Tab
- Base: `px-4 py-2 font-bold tracking-wider border-b-3 transition-all duration-200`
- Spring: `text-[#e8a0b0] border-[#e8a0b0]`
- Summer: `text-[#4a7c59] border-[#4a7c59]`
- Autumn: `text-[#d4553a] border-[#d4553a]`
- Winter: `text-[#1a3055] border-[#1a3055]`

### Brush Heading
- Base: `relative inline-block font-bold text-2xl text-[#1a3055] pb-2`
- Default: ``

### Layered Mountain
- Base: `relative w-full h-32 overflow-hidden`
- Default: ``

## Forbidden Patterns
These classes must NEVER be used in Ukiyo-e Digital style:

- `rounded-full`
- `rounded-2xl`
- `rounded-xl`
- `rounded-lg`
- `bg-gradient-to-r`
- `bg-gradient-to-br`
- `backdrop-blur`
- `backdrop-blur-sm`
- `backdrop-blur-md`
- `shadow-[0_0_16px_rgba`

- Pattern: `^rounded-(?:full|2xl|xl|lg)`
- Pattern: `^bg-gradient`
- Pattern: `^backdrop-blur`
- Pattern: `^shadow-\[0_0_\d+px_rgba`

### Why:
- `rounded-full`: Ukiyo-e uses sharp edges (rounded-sm) to emulate woodblock print
- `bg-gradient-to-r`: Ukiyo-e uses flat solid colors, not gradients
- `backdrop-blur`: Ukiyo-e uses flat opaque surfaces, not transparency effects

## Do's
- 使用靛蓝、朱红、金叶为主色调
- 采用扁平设计和强烈的轮廓线
- 使用硬边阴影模拟版画质感
- 添加波浪和自然纹样装饰
- 米白色为背景营造和纸质感
- 使用粗体文字配合宽字距
- hover 采用木版错位：硬边偏移阴影 + 小幅位移，不用任何模糊
- active 模拟印章按压：取消阴影并切换朱红边框/文字反馈
- 交互节奏保持短促硬切（duration-75~100, ease-linear）

## Don'ts
- 禁止使用渐变阴影或柔和模糊
- 禁止使用透明度和玻璃效果
- 禁止使用西式圆角和圆形按钮
- 禁止使用霓虹色或高饱和度现代色彩
- 禁止弹簧式回弹和现代 App 的丝滑动效
- 禁止软阴影与 glassmorphism 破坏木版硬朗质感

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
- Style: ukiyo-e-digital
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "浮世绘风展示页"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 浮世绘数字风 (Ukiyo-e Digital)