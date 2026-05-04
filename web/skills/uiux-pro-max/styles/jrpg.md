---
name: jrpg
version: 1.0.0
description: JRPG design style for web interfaces
keywords: [RPG, 菜单, 属性, 道具栏, 奇幻]
author: StyleKit
style_type: visual
---

# JRPG Style

## Overview
经典日式 RPG 菜单与对话框美学，斜面边框、渐变背景、状态栏、华丽框架。适合游戏界面、互动叙事、奇幻风格产品。

## Philosophy
JRPG 风格源自经典日式角色扮演游戏的菜单与 UI 设计，通过斜面边框、渐变背景和精致框架重现复古游戏体验。

## Design Tokens

### Border
- Width: `border-2`
- Color: `border-blue-700`
- Radius: `rounded-md`

### Shadow
- Small: `shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_1px_2px_rgba(0,0,0,0.3)]`
- Medium: `shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_2px_4px_rgba(0,0,0,0.5)]`
- Large: `shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_12px_rgba(0,0,0,0.6)]`
- Hover: `shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_8px_rgba(0,0,0,0.4)]`

### Typography
- Heading: `font-bold`
- Body: `font-sans`
- Hero: `text-3xl md:text-5xl lg:text-7xl`
- H1: `text-2xl md:text-4xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20`
- Container: `px-4 md:px-8`
- Card: `p-4 md:p-6`

### Colors
- Primary BG: `bg-[#0f172a]`
- Secondary BG: `bg-slate-900`
- Primary Text: `text-[#f0f9ff]`
- Primary Button: `bg-gradient-to-b from-blue-700 to-blue-900 text-[#f0f9ff]`

## Component Recipes

### Button
- Base: `font-bold tracking-wide rounded-md border-2 transition-all duration-200`
- Primary: `bg-gradient-to-b from-blue-700 to-blue-900 text-[#f0f9ff] border-blue-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_2px_4px_rgba(0,0,0,0.5)]`
- Gold: `bg-gradient-to-b from-yellow-500 to-yellow-700 text-slate-900 border-yellow-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_2px_4px_rgba(0,0,0,0.5)]`
- Outline: `bg-slate-900/80 text-blue-300 border-blue-400/60 shadow-[0_2px_4px_rgba(0,0,0,0.3)]`

- Hover: `hover:brightness-110 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_8px_rgba(0,0,0,0.4)]`

### Card
- Base: `bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-blue-700 rounded-md ring-1 ring-blue-400/20 transition-all duration-200 relative`
- Default: `shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_4px_12px_rgba(0,0,0,0.5)]`
- Gold: `border-[#fbbf24]/60 ring-[#fbbf24]/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_4px_12px_rgba(0,0,0,0.5)]`
- Status Panel: `bg-gradient-to-b from-slate-900 to-[#0f172a] border-blue-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_4px_12px_rgba(0,0,0,0.6)]`

- Hover: `hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_6px_16px_rgba(0,0,0,0.5)] hover:border-blue-600`

### Input
- Base: `w-full bg-slate-900 border-2 border-blue-700 rounded-md text-[#f0f9ff] placeholder:text-blue-300/30 focus:outline-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] transition-all duration-200`
- Default: ``
- Gold: `border-[#fbbf24]/40 text-[#fbbf24] placeholder:text-[#fbbf24]/30`

### Status Window
- Base: `bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-blue-600 rounded-md ring-2 ring-blue-400/30 ring-offset-2 ring-offset-slate-900 transition-all duration-200 relative`
- Default: `text-[#f0f9ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_4px_12px_rgba(0,0,0,0.5)]`
- Dark: `bg-gradient-to-b from-[#0f172a] to-[#020617] border-blue-800 text-blue-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_4px_12px_rgba(0,0,0,0.6)]`
- Golden: `border-[#fbbf24]/60 ring-[#fbbf24]/20 text-[#fbbf24] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_4px_12px_rgba(0,0,0,0.5)]`

- Hover: `hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_6px_16px_rgba(0,0,0,0.5)] hover:border-blue-500`

### Menu List
- Base: `bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-blue-700 rounded-md text-[#f0f9ff] divide-y divide-blue-700/40 transition-all duration-200`
- Default: `p-2 md:p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_4px_12px_rgba(0,0,0,0.5)]`
- Compact: `p-1 md:p-2 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.4)]`
- Wide: `p-3 md:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_6px_16px_rgba(0,0,0,0.5)]`

- Hover: `hover:border-blue-600`

### Gold Frame
- Base: `bg-gradient-to-b from-slate-800 to-slate-900 rounded-md relative transition-all duration-200`
- Gold: `border-2 border-[#fbbf24] ring-1 ring-[#fbbf24]/30 shadow-[inset_0_1px_0_rgba(251,191,36,0.1),0_4px_12px_rgba(251,191,36,0.2)] text-[#fbbf24]`
- Silver: `border-2 border-slate-400 ring-1 ring-slate-300/30 shadow-[inset_0_1px_0_rgba(148,163,184,0.1),0_4px_12px_rgba(148,163,184,0.2)] text-slate-300`
- Bronze: `border-2 border-[#cd7f32] ring-1 ring-[#cd7f32]/30 shadow-[inset_0_1px_0_rgba(205,127,50,0.1),0_4px_12px_rgba(205,127,50,0.2)] text-[#cd7f32]`

- Hover: `hover:shadow-[inset_0_1px_0_rgba(251,191,36,0.2),0_6px_20px_rgba(251,191,36,0.3)]`

## Forbidden Patterns
These classes must NEVER be used in JRPG style:

- `bg-white`
- `bg-gray-50`
- `bg-slate-50`
- `shadow-sm`
- `shadow-md`
- `shadow-lg`
- `rounded-full`
- `rounded-3xl`
- `border-0`

- Pattern: `^bg-white`
- Pattern: `^bg-gray-[1-3]`
- Pattern: `^bg-slate-[1-3]`
- Pattern: `^shadow-(?!\[)`
- Pattern: `^rounded-full`

### Why:
- `bg-white`: JRPG uses dark navy backgrounds only
- `shadow-md`: Use inset/beveled shadows: shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]
- `rounded-full`: RPG buttons use subtle rounding (rounded-md max)

## Do's
- 背景使用深海军蓝 bg-[#0f172a] 或 bg-slate-900
- 使用 border-2 border-[#1e40af] 搭配内阴影模拟斜面效果
- 金色高亮文字 text-[#fbbf24] 用于标题和重要信息
- 使用渐变背景 bg-gradient-to-b from-blue-900 to-slate-900
- 状态栏使用 bg-[#22c55e] 表示 HP，bg-blue-500 表示 MP
- 卡片面板使用双层边框 ring-1 ring-blue-400/20 border-2 border-blue-800
- 按钮使用内阴影 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] 模拟凸起
- 菜单交互使用硬切反馈（duration-75 到 120）模拟手柄选中节奏

## Don'ts
- 禁止使用极简扁平风格（无边框、无阴影）
- 禁止使用白色或浅色背景
- 禁止仅使用现代无衬线字体（需搭配衬线或像素字体）
- 禁止使用圆角过大 rounded-full 的按钮
- 禁止使用透明/无底色的面板
- 禁止使用低对比度配色
- 禁止使用慢速网页化过渡（duration-300+）稀释游戏菜单手感

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
- Style: jrpg
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "角色状态界面"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 日式RPG (JRPG)