---
name: raycast-style
version: 1.0.0
description: Raycast Inspired Design System - Productivity launcher. Sleek dark chrome, vibrant gradient accents.
keywords: [Raycast, 效率工具, 启动器, 深色, 渐变, 生产力]
author: Design Kungfu
style_type: visual
---

# Raycast Style

## Overview
Raycast 风格以生产力启动器为核心，通过时尚的深色 Chrome 界面和活力渐变强调色，打造高效的工具体验。适合生产力工具、深色高级 UI 和渐变强调设计。

## Philosophy
Raycast Style 是一种源于 Raycast 的效率优先设计风格，以其标志性的深色界面和渐变强调色著称。通过简洁的命令界面、流畅的动画和专业的视觉语言，传达效率和力量。

## Design Tokens

### Border
- Width: `border`
- Color: `border-gray-800`
- Radius: `rounded-xl`

### Shadow
- Small: `shadow-none`
- Medium: `shadow-lg shadow-black/30`
- Large: `shadow-xl shadow-black/40`
- Glow: `shadow-[0_0_30px_rgba(255,92,0,0.2)]`

### Typography
- Heading: `font-semibold tracking-tight text-white`
- Body: `text-gray-400`
- Hero: `text-4xl md:text-6xl font-bold tracking-tight`
- H1: `text-3xl md:text-4xl font-semibold tracking-tight`
- Body: `text-base text-gray-400`
- Font Family: Inter, SF Pro, system-ui, sans-serif

### Spacing
- Section: `py-16 md:py-24`
- Container: `px-6 md:px-8 max-w-5xl mx-auto`
- Card: `p-5 md:p-6`

### Colors
- Primary BG: `bg-[#0d0d0d]`
- Secondary BG: `bg-[#1a1a1a]`
- Elevated BG: `bg-[#242424]`
- Chrome BG: `bg-gradient-to-b from-[#2a2a2a] to-[#1a1a1a]`
- Primary Text: `text-white`
- Secondary Text: `text-gray-400`
- Muted Text: `text-gray-500`
- Accent: `text-[#ff5c00]` / `#ff5c00`
- Accent Gradient: `from-[#ff5c00] to-[#ff9500]`
- Border: `border-gray-800`

## Component Recipes

### Button
- Base: `font-medium rounded-xl transition-all duration-200 inline-flex items-center gap-2`
- Primary: `bg-gradient-to-r from-[#ff5c00] to-[#ff9500] text-white hover:opacity-90`
- Secondary: `bg-[#1a1a1a] text-white border border-gray-700 hover:bg-[#242424]`
- Ghost: `bg-transparent text-gray-400 hover:text-white hover:bg-[#1a1a1a]`
- Chrome: `bg-gradient-to-b from-[#3a3a3a] to-[#2a2a2a] text-white border border-gray-700`

- Hover: `hover:opacity-90`
- Size SM: `h-8 px-3 text-sm`
- Size MD: `h-10 px-4`
- Size LG: `h-12 px-6`

### Card
- Base: `bg-[#1a1a1a] rounded-xl border border-gray-800 transition-all duration-200`
- Default: ``
- Chrome: `bg-gradient-to-b from-[#242424] to-[#1a1a1a] border-gray-700`
- Hover: `hover:border-gray-700 hover:bg-[#242424]`

### Input
- Base: `w-full bg-[#0d0d0d] rounded-xl border border-gray-800 text-white placeholder:text-gray-500 focus:outline-none focus:border-[#ff5c00] focus:ring-1 focus:ring-[#ff5c00]/20 transition-all duration-200`
- Command: `bg-[#1a1a1a] rounded-xl border border-gray-700 text-lg`

### Heading
- Base: `font-semibold tracking-tight text-white`
- Default: `text-white`
- Muted: `text-gray-400`
- Accent: `text-[#ff5c00]`
- Gradient: `bg-gradient-to-r from-[#ff5c00] to-[#ff9500] bg-clip-text text-transparent`

### Badge
- Base: `inline-flex items-center font-medium text-xs rounded-md px-2 py-0.5`
- Default: `bg-[#242424] text-gray-300`
- Accent: `bg-[#ff5c00]/10 text-[#ff5c00]`
- New: `bg-gradient-to-r from-[#ff5c00] to-[#ff9500] text-white`

### Navigation
- Base: `bg-[#0d0d0d]/90 backdrop-blur-md border-b border-gray-800 px-4 md:px-6 py-3`

### Command Palette
- Base: `bg-[#1a1a1a] rounded-2xl border border-gray-700 shadow-2xl overflow-hidden`
- Input: `bg-transparent border-0 text-white text-lg px-4 py-3`
- Item: `px-4 py-2 hover:bg-[#242424] cursor-pointer flex items-center gap-3`
- Selected: `bg-[#ff5c00]/10 text-[#ff5c00]`

## Forbidden Patterns
These classes must NEVER be used in Raycast Style style:

- `bg-white`
- `text-black`
- `bg-gradient-to-r from-blue`
- `bg-gradient-to-br from-purple`
- `rounded-full`
- `shadow-2xl` (except command palette)
- `border-gray-200`

- Pattern: `^bg-white`
- Pattern: `^text-black`
- Pattern: `^border-gray-(?:100|200|300)`

### Why:
- `bg-white`: Raycast style uses dark backgrounds exclusively
- `text-black`: Raycast style uses white text on dark backgrounds
- `rounded-full`: Raycast style uses rounded-xl for consistency

## Do's
- 使用深色背景 #0d0d0d 作为主背景
- 使用橙色渐变 #ff5c00 到 #ff9500 作为强调色
- 使用 Chrome 风格的渐变表面
- 使用命令面板风格的交互
- 使用适中的圆角 rounded-xl
- 使用微妙的边框而非阴影来区分元素
- 使用流畅的过渡动画
- 使用专业的视觉语言

## Don'ts
- 禁止使用浅色背景
- 禁止使用非品牌颜色
- 禁止使用过大的圆角
- 禁止使用花哨的装饰元素
- 禁止使用过重的阴影
- 禁止忽略命令式交互

## Layout Archetypes
- `landing-hero-centered`: Centered headline, subtitle, and CTA.
- `command-palette`: Command palette style interface.
- `app-dashboard`: Application dashboard with sidebar.
- `extension-store`: Extension marketplace grid layout.
- `landing-saas-pricing`: Complete SaaS pricing page.

## Example Usage

```
Generate a landing page with:
- Style: raycast-style
- Archetype: landing-hero-centered
- Sections: hero, features, command-demo, cta, footer
- Components: heading (hero variant), button (primary, lg), card (chrome), command-palette
```

### Example Prompts:
- "生产力工具界面"
- "启动器应用"
- "开发者工具"
- "命令面板设计"

---
Design System inspired by Raycast · Integrated into Design Kungfu
Style: Raycast 风格 (Raycast Style)
