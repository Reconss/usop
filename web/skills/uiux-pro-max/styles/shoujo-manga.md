---
name: shoujo-manga
version: 1.0.0
description: Shoujo Manga design style for web interfaces
keywords: [少女漫画, 樱花, 网点, 花框, 缎带]
author: StyleKit
style_type: visual
---

# Shoujo Manga Style

## Overview
少女漫画特有的浪漫美学，网点纹理背景、花朵框线装饰、缎带横幅标题、多角星闪光效果、蕾丝边框和爱心元素，以粉色主色调呈现梦幻柔美的视觉体验。

## Philosophy
Shoujo Manga 风格源于日本少女漫画的经典视觉语言，以浪漫、梦幻、柔美为核心。

## Design Tokens

### Border
- Width: `border-2`
- Color: `border-[#ffb7c5]/20`
- Radius: `rounded-2xl`

### Shadow
- Small: `shadow-[0_2px_10px_#ffb7c520]`
- Medium: `shadow-[0_4px_15px_#ffb7c530]`
- Large: `shadow-[0_4px_20px_#ffb7c540]`
- Hover: `hover:shadow-[0_8px_30px_#ffb7c540]`

### Typography
- Heading: `font-sans font-bold`
- Body: `font-sans leading-relaxed`
- Hero: `text-5xl md:text-7xl lg:text-8xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#fff5f7]`
- Secondary BG: `bg-white`
- Primary Text: `text-[#4a5568]`
- Primary Button: `bg-[#ffb7c5] text-white shadow-[0_4px_15px_#ffb7c560]`

## Component Recipes

### Button
- Base: `font-sans font-medium rounded-full transition-all duration-300 ease-in-out`
- Sakura: `bg-[#ffb7c5] text-white shadow-[0_4px_15px_#ffb7c560]`
- Lavender: `bg-[#c4b5fd] text-white shadow-[0_4px_15px_#c4b5fd60]`
- Gold: `bg-[#fde68a] text-[#4a5568] shadow-[0_4px_15px_#fde68a60]`
- Rose: `bg-[#fecdd3] text-[#4a5568] shadow-[0_2px_10px_#fecdd320]`
- Outline: `bg-transparent text-[#ffb7c5] border-2 border-[#ffb7c5]/40`

- Hover: `hover:scale-105 hover:shadow-[0_6px_20px_#ffb7c580]`

### Card
- Base: `bg-[#fff5f7] rounded-2xl border-2 border-[#ffb7c5]/20 shadow-[0_4px_20px_#ffb7c520] transition-all duration-300 ease-in-out relative overflow-hidden`
- Default: ``
- Lavender: `border-[#c4b5fd]/25 shadow-[0_4px_20px_#c4b5fd20]`
- Gold: `border-[#fde68a]/35 shadow-[0_4px_20px_#fde68a30]`
- Manga Panel: `bg-white/80 border-2 border-[#ffb7c5]/15 rounded-3xl`

- Hover: `hover:shadow-[0_8px_30px_#ffb7c540] hover:border-[#ffb7c5]/35`

### Input
- Base: `w-full rounded-full border border-[#ffb7c5]/25 bg-[#fff5f7] text-[#4a5568] placeholder:text-[#ffb7c5]/40 font-sans focus:outline-none transition-all duration-300 ease-in-out`
- Default: ``
- Lavender: `border-[#c4b5fd]/25 placeholder:text-[#c4b5fd]/40`
- White: `bg-white border-[#ffb7c5]/30`

### Sakura Badge
- Base: `inline-flex items-center justify-center [clip-path:polygon(50%_0%,65%_35%,100%_40%,75%_65%,80%_100%,50%_80%,20%_100%,25%_65%,0%_40%,35%_35%)] font-sans font-medium transition-all duration-300 ease-in-out`
- Pink: `bg-gradient-to-br from-[#ffb7c5] to-[#fecdd3] text-white shadow-[0_2px_10px_#ffb7c540]`
- Lavender: `bg-gradient-to-br from-[#c4b5fd] to-[#ddd6fe] text-white shadow-[0_2px_10px_#c4b5fd40]`
- Gold: `bg-gradient-to-br from-[#fde68a] to-[#fef3c7] text-[#4a5568] shadow-[0_2px_10px_#fde68a40]`

- Hover: `hover:scale-110 hover:shadow-[0_4px_15px_#ffb7c560]`

### Sparkle Panel
- Base: `bg-[#fff5f7] rounded-2xl border-2 border-[#ffb7c5]/25 shadow-[0_0_20px_#ffb7c515,0_0_40px_#c4b5fd10] bg-[radial-gradient(circle_2px_at_20%_30%,rgba(255,182,193,0.4)_0%,transparent_100%),radial-gradient(circle_1.5px_at_70%_20%,rgba(255,182,193,0.3)_0%,transparent_100%),radial-gradient(circle_2px_at_50%_70%,rgba(255,182,193,0.35)_0%,transparent_100%)] transition-all duration-300 ease-in-out relative`
- Default: ``
- Romantic: `border-[#fecdd3]/40 shadow-[0_0_20px_#fecdd320,0_0_40px_#ffb7c510]`
- Dreamy: `border-[#c4b5fd]/30 shadow-[0_0_20px_#c4b5fd20,0_0_40px_#fde68a10]`

- Hover: `hover:shadow-[0_0_25px_#ffb7c530,0_0_50px_#c4b5fd20] hover:border-[#ffb7c5]/40`

### Ribbon Banner
- Base: `inline-flex items-center justify-center font-sans font-semibold px-6 py-2 rounded-none [clip-path:polygon(8px_0%,calc(100%-8px)_0%,100%_50%,calc(100%-8px)_100%,8px_100%,0%_50%)] relative transition-all duration-300 ease-in-out`
- Pink: `bg-[#ffb7c5] text-white shadow-[0_3px_10px_#ffb7c540] shadow-[0_3px_0_rgba(0,0,0,0.1)]`
- Lavender: `bg-[#c4b5fd] text-white shadow-[0_3px_10px_#c4b5fd40] shadow-[0_3px_0_rgba(0,0,0,0.1)]`
- Gold: `bg-[#fde68a] text-[#4a5568] shadow-[0_3px_10px_#fde68a40] shadow-[0_3px_0_rgba(0,0,0,0.1)]`

- Hover: `hover:scale-105 hover:shadow-[0_5px_15px_#ffb7c560]`

### Heart Progress
- Base: `w-full h-4 rounded-full bg-[#fff5f7] border border-[#ffb7c5]/20 overflow-hidden relative bg-[repeating-linear-gradient(90deg,transparent_0px,transparent_8px,rgba(255,182,193,0.2)_8px,rgba(255,182,193,0.2)_10px)] transition-all duration-300 ease-in-out`
- Love: `[&>div]:bg-gradient-to-r [&>div]:from-[#ffb7c5] [&>div]:to-[#fecdd3] shadow-[0_2px_8px_#ffb7c520]`
- Friendship: `[&>div]:bg-gradient-to-r [&>div]:from-[#c4b5fd] [&>div]:to-[#ddd6fe] shadow-[0_2px_8px_#c4b5fd20]`
- Magic: `[&>div]:bg-gradient-to-r [&>div]:from-[#fde68a] [&>div]:to-[#ffb7c5] shadow-[0_2px_8px_#fde68a20]`

### Flow Frame
- Base: `bg-white/60 rounded-3xl border-2 border-double border-[#ffb7c5]/25 shadow-[0_4px_20px_#ffb7c515,inset_0_0_0_4px_rgba(255,182,193,0.15)] bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(255,183,197,0.06)_8px,rgba(255,183,197,0.06)_10px)] transition-all duration-300 ease-in-out relative`
- Default: ``
- Sakura: `border-[#ffb7c5]/40 shadow-[0_4px_20px_#ffb7c525]`
- Rose: `border-[#fecdd3]/50 shadow-[0_4px_20px_#fecdd325]`

- Hover: `hover:border-[#ffb7c5]/50 hover:shadow-[0_6px_25px_#ffb7c530]`

## Forbidden Patterns
These classes must NEVER be used in Shoujo Manga style:

- `rounded-none`
- `rounded-sm`
- `border-4`
- `border-8`
- `font-mono`
- `bg-black`
- `bg-[#0a0a0a]`
- `bg-gray-900`
- `bg-slate-900`
- `shadow-[3px_3px`

- Pattern: `^rounded-(?:none|sm)$`
- Pattern: `^border-(?:4|8)$`
- Pattern: `^font-mono$`
- Pattern: `^bg-(?:black|gray-900|slate-900|\[#0a0a0a\])$`
- Pattern: `^shadow-\[\d+px_\d+px_0px`

### Why:
- `rounded-none`: Shoujo Manga uses soft rounded shapes (rounded-full, rounded-2xl, rounded-3xl)
- `border-4`: Shoujo Manga uses subtle borders (border or border-2), not heavy ones
- `font-mono`: Shoujo Manga uses rounded sans-serif fonts exclusively

## Do's
- 使用粉色系作为主色调（樱花粉 #ffb7c5）
- 添加网点纹理背景 screentone（radial-gradient 实现圆点图案）
- 使用花朵图标 Flower2 作为面板边角装饰
- 使用缎带横幅（ribbon banner with clip-path tails）作为章节标题
- 添加多角星闪光效果（金色 #fde68a 圆点带 glow shadow）
- 使用蕾丝 scallop 边框（radial-gradient 实现波浪边缘）
- 使用圆角设计（rounded-full 按钮, rounded-2xl 卡片, rounded-3xl 面板）
- 保持浅色背景（珍珠白 #fff5f7, 白色 #ffffff）
- 使用漫画分格的不对称网格排版（grid-cols-12 span 混合）
- 交互采用柔和膨胀和粉色大光晕，模拟少女漫画心跳感（Dokidoki Bounce）
- 网点纹理在 hover 时可微幅提亮或轻微位移，增强翻页感
- active 状态使用柔软回弹和低冲击反馈，保持梦幻基调

## Don'ts
- 禁止使用深色或暗色调背景
- 禁止使用野蛮主义风格的粗边框
- 禁止使用等宽字体 font-mono
- 禁止使用强烈的硬阴影或 RGB 分离阴影
- 禁止使用纯黑背景或深灰背景
- 禁止使用短促生硬的 100ms 动画和机械下沉反馈
- 禁止用高对比硬光代替柔焦粉彩阴影

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
- Style: shoujo-manga
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "少女漫画角色页"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 少女漫画风 (Shoujo Manga)