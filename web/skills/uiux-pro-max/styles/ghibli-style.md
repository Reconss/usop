---
name: ghibli-style
version: 1.0.0
description: Ghibli Style design style for web interfaces
keywords: [吉卜力, 宫崎骏, 手绘, 治愈, 自然]
author: StyleKit
style_type: visual
---

# Ghibli Style Style

## Overview
灵感源自吉卜力工作室动画的设计风格，温暖柔和的色调、手绘质感、自然元素和梦幻氛围，传递治愈与诗意。

## Philosophy
Ghibli Style（吉卜力风格）受日本吉卜力工作室动画影响，以温暖、治愈、富有诗意的视觉语言著称。

## Design Tokens

### Border
- Width: `border`
- Color: `border-[#7cb9a8]/40`
- Radius: `rounded-2xl`

### Shadow
- Small: `shadow-[0_2px_8px_rgba(124,185,168,0.15)]`
- Medium: `shadow-[0_4px_16px_rgba(124,185,168,0.2)]`
- Large: `shadow-[0_8px_32px_rgba(124,185,168,0.25)]`
- Hover: `hover:shadow-[0_8px_24px_rgba(124,185,168,0.3)]`

### Typography
- Heading: `font-sans font-semibold tracking-normal`
- Body: `font-sans`
- Hero: `text-3xl md:text-5xl lg:text-6xl`
- H1: `text-2xl md:text-4xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#f4e4bc]`
- Secondary BG: `bg-[#7cb9a8]`
- Primary Text: `text-[#3a3226]`
- Primary Button: `bg-[#7cb9a8] text-white`

## Component Recipes

### Button
- Base: `font-medium rounded-2xl transition-all duration-300`
- Primary: `bg-[#8B7355] text-white shadow-[0_4px_12px_rgba(139,115,85,0.3)]`
- Secondary: `bg-[#B8860B] text-white shadow-[0_4px_12px_rgba(184,134,11,0.3)]`
- Outline: `bg-transparent text-[#8B7355] border-2 border-[#8B7355]`

- Hover: `hover:shadow-[0_6px_20px_rgba(139,115,85,0.4)] hover:brightness-110`

### Card
- Base: `bg-[#faf5eb] rounded-3xl transition-all duration-300`
- Default: `shadow-[0_4px_20px_rgba(139,115,85,0.15)]`
- Accent: `bg-[#f0e6d3] shadow-[0_4px_20px_rgba(184,134,11,0.15)]`
- Bordered: `border-2 border-[#8B7355]/30 shadow-[0_4px_20px_rgba(139,115,85,0.1)]`

- Hover: `hover:shadow-[0_8px_30px_rgba(139,115,85,0.25)]`

### Input
- Base: `w-full rounded-xl border-2 border-[#8B7355]/30 bg-[#faf5eb] text-[#5a4a3a] placeholder:text-[#8B7355]/40 focus:outline-none transition-all duration-300`
- Default: ``
- Filled: `bg-[#f0e6d3]`

### Forest Panel
- Base: `bg-[#faf5eb] rounded-[40%_60%_55%_45%/50%_45%_55%_50%] border-2 border-[#8B7355]/15 bg-[repeating-linear-gradient(0deg,transparent,transparent_20px,rgba(139,115,85,0.03)_20px,rgba(139,115,85,0.03)_21px)] transition-all duration-300`
- Default: `bg-[linear-gradient(180deg,#c8e6c9_0%,#e8f5e9_35%,#faf5eb_100%)] shadow-[0_8px_32px_rgba(139,115,85,0.12),inset_0_-20px_40px_rgba(139,115,85,0.04)]`
- Enchanted: `bg-[linear-gradient(180deg,#b2dfdb_0%,#e0f2f1_40%,#f1f8e9_100%)] border-[#4caf50]/20 shadow-[0_8px_32px_rgba(76,175,80,0.15),inset_0_0_60px_rgba(76,175,80,0.05)]`
- Autumn: `bg-[linear-gradient(180deg,#ffe0b2_0%,#fff3e0_40%,#faf5eb_100%)] border-[#B8860B]/20 shadow-[0_8px_32px_rgba(184,134,11,0.12),inset_0_-20px_40px_rgba(184,134,11,0.04)]`

- Hover: `hover:shadow-[0_8px_30px_rgba(139,115,85,0.2)]`

### Soot Sprite Badge
- Base: `inline-flex items-center justify-center rounded-[45%_55%_50%_50%/55%_45%_50%_50%] border-2 border-dashed border-current/20 shadow-[inset_-3px_-3px_0_rgba(0,0,0,0.1),2px_2px_0_rgba(139,115,85,0.15)] outline outline-2 outline-offset-2 outline-current/10 transition-all duration-300`
- Dark: `bg-[#3a3a3a] text-white shadow-[0_2px_8px_rgba(0,0,0,0.2)]`
- Dusty: `bg-[#8B7355] text-[#faf5eb] shadow-[0_2px_8px_rgba(139,115,85,0.3)]`
- Sparkle: `bg-[#B8860B] text-white shadow-[0_2px_12px_rgba(184,134,11,0.4)]`

- Hover: `hover:scale-110 hover:shadow-[0_4px_16px_rgba(139,115,85,0.3)]`

### Wind Alert
- Base: `rounded-[4px_20px_4px_20px] border-l-[3px] border-dashed border-[#8B7355]/25 p-4 md:p-5 transition-all duration-300`
- Info: `bg-[linear-gradient(90deg,#e0f2f1_0%,rgba(224,242,241,0.3)_100%)] border-[#4caf50]/40 text-[#2e7d32]`
- Gentle: `bg-[linear-gradient(90deg,#faf5eb_0%,rgba(250,245,235,0.3)_100%)] border-[#8B7355]/30 text-[#5a4a3a]`
- Storm: `bg-[linear-gradient(90deg,#eceff1_0%,rgba(236,239,241,0.3)_100%)] border-[#607d8b]/40 text-[#37474f]`

- Hover: `hover:shadow-[0_4px_16px_rgba(139,115,85,0.15)]`

## Forbidden Patterns
These classes must NEVER be used in Ghibli Style style:

- `rounded-none`
- `border-black`
- `border-2`
- `border-4`
- `shadow-[2px_2px_0px`
- `shadow-[4px_4px_0px`
- `shadow-[8px_8px_0px`
- `bg-[#ff006e]`
- `bg-[#ff71ce]`
- `bg-[#01cdfe]`

- Pattern: `^rounded-none$`
- Pattern: `^shadow-\[\d+px_\d+px_0px`
- Pattern: `^bg-(?:black|\[#(?:ff006e|ff71ce|01cdfe|00ff00)\])`
- Pattern: `^border-(?:black|4)$`

### Why:
- `rounded-none`: Ghibli style uses soft rounded shapes (rounded-2xl) for a warm feel
- `border-black`: Ghibli style uses subtle earth-toned borders, not harsh black
- `shadow-[4px_4px_0px`: Ghibli style uses soft diffused shadows, not hard-edge

## Do's
- 使用柔和温暖的色调
- 添加手绘风格的插图或边框
- 融入自然元素（云、树、花）
- 使用圆润柔和的形状
- 添加微妙的纹理效果
- 创造梦幻般的渐变背景
- 交互动效保持微风感（duration-500 到 700，轻微浮动和小角度旋转）

## Don'ts
- 禁止使用过于锐利的边缘
- 禁止使用高对比的刺眼配色
- 禁止使用冰冷的科技感元素
- 禁止过于复杂的动效
- 禁止快速硬切与突兀的高频动效

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
- Style: ghibli-style
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "治愈系个人博客"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 吉卜力风格 (Ghibli Style)