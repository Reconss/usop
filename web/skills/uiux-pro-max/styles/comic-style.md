---
name: comic-style
version: 1.0.0
description: Comic Style design style for web interfaces
keywords: [漫画, manga, 网点, 对话气泡, 分镜]
author: StyleKit
style_type: visual
---

# Comic Style Style

## Overview
灵感源自漫画书和日式漫画的设计风格，浓重的墨线边框、网点填充、对话气泡、动作线和分镜面板布局，充满故事感和视觉冲击力。

## Philosophy
Comic Style 是一种源自漫画书和日式漫画的设计风格，通过浓重的墨线边框、半调网点、对话气泡和动态线条，将界面变成生动的漫画面板。

## Design Tokens

### Border
- Width: `border-4`
- Color: `border-[#1a1a1a]`
- Radius: `rounded-lg`

### Shadow
- Small: `shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] md:shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]`
- Medium: `shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] md:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]`
- Large: `shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] md:shadow-[10px_10px_0px_0px_rgba(26,26,26,1)]`
- Hover: `hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]`

### Typography
- Heading: `font-black uppercase tracking-wide`
- Body: `font-sans font-bold`
- Hero: `text-5xl md:text-7xl lg:text-8xl`
- H1: `text-4xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-10 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-4 md:p-6`

### Colors
- Primary BG: `bg-[#fffef0]`
- Secondary BG: `bg-[#1a1a1a]`
- Primary Text: `text-[#1a1a1a]`
- Primary Button: `bg-[#ef4444] text-white`

## Component Recipes

### Button
- Base: `font-black uppercase tracking-wide border-4 border-[#1a1a1a] rounded-lg transition-all duration-150`
- Primary: `bg-[#ef4444] text-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] md:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]`
- Secondary: `bg-[#3b82f6] text-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] md:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]`
- Outline: `bg-[#fffef0] text-[#1a1a1a] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] md:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]`

- Hover: `hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-[2px] hover:translate-y-[2px]`

### Card
- Base: `bg-[#fffef0] border-4 border-[#1a1a1a] rounded-lg transition-all duration-150`
- Default: `shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] md:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]`
- Action: `shadow-[4px_4px_0px_0px_rgba(239,68,68,1)] md:shadow-[6px_6px_0px_0px_rgba(239,68,68,1)]`
- Highlight: `bg-[#facc15] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] md:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]`

- Hover: `hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-[2px] hover:translate-y-[2px]`

### Input
- Base: `w-full border-4 border-[#1a1a1a] rounded-lg bg-[#fffef0] font-bold text-[#1a1a1a] placeholder:text-[#4a4a4a] focus:outline-none transition-all duration-150`
- Default: ``
- Colored: `bg-[#facc15]/20`

### Speech Bubble
- Base: `bg-[#fffef0] border-4 border-[#1a1a1a] rounded-2xl p-4 md:p-6 relative font-bold transition-all duration-150`
- Speech: `rounded-2xl shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]`
- Thought: `rounded-[50%] shadow-[4px_4px_0px_0px_rgba(26,26,26,0.5)]`
- Shout: `rounded-none bg-[#facc15] shadow-[6px_6px_0px_0px_rgba(239,68,68,1)]`

- Hover: `hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-[2px] hover:translate-y-[2px]`

### Action Panel
- Base: `bg-[#fffef0] border-4 border-[#1a1a1a] rounded-lg relative overflow-hidden bg-[repeating-conic-gradient(#fffef0_0deg,#fffef0_5deg,rgba(26,26,26,0.03)_5deg,rgba(26,26,26,0.03)_10deg)] transition-all duration-150`
- Default: `shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] md:shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]`
- Intense: `bg-[#ef4444]/10 shadow-[6px_6px_0px_0px_rgba(239,68,68,1)]`
- Subtle: `border-2 border-[#1a1a1a] shadow-[3px_3px_0px_0px_rgba(26,26,26,0.5)]`

- Hover: `hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-[2px] hover:translate-y-[2px]`

### Halftone Overlay
- Base: `bg-[#fffef0] border-4 border-[#1a1a1a] rounded-lg p-4 md:p-6 relative overflow-hidden bg-[radial-gradient(circle_1.5px,rgba(26,26,26,0.12)_0%,transparent_100%)] bg-[size:8px_8px] transition-all duration-150`
- Default: `shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]`
- Dense: `bg-[#1a1a1a]/5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]`
- Sparse: `bg-[#1a1a1a]/[0.02] shadow-[3px_3px_0px_0px_rgba(26,26,26,0.6)]`

- Hover: `hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-x-[2px] hover:translate-y-[2px]`

## Forbidden Patterns
These classes must NEVER be used in Comic Style style:

- `border`
- `border-[0.5px]`
- `border-gray-200`
- `border-gray-300`
- `border-slate-200`
- `shadow-sm`
- `shadow`
- `shadow-md`
- `text-gray-400`
- `text-gray-500`

- Pattern: `^border-(?:gray|slate)-`
- Pattern: `^shadow-(?:sm|md|lg|xl)$`
- Pattern: `^text-(?:gray|slate)-(?:[3-5])`
- Pattern: `^bg-(?:gray|slate)-(?:[1-3])`
- Pattern: `^font-(?:light|thin|normal)$`

### Why:
- `border-gray-200`: Comic style uses thick black ink borders (border-4 border-[#1a1a1a])
- `shadow-md`: Comic style uses hard-edge offset shadows, not blurred
- `text-gray-400`: Comic style uses bold high-contrast text, not subtle muted colors

## Do's
- 使用粗黑色边框 border-4 border-black 模拟墨线
- 使用硬边阴影 shadow-[4px_4px_0_#000] 模拟印刷偏移
- 使用对话气泡形状展示信息
- 使用半调网点作为背景纹理
- 文字使用大写粗体 uppercase font-black
- 按钮使用夸张的悬停效果
- hover 时 scale-110 + rotate(-3deg)，像漫画音效气泡弹出
- group-hover 时隐藏的 NEW! 标签从 scale-0 弹出 scale-100
- active 时阴影瞬间归零，制造墨水压迫感
- hover 时背景网点（radial-gradient）浮现（group-hover:opacity-20）

## Don'ts
- 禁止使用过细的边框 border
- 禁止使用渐变作为主要视觉效果
- 禁止使用过于正式的排版
- 禁止缺少动态感和能量感
- 禁止使用圆角（rounded-lg, rounded-xl），对话气泡除外
- 禁止使用过长的 duration（最长 duration-100）

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
- Style: comic-style
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "漫画英雄页面"
- "漫画作品展示"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 漫画风格 (Comic Style)