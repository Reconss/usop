---
name: visual-novel
version: 1.0.0
description: Visual Novel design style for web interfaces
keywords: [视觉小说, ADV对话框, 铭牌, 立绘, 选项]
author: StyleKit
style_type: visual
---

# Visual Novel Style

## Overview
借鉴ADV视觉小说游戏UI的设计风格，半透明对话框面板、角色铭牌徽章、装饰性边角框线、分支选项按钮和存档界面，打造沉浸式交互故事体验。

## Philosophy
Visual Novel 风格源于日本ADV（Adventure）视觉小说游戏的UI设计，强调叙事沉浸感和角色互动。

## Design Tokens

### Border
- Width: `border`
- Color: `border-[#4a5568]/10`
- Radius: `rounded-lg`

### Shadow
- Small: `shadow-sm`
- Medium: `shadow-md`
- Large: `shadow-lg`
- Hover: `hover:shadow-lg`

### Typography
- Heading: `font-serif font-medium`
- Body: `font-sans leading-relaxed`
- Hero: `text-4xl md:text-6xl lg:text-7xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#f7fafc]`
- Secondary BG: `bg-white/70`
- Primary Text: `text-[#4a5568]`
- Primary Button: `bg-[#6366f1] text-white shadow-sm hover:bg-[#6366f1]/90 hover:shadow-[0_0_15px_#6366f130]`

## Component Recipes

### Button
- Base: `font-sans font-medium rounded-lg transition-all duration-300 ease-in-out`
- Primary: `bg-[#6366f1] text-white shadow-sm border border-[#6366f1]/20`
- Secondary: `bg-white/[0.06] text-white/70 border border-white/10 backdrop-blur-sm`
- Choice: `bg-white/50 text-[#4a5568] border border-[#6366f1]/25 backdrop-blur-sm text-left`
- Pink: `bg-[#ec4899] text-white shadow-sm border border-[#ec4899]/20`

- Hover: `hover:bg-[#6366f1]/10 hover:border-[#6366f1]/40 hover:shadow-[0_0_15px_#6366f115]`

### Card
- Base: `rounded-lg backdrop-blur-md shadow-sm transition-all duration-300 ease-in-out relative`
- Light: `bg-white/70 border border-[#4a5568]/10`
- Dialog: `bg-[#1a202c]/85 border border-[#6366f1]/20`
- Narrator: `bg-white/50 border border-[#4a5568]/10`
- Scene Card: `bg-white/70 border border-[#6366f1]/15 overflow-hidden`

- Hover: `hover:shadow-lg hover:border-[#6366f1]/30`

### Input
- Base: `w-full rounded-lg font-sans backdrop-blur-sm focus:outline-none transition-all duration-300 ease-in-out`
- Light: `bg-white/70 border border-[#4a5568]/20 text-[#4a5568] placeholder:text-[#4a5568]/40`
- Dark: `bg-white/[0.06] border border-[#6366f1]/20 text-white placeholder:text-white/25`
- Pink: `bg-white/[0.06] border border-[#ec4899]/20 text-white placeholder:text-white/25`

### Dialogue Box
- Base: `rounded-lg backdrop-blur-md p-5 md:p-8 font-sans transition-all duration-300 ease-in-out relative`
- Default: `bg-[#1a202c]/85 border border-[#6366f1]/20 text-white/90`
- Narrator: `bg-white/50 border border-[#4a5568]/10 text-[#4a5568] italic`
- Thought: `bg-[#6366f1]/15 border border-[#6366f1]/25 text-white/80 italic`

- Hover: `hover:border-[#6366f1]/35`

### Choice Panel
- Base: `rounded-lg backdrop-blur-sm px-5 py-3 md:px-6 md:py-4 font-sans cursor-pointer transition-all duration-300 ease-in-out`
- Default: `bg-white/50 text-[#4a5568] border border-[#6366f1]/20`
- Highlighted: `bg-[#6366f1]/20 text-white border border-[#6366f1]/40 shadow-[0_0_15px_#6366f120]`
- Locked: `bg-white/20 text-white/40 border border-white/10 cursor-not-allowed`

- Hover: `hover:bg-[#6366f1]/15 hover:border-[#6366f1]/35 hover:shadow-[0_0_12px_#6366f115]`

### Character Slot
- Base: `rounded-lg overflow-hidden transition-all duration-500 ease-in-out relative`
- Default: `border-2 border-white/15 shadow-[0_4px_20px_rgba(0,0,0,0.3)]`
- Active: `border-2 border-[#6366f1]/40 shadow-[0_4px_25px_#6366f130] brightness-110`
- Faded: `border-2 border-white/5 opacity-50 grayscale-[30%]`

- Hover: `hover:border-[#6366f1]/30 hover:shadow-[0_6px_25px_#6366f120]`

### Save Slot Card
- Base: `rounded-lg backdrop-blur-md p-4 md:p-5 font-sans cursor-pointer transition-all duration-300 ease-in-out relative`
- Default: `bg-[#1a202c]/70 border border-[#6366f1]/15 text-white/80`
- Empty: `bg-white/[0.04] border border-dashed border-white/15 text-white/30`
- Current: `bg-[#6366f1]/15 border border-[#6366f1]/30 text-white/90 shadow-[0_0_15px_#6366f115]`

- Hover: `hover:border-[#6366f1]/30 hover:shadow-[0_0_12px_#6366f115]`

### Scene Fade
- Base: `inset-0 flex items-center justify-center transition-all duration-700 ease-in-out`
- Fade Black: `bg-black/80 text-white/60`
- Fade White: `bg-white/90 text-[#4a5568]/60`
- Dissolve: `bg-[#6366f1]/30 backdrop-blur-lg text-white/70`

## Forbidden Patterns
These classes must NEVER be used in Visual Novel style:

- `border-4`
- `border-8`
- `rounded-none`
- `font-mono`
- `shadow-[3px_0_`
- `shadow-[0_0_30px`
- `bg-[#0a0a0a]`
- `bg-black`
- `text-[#00ffff]`
- `text-[#ff00ff]`

- Pattern: `^border-(?:4|8)$`
- Pattern: `^rounded-none$`
- Pattern: `^font-mono$`
- Pattern: `^shadow-\[\d+px_0_#`
- Pattern: `^bg-(?:black|\[#0a0a0a\])$`

### Why:
- `border-4`: Visual Novel uses subtle, thin borders for its elegant aesthetic
- `rounded-none`: Visual Novel uses rounded-lg for soft UI panels, never sharp edges
- `font-mono`: Visual Novel uses serif for narrative text and sans-serif for UI, not monospace

## Do's
- 使用半透明暗色面板 bg-[#1a202c]/85 作为对话框
- 使用半透明亮色面板 bg-white/70 作为信息卡片
- 所有面板添加毛玻璃效果 backdrop-blur-md
- 使用衬线字体 font-serif 用于叙事/对话文本
- 使用无衬线字体 font-sans 用于UI标签和按钮
- 添加角色铭牌徽章（彩色小标签 inline-block px-3 py-0.5 bg-[color] rounded-sm）
- 对话面板添加L形装饰边角（border-l/t/r/b 组合）
- 使用圆角 rounded-lg 保持柔和界面感

## Don'ts
- 禁止使用粗重的野蛮主义边框（border-4+）
- 禁止使用霓虹灯 RGB 分离阴影效果
- 禁止使用像素艺术风格或等宽字体用于主内容
- 禁止使用纯黑背景 bg-black
- 禁止使用全大写加宽字距的终端风格文字

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
- Style: visual-novel
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "视觉小说对话页面"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 视觉小说风 (Visual Novel)