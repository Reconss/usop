---
name: claude-style
version: 1.0.0
description: Claude Inspired Design System - Anthropic's AI assistant. Warm terracotta accent, clean editorial layout.
keywords: [Claude, AI, 助手, 陶土色, 编辑, 温暖]
author: Design Kungfu
style_type: visual
---

# Claude Style

## Overview
Claude 风格以 Anthropic 的 AI 助手为核心，通过温暖的陶土色强调和干净的编辑布局，打造知性友好的 AI 产品体验。适合 AI 聊天界面、温暖编辑布局和知性产品页面。

## Philosophy
Claude Style 是一种源于 Claude 的知性友好设计风格，以其标志性的陶土色和编辑风格的排版著称。通过温暖的配色、清晰的层次和专业的视觉语言，传达智能和可信赖。

## Design Tokens

### Border
- Width: `border`
- Color: `border-gray-200`
- Radius: `rounded-lg`

### Shadow
- Small: `shadow-sm`
- Medium: `shadow-md`
- Large: `shadow-lg`
- Hover: `hover:shadow-md`

### Typography
- Heading: `font-medium text-gray-900`
- Body: `text-gray-600`
- Hero: `text-4xl md:text-6xl font-medium tracking-tight`
- H1: `text-3xl md:text-4xl font-medium`
- Body: `text-base text-gray-600 leading-relaxed`
- Font Family: Seravek, "Gill Sans Nova", Ubuntu, Calibri, sans-serif

### Spacing
- Section: `py-16 md:py-24`
- Container: `px-6 md:px-8 max-w-3xl mx-auto`
- Card: `p-6 md:p-8`

### Colors
- Primary BG: `bg-white`
- Secondary BG: `bg-[#faf9f7]`
- Warm BG: `bg-[#f5f3ef]`
- Primary Text: `text-gray-900`
- Secondary Text: `text-gray-600`
- Muted Text: `text-gray-400`
- Accent: `text-[#d97757]` / `#d97757`
- Accent Hover: `hover:text-[#c46a4a]`
- Border: `border-gray-200`

## Component Recipes

### Button
- Base: `font-medium rounded-lg transition-all duration-200 inline-flex items-center gap-2`
- Primary: `bg-[#d97757] text-white hover:bg-[#c46a4a]`
- Secondary: `bg-white text-gray-900 border border-gray-300 hover:bg-gray-50`
- Ghost: `bg-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100`
- Text: `bg-transparent text-[#d97757] hover:text-[#c46a4a]`

- Hover: `hover:opacity-90`
- Size SM: `h-8 px-3 text-sm`
- Size MD: `h-10 px-4`
- Size LG: `h-12 px-6`

### Card
- Base: `bg-white rounded-lg border border-gray-200 transition-all duration-200`
- Default: ``
- Warm: `bg-[#faf9f7] border-transparent`
- Hover: `hover:border-gray-300`

### Input
- Base: `w-full bg-white rounded-lg border border-gray-300 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#d97757] focus:ring-1 focus:ring-[#d97757]/20 transition-all duration-200`
- Chat: `bg-[#faf9f7] border-0 rounded-full px-4 py-3`

### Heading
- Base: `font-medium text-gray-900`
- Default: `text-gray-900`
- Muted: `text-gray-500`
- Accent: `text-[#d97757]`

### Badge
- Base: `inline-flex items-center font-medium text-xs rounded-md px-2 py-0.5`
- Default: `bg-[#f5f3ef] text-gray-700`
- Accent: `bg-[#d97757]/10 text-[#d97757]`

### Navigation
- Base: `bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 md:px-6 py-3`

### Chat Message
- User: `bg-[#d97757] text-white rounded-2xl rounded-br-md px-4 py-3`
- Assistant: `bg-[#f5f3ef] text-gray-900 rounded-2xl rounded-bl-md px-4 py-3`

## Forbidden Patterns
These classes must NEVER be used in Claude Style style:

- `bg-gradient-to-r from-blue`
- `bg-gradient-to-br from-purple`
- `shadow-2xl`
- `shadow-inner`
- `rounded-2xl`
- `rounded-3xl`
- `font-bold` (use font-medium)
- `text-blue-500`

- Pattern: `^bg-gradient.*from-(?:blue|purple|green)`
- Pattern: `^text-(?:blue|purple|green)-500`
- Pattern: `^font-bold`

### Why:
- `bg-gradient-to-r from-blue`: Claude style uses solid warm colors
- `text-blue-500`: Claude style uses terracotta as accent color
- `font-bold`: Claude style uses font-medium for elegance

## Do's
- 使用温暖的米白色调 #faf9f7 作为背景
- 使用陶土色 #d97757 作为强调色
- 使用中等字重 font-medium 而非粗体
- 使用适中的圆角 rounded-lg
- 使用柔和的阴影
- 使用清晰的层次结构
- 使用编辑风格的排版
- 使用友好的视觉语言

## Don'ts
- 禁止使用冷色调（蓝色、紫色）作为主色
- 禁止使用粗体字重
- 禁止使用过大的圆角
- 禁止使用渐变背景
- 禁止使用过重的阴影
- 禁止忽略排版的优雅性

## Layout Archetypes
- `landing-hero-centered`: Centered headline, subtitle, and CTA.
- `chat-interface`: AI chat interface with message bubbles.
- `editorial-layout`: Editorial-style content layout.
- `documentation`: Documentation with clean typography.
- `landing-saas-pricing`: Complete SaaS pricing page.

## Example Usage

```
Generate a landing page with:
- Style: claude-style
- Archetype: landing-hero-centered
- Sections: hero, features, chat-demo, cta, footer
- Components: heading (hero variant), button (primary, lg), card (warm), chat-message
```

### Example Prompts:
- "AI 聊天界面"
- "知性产品页面"
- "编辑风格网站"
- "温暖色调应用"

---
Design System inspired by Claude · Integrated into Design Kungfu
Style: Claude 风格 (Claude Style)
