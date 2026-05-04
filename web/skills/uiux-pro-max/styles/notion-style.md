---
name: notion-style
version: 1.0.0
description: Notion Inspired Design System - All-in-one workspace. Warm minimalism, serif headings, soft surfaces.
keywords: [Notion, 工作空间, 温暖极简, 衬线标题, 柔和, 协作]
author: Design Kungfu
style_type: visual
---

# Notion Style

## Overview
Notion 风格以一体化工作空间为核心，通过温暖极简设计、衬线标题和柔和表面，打造友好亲和的协作产品体验。适合工作空间工具、温暖极简设计和衬线优先的排版。

## Philosophy
Notion Style 是一种源于 Notion 的温暖极简设计风格，以其独特的衬线标题和柔和的视觉元素著称。通过温暖的配色、清晰的层次和友好的交互，传达协作和创造力。

## Design Tokens

### Border
- Width: `border`
- Color: `border-gray-200`
- Radius: `rounded-md`

### Shadow
- Small: `shadow-sm`
- Medium: `shadow-md`
- Large: `shadow-lg`
- Hover: `hover:shadow-md`

### Typography
- Heading Serif: `font-serif font-bold text-gray-900`
- Heading Sans: `font-semibold text-gray-900`
- Body: `text-gray-600`
- Hero: `text-5xl md:text-6xl font-serif font-bold`
- H1: `text-4xl md:text-5xl font-serif font-bold`
- H2: `text-3xl md:text-4xl font-serif font-bold`
- Body: `text-base text-gray-600`
- Font Family Serif: Georgia, "Times New Roman", serif
- Font Family Sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif

### Spacing
- Section: `py-16 md:py-24`
- Container: `px-6 md:px-8 max-w-4xl mx-auto`
- Card: `p-5 md:p-6`

### Colors
- Primary BG: `bg-white`
- Secondary BG: `bg-gray-50`
- Warm BG: `bg-[#f7f6f3]`
- Primary Text: `text-gray-900`
- Secondary Text: `text-gray-600`
- Muted Text: `text-gray-400`
- Accent: `text-[#2eaadc]` / `#2eaadc`
- Accent Hover: `hover:text-[#1a9bc2]`
- Border: `border-gray-200`

## Component Recipes

### Button
- Base: `font-medium rounded-md transition-all duration-200 inline-flex items-center gap-2`
- Primary: `bg-gray-900 text-white hover:bg-gray-800`
- Secondary: `bg-white text-gray-900 border border-gray-300 hover:bg-gray-50`
- Ghost: `bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900`
- Text: `bg-transparent text-gray-600 hover:text-gray-900 underline`

- Hover: `hover:opacity-90`
- Size SM: `h-7 px-3 text-sm`
- Size MD: `h-9 px-4`
- Size LG: `h-11 px-5 text-lg`

### Card
- Base: `bg-white rounded-md border border-gray-200 transition-all duration-200`
- Default: ``
- Elevated: `shadow-sm`
- Warm: `bg-[#f7f6f3] border-transparent`
- Hover: `hover:bg-gray-50 hover:border-gray-300`

### Input
- Base: `w-full bg-white rounded-md border border-gray-300 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#2eaadc] focus:ring-1 focus:ring-[#2eaadc]/20 transition-all duration-200`
- Default: ``

### Heading
- Base Serif: `font-serif font-bold text-gray-900`
- Base Sans: `font-semibold text-gray-900`
- Default: `text-gray-900`
- Muted: `text-gray-500`
- Accent: `text-[#2eaadc]`

### Badge
- Base: `inline-flex items-center font-medium text-xs rounded px-1.5 py-0.5`
- Default: `bg-gray-100 text-gray-700`
- Accent: `bg-[#2eaadc]/10 text-[#2eaadc]`

### Navigation
- Base: `bg-white border-b border-gray-200 px-4 md:px-6 py-3`

### Block/Content
- Base: `bg-white rounded-md border border-gray-200 p-4`
- Hover: `hover:bg-gray-50`

## Forbidden Patterns
These classes must NEVER be used in Notion Style style:

- `bg-gradient-to-r`
- `bg-gradient-to-br`
- `shadow-2xl`
- `shadow-inner`
- `rounded-2xl`
- `rounded-3xl`
- `font-black`

- Pattern: `^bg-gradient`
- Pattern: `^shadow-2xl`
- Pattern: `^rounded-(?:2xl|3xl|full)`

### Why:
- `bg-gradient-to-r`: Notion style uses solid colors, not gradients
- `shadow-2xl`: Notion style uses subtle, soft shadows
- `rounded-2xl`: Notion style uses moderate rounded corners (rounded-md)

## Do's
- 使用温暖的灰白色调 #f7f6f3 作为背景
- 使用衬线字体（Georgia/Times）作为标题
- 使用无衬线字体作为正文
- 使用适中的圆角 rounded-md
- 使用柔和的阴影
- 使用清晰的层次结构
- 使用友好的交互反馈
- 使用 @mentions 和链接的蓝色 #2eaadc

## Don'ts
- 禁止使用渐变背景
- 禁止使用过大的圆角
- 禁止使用过重的阴影
- 禁止使用过于鲜艳的颜色
- 禁止忽略排版层次
- 禁止使用过粗的字体（font-black）

## Layout Archetypes
- `landing-hero-centered`: Centered headline, subtitle, and CTA. Clean and focused.
- `workspace-layout`: Workspace with sidebar navigation and content area.
- `document-editor`: Document-style layout with rich text editing.
- `database-view`: Database-style grid or list view.
- `landing-saas-pricing`: Complete SaaS pricing page with hero, pricing tiers, FAQ, and CTA.

## Example Usage

```
Generate a landing page with:
- Style: notion-style
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "工作空间工具界面"
- "协作文档平台"
- "知识库网站"
- "团队管理工具"

---
Design System inspired by Notion · Integrated into Design Kungfu
Style: Notion 风格 (Notion Style)
