---
name: figma-style
version: 1.0.0
description: Figma Inspired Design System - Collaborative design tool. Vibrant multi-color, playful yet professional.
keywords: [Figma, 设计工具, 协作, 多彩, 专业, 创意]
author: Design Kungfu
style_type: visual
---

# Figma Style

## Overview
Figma 风格以协作设计工具为核心，通过活力多彩的配色和有趣而专业的视觉语言，打造创意协作的产品体验。适合设计工具营销、多彩活力 UI 和协作平台。

## Philosophy
Figma Style 是一种源于 Figma 的创意专业设计风格，以其标志性的多彩配色和友好的界面著称。通过活泼的色彩、清晰的层次和协作友好的视觉语言，传达创造力和团队精神。

## Design Tokens

### Border
- Width: `border`
- Color: `border-gray-200`
- Radius: `rounded-lg`

### Shadow
- Small: `shadow-sm`
- Medium: `shadow-md`
- Large: `shadow-lg`
- Hover: `hover:shadow-lg`

### Typography
- Heading: `font-bold text-gray-900`
- Body: `text-gray-600`
- Hero: `text-4xl md:text-6xl font-bold`
- H1: `text-3xl md:text-4xl font-bold`
- Body: `text-base text-gray-600`
- Font Family: Inter, sans-serif

### Spacing
- Section: `py-16 md:py-24`
- Container: `px-6 md:px-8 max-w-6xl mx-auto`
- Card: `p-6 md:p-8`

### Colors
- Primary BG: `bg-white`
- Secondary BG: `bg-gray-50`
- Primary Text: `text-gray-900`
- Secondary Text: `text-gray-600`
- Muted Text: `text-gray-400`
- Figma Red: `#f24e1e`
- Figma Orange: `#ff7262`
- Figma Yellow: `#a259ff`
- Figma Green: `#1abcfe`
- Figma Blue: `#0acf83`
- Multi-gradient: `from-[#f24e1e] via-[#ff7262] via-[#a259ff] via-[#1abcfe] to-[#0acf83]`
- Border: `border-gray-200`

## Component Recipes

### Button
- Base: `font-semibold rounded-lg transition-all duration-200 inline-flex items-center gap-2`
- Primary: `bg-black text-white hover:bg-gray-800`
- Secondary: `bg-white text-black border border-gray-300 hover:bg-gray-50`
- Ghost: `bg-transparent text-gray-600 hover:text-black hover:bg-gray-100`
- Multi: `bg-gradient-to-r from-[#f24e1e] via-[#ff7262] via-[#a259ff] via-[#1abcfe] to-[#0acf83] text-white`

- Hover: `hover:opacity-90`
- Size SM: `h-8 px-3 text-sm`
- Size MD: `h-10 px-4`
- Size LG: `h-12 px-6`

### Card
- Base: `bg-white rounded-lg border border-gray-200 transition-all duration-200`
- Default: ``
- Colored: `bg-gradient-to-br from-[#f24e1e]/5 to-[#a259ff]/5 border-transparent`
- Hover: `hover:shadow-lg hover:border-gray-300`

### Input
- Base: `w-full bg-white rounded-lg border border-gray-300 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black/20 transition-all duration-200`
- Default: ``

### Heading
- Base: `font-bold text-gray-900`
- Default: `text-gray-900`
- Muted: `text-gray-500`
- Multi: `bg-gradient-to-r from-[#f24e1e] via-[#ff7262] via-[#a259ff] via-[#1abcfe] to-[#0acf83] bg-clip-text text-transparent`

### Badge
- Base: `inline-flex items-center font-medium text-xs rounded px-2 py-0.5`
- Default: `bg-gray-100 text-gray-700`
- Red: `bg-[#f24e1e]/10 text-[#f24e1e]`
- Purple: `bg-[#a259ff]/10 text-[#a259ff]`
- Blue: `bg-[#1abcfe]/10 text-[#1abcfe]`
- Green: `bg-[#0acf83]/10 text-[#0acf83]`

### Navigation
- Base: `bg-white border-b border-gray-200 px-4 md:px-6 py-3`

## Forbidden Patterns
These classes must NEVER be used in Figma Style style:

- `shadow-2xl`
- `shadow-inner`
- `rounded-2xl`
- `rounded-3xl`
- `border-2`
- `border-4`

- Pattern: `^shadow-2xl`
- Pattern: `^rounded-(?:2xl|3xl|full)`
- Pattern: `^border-(?:2|4)`

### Why:
- `shadow-2xl`: Figma style uses subtle shadows
- `rounded-2xl`: Figma style uses rounded-lg for consistency
- `border-2`: Figma style uses thin borders

## Do's
- 使用 Figma 五色作为品牌色彩
- 使用多彩渐变作为装饰元素
- 使用清晰的层次结构
- 使用适中的圆角 rounded-lg
- 使用友好的视觉语言
- 使用白色背景为主
- 使用黑色作为主要按钮色

## Don'ts
- 禁止使用过大的圆角
- 禁止使用过重的阴影
- 禁止使用过粗的边框
- 禁止忽略多彩品牌元素
- 禁止使用过暗的背景

## Layout Archetypes
- `landing-hero-centered`: Centered headline, subtitle, and CTA.
- `feature-showcase`: Feature showcase with colorful illustrations.
- `collaboration-demo`: Real-time collaboration interface demo.
- `template-gallery`: Template gallery grid layout.
- `landing-saas-pricing`: Complete SaaS pricing page.

## Example Usage

```
Generate a landing page with:
- Style: figma-style
- Archetype: landing-hero-centered
- Sections: hero, features, collaboration-demo, cta, footer
- Components: heading (hero variant), button (primary, lg), card (colored)
```

### Example Prompts:
- "设计工具营销页"
- "协作平台界面"
- "创意产品网站"
- "多彩活力设计"

---
Design System inspired by Figma · Integrated into Design Kungfu
Style: Figma 风格 (Figma Style)
